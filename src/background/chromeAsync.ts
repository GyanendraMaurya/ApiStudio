export async function sendDebuggerCommand<TResult>(
  target: chrome.debugger.Debuggee,
  method: string,
  params?: Record<string, unknown>
): Promise<TResult> {
  return chrome.debugger.sendCommand(target, method, params) as unknown as Promise<TResult>;
}

export async function attachDebugger(target: chrome.debugger.Debuggee, protocolVersion = '1.3'): Promise<void> {
  await chrome.debugger.attach(target, protocolVersion);
}

export async function detachDebugger(target: chrome.debugger.Debuggee): Promise<void> {
  await chrome.debugger.detach(target);
}

export function lastErrorMessage(): string | undefined {
  return chrome.runtime.lastError?.message;
}
