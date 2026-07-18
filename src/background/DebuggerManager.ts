import { RuleEngine } from '../services/RuleEngine';
import { StorageService } from '../services/StorageService';
import { createId, fromBase64, toBase64 } from '../shared/base64';
import type { ApiRule, RequestLogEntry, RuleAction } from '../shared/types';
import { attachDebugger, detachDebugger, sendDebuggerCommand } from './chromeAsync';
import { TransformSandboxClient } from './TransformSandboxClient';

interface FetchRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
}

interface HeaderEntry {
  name: string;
  value: string;
}

interface FetchRequestPausedEvent {
  requestId: string;
  request: FetchRequest;
  resourceType?: string;
  responseStatusCode?: number;
  responseStatusText?: string;
  responseHeaders?: HeaderEntry[];
}

interface ResponseBodyResult {
  body: string;
  base64Encoded: boolean;
}

interface PendingResponseAction {
  rule: ApiRule;
}

export class DebuggerManager {
  private readonly attachedTabs = new Set<number>();
  private readonly pendingResponses = new Map<string, PendingResponseAction>();

  constructor(
    private readonly storage = new StorageService(),
    private readonly sandbox = new TransformSandboxClient()
  ) {
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (typeof source.tabId !== 'number' || method !== 'Fetch.requestPaused') {
        return;
      }

      void this.handleRequestPaused(source.tabId, params as FetchRequestPausedEvent);
    });

    chrome.debugger.onDetach.addListener((source) => {
      if (typeof source.tabId === 'number') {
        this.attachedTabs.delete(source.tabId);
        void this.storage.setTabState({
          tabId: source.tabId,
          enabled: false,
          attached: false,
          updatedAt: Date.now()
        });
      }
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.attachedTabs.delete(tabId);
      void this.storage.removeTabState(tabId);
    });
  }

  async getTabState(tabId: number) {
    return this.storage.getTabState(tabId);
  }

  async setInterception(tabId: number, enabled: boolean, url?: string) {
    if (enabled) {
      await this.attach(tabId, url);
    } else {
      await this.detach(tabId, url);
    }

    return this.storage.getTabState(tabId);
  }

  private async attach(tabId: number, url?: string): Promise<void> {
    const target = { tabId };

    if (!this.attachedTabs.has(tabId)) {
      await attachDebugger(target);
      this.attachedTabs.add(tabId);
    }

    // chrome.debugger is the extension-safe transport into the Chrome DevTools
    // Protocol. Here we enable the CDP Fetch domain so Chrome pauses matching
    // network requests and lets this service worker decide whether to continue,
    // fail, or fulfill each request.
    await sendDebuggerCommand(target, 'Fetch.enable', {
      patterns: [
        { urlPattern: '*', requestStage: 'Request' },
        { urlPattern: '*', requestStage: 'Response' }
      ]
    });

    await this.storage.setTabState({
      tabId,
      enabled: true,
      attached: true,
      url,
      updatedAt: Date.now()
    });
  }

  private async detach(tabId: number, url?: string): Promise<void> {
    const target = { tabId };

    if (this.attachedTabs.has(tabId)) {
      try {
        await sendDebuggerCommand(target, 'Fetch.disable');
      } finally {
        await detachDebugger(target);
        this.attachedTabs.delete(tabId);
      }
    }

    await this.storage.setTabState({
      tabId,
      enabled: false,
      attached: false,
      url,
      updatedAt: Date.now()
    });
  }

  private async handleRequestPaused(tabId: number, event: FetchRequestPausedEvent): Promise<void> {
    const isResponseStage = typeof event.responseStatusCode === 'number';

    try {
      if (isResponseStage) {
        await this.handleResponsePaused(tabId, event);
      } else {
        await this.handleRequestStage(tabId, event);
      }
    } catch (error) {
      await this.log(tabId, event.request, {
        result: 'error',
        error: error instanceof Error ? error.message : String(error)
      });

      await this.continueRequest(tabId, event.requestId);
    }
  }

  private async handleRequestStage(tabId: number, event: FetchRequestPausedEvent): Promise<void> {
    if (!this.isApiResource(event.resourceType)) {
      await this.continueRequest(tabId, event.requestId);
      return;
    }

    const rules = await this.storage.getRules();
    const match = new RuleEngine(rules).findFirstMatch(event.request.url, event.request.method);

    for (const error of match.errors) {
      await this.log(tabId, event.request, { result: 'error', error });
    }

    if (!match.rule) {
      await this.continueRequest(tabId, event.requestId);
      return;
    }

    const { rule } = match;

    if (rule.action.type === 'block') {
      await this.log(tabId, event.request, { rule, result: 'blocked' });
      // Fetch.failRequest tells CDP to fail the paused request before it leaves
      // the browser network stack. This is the MVP blocking behavior.
      await sendDebuggerCommand<unknown>({ tabId }, 'Fetch.failRequest', {
        requestId: event.requestId,
        errorReason: 'BlockedByClient'
      });
      return;
    }

    this.pendingResponses.set(event.requestId, { rule });
    await this.log(tabId, event.request, { rule, result: 'matched' });

    // Fetch.continueRequest resumes the paused request. The interceptResponse
    // flag asks CDP to pause the same request again after response headers
    // arrive, which gives API Studio a chance to read or replace the body.
    await sendDebuggerCommand<unknown>({ tabId }, 'Fetch.continueRequest', {
      requestId: event.requestId,
      interceptResponse: true
    });
  }

  private async handleResponsePaused(tabId: number, event: FetchRequestPausedEvent): Promise<void> {
    const pending = this.pendingResponses.get(event.requestId);
    this.pendingResponses.delete(event.requestId);

    if (!pending) {
      await this.continueRequest(tabId, event.requestId);
      return;
    }

    const { rule } = pending;
    const action = rule.action;
    const delayMs = action.delayMs ?? 0;

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (action.type === 'delay') {
      await this.log(tabId, event.request, { rule, result: 'fulfilled' });
      await this.continueRequest(tabId, event.requestId);
      return;
    }

    const statusCode = action.statusCode ?? event.responseStatusCode ?? 200;
    const headers = this.withJsonHeader(event.responseHeaders ?? []);

    if (action.type === 'replaceBody' || action.type === 'customStatus') {
      await this.fulfill(tabId, event.requestId, statusCode, headers, action.responseBody ?? '');
      await this.log(tabId, event.request, { rule, result: 'fulfilled' });
      return;
    }

    if (action.type === 'modifyJson') {
      const original = await this.getResponseText(tabId, event.requestId);
      const transformed = await this.transformJson(original, action);
      await this.fulfill(tabId, event.requestId, statusCode, headers, transformed);
      await this.log(tabId, event.request, { rule, result: 'fulfilled' });
      return;
    }

    await this.continueRequest(tabId, event.requestId);
  }

  private isApiResource(resourceType?: string): boolean {
    return !resourceType || resourceType === 'XHR' || resourceType === 'Fetch';
  }

  private async continueRequest(tabId: number, requestId: string): Promise<void> {
    await sendDebuggerCommand<unknown>({ tabId }, 'Fetch.continueRequest', { requestId });
  }

  private async fulfill(tabId: number, requestId: string, responseCode: number, responseHeaders: HeaderEntry[], body: string): Promise<void> {
    // Fetch.fulfillRequest substitutes the response Chrome gives back to the
    // page. CDP expects the body as base64 over the protocol.
    await sendDebuggerCommand<unknown>({ tabId }, 'Fetch.fulfillRequest', {
      requestId,
      responseCode,
      responseHeaders,
      body: toBase64(body)
    });
  }

  private async getResponseText(tabId: number, requestId: string): Promise<string> {
    // Fetch.getResponseBody is only valid while the request is paused at the
    // response stage. API Studio uses it before fulfilling with transformed JSON.
    const response = await sendDebuggerCommand<ResponseBodyResult>({ tabId }, 'Fetch.getResponseBody', {
      requestId
    });
    return response.base64Encoded ? fromBase64(response.body) : response.body;
  }

  private async transformJson(originalBody: string, action: RuleAction): Promise<string> {
    const parsed = originalBody.trim() ? JSON.parse(originalBody) : null;
    const transformed = await this.sandbox.runTransform(parsed, action.transformCode ?? 'return input;');
    return JSON.stringify(transformed, null, 2);
  }

  private withJsonHeader(headers: HeaderEntry[]): HeaderEntry[] {
    const filtered = headers.filter((header) => !['content-length', 'content-encoding'].includes(header.name.toLowerCase()));
    const hasContentType = filtered.some((header) => header.name.toLowerCase() === 'content-type');
    return hasContentType ? filtered : [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, ...filtered];
  }

  private async log(
    tabId: number,
    request: FetchRequest,
    data: Pick<RequestLogEntry, 'result' | 'error'> & { rule?: ApiRule }
  ): Promise<void> {
    await this.storage.addLog({
      id: createId('log'),
      tabId,
      url: request.url,
      method: request.method,
      ruleId: data.rule?.id,
      ruleName: data.rule?.name,
      actionType: data.rule?.action.type,
      result: data.result,
      error: data.error,
      createdAt: Date.now()
    });
  }
}
