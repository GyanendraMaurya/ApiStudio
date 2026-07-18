import { StorageService } from '../services/StorageService';
import { MESSAGE_TYPES, type RuntimeMessage, type RuntimeResponse } from '../shared/messages';
import { DebuggerManager } from './DebuggerManager';

const manager = new DebuggerManager();
const storage = new StorageService();

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  void handleMessage(message)
    .then((data): RuntimeResponse => ({ ok: true, data }))
    .catch((error): RuntimeResponse => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }))
    .then(sendResponse);

  return true;
});

async function handleMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case MESSAGE_TYPES.GET_TAB_STATE:
      return manager.getTabState(message.tabId);
    case MESSAGE_TYPES.SET_TAB_INTERCEPTION:
      return manager.setInterception(message.tabId, message.enabled, message.url);
    default:
      return undefined;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void storage.getSnapshot();
});
