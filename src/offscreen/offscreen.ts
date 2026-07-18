import { MESSAGE_TYPES, type RuntimeMessage, type RuntimeResponse } from '../shared/messages';

interface SandboxResponse {
  requestId: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

const iframe = document.getElementById('transform-sandbox') as HTMLIFrameElement | null;
const pending = new Map<string, (response: RuntimeResponse<{ value: unknown }>) => void>();

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type !== MESSAGE_TYPES.RUN_TRANSFORM) {
    return false;
  }

  runSandboxTransform(message.requestId, message.payload, message.code)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });

  return true;
});

window.addEventListener('message', (event: MessageEvent<SandboxResponse>) => {
  const response = event.data;
  if (!response || typeof response.requestId !== 'string') {
    return;
  }

  const resolve = pending.get(response.requestId);
  if (!resolve) {
    return;
  }

  pending.delete(response.requestId);
  resolve(response.ok ? { ok: true, data: { value: response.value } } : { ok: false, error: response.error });
});

async function runSandboxTransform(requestId: string, payload: unknown, code: string): Promise<RuntimeResponse<{ value: unknown }>> {
  await waitForSandbox();

  return new Promise((resolve) => {
    pending.set(requestId, resolve);
    iframe?.contentWindow?.postMessage({ requestId, payload, code }, '*');
  });
}

function waitForSandbox(): Promise<void> {
  if (iframe?.contentWindow) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    iframe?.addEventListener('load', () => resolve(), { once: true });
  });
}
