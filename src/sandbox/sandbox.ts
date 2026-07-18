interface SandboxRequest {
  requestId: string;
  payload: unknown;
  code: string;
}

window.addEventListener('message', async (event: MessageEvent<SandboxRequest>) => {
  const request = event.data;
  if (!request || typeof request.requestId !== 'string') {
    return;
  }

  try {
    const result = await runTransform(request.payload, request.code);
    event.source?.postMessage({ requestId: request.requestId, ok: true, value: result }, { targetOrigin: '*' });
  } catch (error) {
    event.source?.postMessage({
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, { targetOrigin: '*' });
  }
});

async function runTransform(input: unknown, code: string): Promise<unknown> {
  const transform = new Function(
    'input',
    `"use strict";\n${code}\n//# sourceURL=api-studio-transform.js`
  ) as (input: unknown) => unknown | Promise<unknown>;

  return transform(input);
}
