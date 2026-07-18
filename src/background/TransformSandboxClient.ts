import { MESSAGE_TYPES, type RuntimeResponse } from '../shared/messages';
import { createId } from '../shared/base64';

interface TransformResult {
  value: unknown;
}

export class TransformSandboxClient {
  private creatingOffscreen?: Promise<void>;

  async runTransform(payload: unknown, code: string): Promise<unknown> {
    await this.ensureOffscreenDocument();

    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.RUN_TRANSFORM,
      requestId: createId('transform'),
      payload,
      code
    }) as RuntimeResponse<TransformResult>;

    if (!response?.ok) {
      throw new Error(response?.error ?? 'The transform sandbox did not return a result.');
    }

    return response.data?.value;
  }

  private async ensureOffscreenDocument(): Promise<void> {
    const offscreenUrl = chrome.runtime.getURL('offscreen.html');
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
      return;
    }

    this.creatingOffscreen ??= chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
      justification: 'API Studio uses an offscreen page to host a sandboxed iframe for user JSON transforms.'
    }).finally(() => {
      this.creatingOffscreen = undefined;
    });

    await this.creatingOffscreen;
  }
}
