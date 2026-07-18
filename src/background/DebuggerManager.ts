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

type PendingResponseAction =
  | { mode: 'rule'; rule: ApiRule; startedAt: number }
  | { mode: 'discover'; startedAt: number };

const RESPONSE_PREVIEW_LIMIT = 8_000;

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
        requestId: event.requestId,
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
      const settings = await this.storage.getStudioSettings();
      if (!settings.discoverEnabled) {
        await this.continueRequest(tabId, event.requestId);
        return;
      }

      this.pendingResponses.set(event.requestId, { mode: 'discover', startedAt: Date.now() });
      await sendDebuggerCommand<unknown>({ tabId }, 'Fetch.continueRequest', {
        requestId: event.requestId,
        interceptResponse: true
      });
      return;
    }

    const { rule } = match;

    if (rule.action.type === 'block') {
      await this.log(tabId, event.request, {
        requestId: event.requestId,
        rule,
        result: 'blocked',
        durationMs: 0
      });
      // Fetch.failRequest tells CDP to fail the paused request before it leaves
      // the browser network stack. This is the MVP blocking behavior.
      await sendDebuggerCommand<unknown>({ tabId }, 'Fetch.failRequest', {
        requestId: event.requestId,
        errorReason: 'BlockedByClient'
      });
      return;
    }

    this.pendingResponses.set(event.requestId, { mode: 'rule', rule, startedAt: Date.now() });

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

    if (pending.mode === 'discover') {
      await this.handleDiscoverResponse(tabId, event, pending.startedAt);
      return;
    }

    const { rule } = pending;
    const action = rule.action;
    const delayMs = action.delayMs ?? 0;
    const statusCode = action.statusCode ?? event.responseStatusCode ?? 200;

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (action.type === 'delay') {
      await this.log(tabId, event.request, {
        requestId: event.requestId,
        rule,
        result: 'fulfilled',
        statusCode,
        durationMs: Date.now() - pending.startedAt
      });
      await this.continueRequest(tabId, event.requestId);
      return;
    }

    const headers = this.withJsonHeader(event.responseHeaders ?? []);

    if (action.type === 'replaceBody' || action.type === 'customStatus') {
      const original = await this.getResponseBody(tabId, event.requestId);
      const body = action.responseBody ?? '';
      await this.fulfill(tabId, event.requestId, statusCode, headers, body);
      await this.log(tabId, event.request, {
        requestId: event.requestId,
        rule,
        result: 'fulfilled',
        statusCode,
        durationMs: Date.now() - pending.startedAt,
        responseBodyPreview: this.preview(body),
        originalResponsePreview: this.previewBody(original),
        modifiedResponsePreview: this.preview(body)
      });
      return;
    }

    if (action.type === 'modifyJson') {
      const original = await this.getResponseBody(tabId, event.requestId);
      const originalText = this.responseBodyToText(original);
      let transformed: string;
      try {
        transformed = await this.transformJson(originalText, action);
      } catch (error) {
        await this.fulfillOriginal(tabId, event.requestId, event.responseStatusCode ?? 200, event.responseHeaders ?? [], original);
        await this.log(tabId, event.request, {
          requestId: event.requestId,
          rule,
          result: 'error',
          statusCode: event.responseStatusCode,
          durationMs: Date.now() - pending.startedAt,
          originalResponsePreview: this.preview(originalText),
          error: error instanceof Error ? error.message : String(error)
        });
        return;
      }
      await this.fulfill(tabId, event.requestId, statusCode, headers, transformed);
      await this.log(tabId, event.request, {
        requestId: event.requestId,
        rule,
        result: 'fulfilled',
        statusCode,
        durationMs: Date.now() - pending.startedAt,
        responseBodyPreview: this.preview(transformed),
        originalResponsePreview: this.preview(originalText),
        modifiedResponsePreview: this.preview(transformed)
      });
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

  private async fulfillOriginal(tabId: number, requestId: string, responseCode: number, responseHeaders: HeaderEntry[], body: ResponseBodyResult): Promise<void> {
    await sendDebuggerCommand<unknown>({ tabId }, 'Fetch.fulfillRequest', {
      requestId,
      responseCode,
      responseHeaders: this.withoutContentEncoding(responseHeaders),
      body: body.base64Encoded ? body.body : toBase64(body.body)
    });
  }

  private async getResponseBody(tabId: number, requestId: string): Promise<ResponseBodyResult> {
    // Fetch.getResponseBody is only valid while the request is paused at the
    // response stage. API Studio uses it before fulfilling with transformed JSON.
    return sendDebuggerCommand<ResponseBodyResult>({ tabId }, 'Fetch.getResponseBody', {
      requestId
    });
  }

  private async transformJson(originalBody: string, action: RuleAction): Promise<string> {
    const parsed = originalBody.trim() ? JSON.parse(originalBody) : null;
    const transformed = await this.sandbox.runTransform(parsed, action.transformCode ?? 'return input;');
    return JSON.stringify(transformed, null, 2);
  }

  private withJsonHeader(headers: HeaderEntry[]): HeaderEntry[] {
    const filtered = this.withoutContentEncoding(headers);
    const hasContentType = filtered.some((header) => header.name.toLowerCase() === 'content-type');
    return hasContentType ? filtered : [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, ...filtered];
  }

  private withoutContentEncoding(headers: HeaderEntry[]): HeaderEntry[] {
    return headers.filter((header) => !['content-length', 'content-encoding'].includes(header.name.toLowerCase()));
  }

  private async handleDiscoverResponse(tabId: number, event: FetchRequestPausedEvent, startedAt: number): Promise<void> {
    const statusCode = event.responseStatusCode ?? 200;
    const headers = event.responseHeaders ?? [];
    const original = await this.getResponseBody(tabId, event.requestId);
    const originalText = this.responseBodyToText(original);

    await this.fulfillOriginal(tabId, event.requestId, statusCode, headers, original);
    await this.log(tabId, event.request, {
      requestId: event.requestId,
      result: 'discovered',
      statusCode,
      durationMs: Date.now() - startedAt,
      responseBodyPreview: this.preview(originalText),
      originalResponsePreview: this.preview(originalText)
    });
  }

  private async log(
    tabId: number,
    request: FetchRequest,
    data: Pick<RequestLogEntry, 'result' | 'error' | 'requestId' | 'statusCode' | 'durationMs' | 'responseBodyPreview' | 'originalResponsePreview' | 'modifiedResponsePreview'> & { rule?: ApiRule }
  ): Promise<void> {
    await this.storage.addLog({
      id: createId('log'),
      requestId: data.requestId,
      tabId,
      url: request.url,
      method: request.method,
      statusCode: data.statusCode,
      durationMs: data.durationMs,
      responseBodyPreview: data.responseBodyPreview,
      originalResponsePreview: data.originalResponsePreview,
      modifiedResponsePreview: data.modifiedResponsePreview,
      ruleId: data.rule?.id,
      ruleName: data.rule?.name,
      actionType: data.rule?.action.type,
      result: data.result,
      error: data.error,
      createdAt: Date.now()
    });
  }

  private preview(body: string): string {
    return body.length > RESPONSE_PREVIEW_LIMIT ? `${body.slice(0, RESPONSE_PREVIEW_LIMIT)}\n...` : body;
  }

  private previewBody(body: ResponseBodyResult): string {
    return this.preview(this.responseBodyToText(body));
  }

  private responseBodyToText(body: ResponseBodyResult): string {
    if (!body.base64Encoded) {
      return body.body;
    }

    try {
      return fromBase64(body.body);
    } catch {
      return '[binary response body]';
    }
  }
}
