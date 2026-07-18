import type { ApiRule, AppStorageSnapshot, InterceptionState, RequestLogEntry } from '../shared/types';

export const MAX_LOG_ENTRIES = 100;

export const DEFAULT_STORAGE: AppStorageSnapshot = {
  rules: [],
  tabStates: {},
  logs: []
};

type StorageKey = keyof AppStorageSnapshot;

function chromeGet<T extends Partial<AppStorageSnapshot>>(defaults: T): Promise<T> {
  return chrome.storage.local.get(defaults) as Promise<T>;
}

function chromeSet(values: Partial<AppStorageSnapshot>): Promise<void> {
  return chrome.storage.local.set(values);
}

export class StorageService {
  async getSnapshot(): Promise<AppStorageSnapshot> {
    return chromeGet(DEFAULT_STORAGE);
  }

  async getRules(): Promise<ApiRule[]> {
    const data = await chromeGet({ rules: DEFAULT_STORAGE.rules });
    return data.rules;
  }

  async saveRules(rules: ApiRule[]): Promise<void> {
    await chromeSet({ rules });
  }

  async upsertRule(rule: ApiRule): Promise<ApiRule[]> {
    const rules = await this.getRules();
    const index = rules.findIndex((item) => item.id === rule.id);
    const nextRules = index >= 0 ? rules.map((item, itemIndex) => (itemIndex === index ? rule : item)) : [rule, ...rules];
    await this.saveRules(nextRules);
    return nextRules;
  }

  async deleteRule(ruleId: string): Promise<ApiRule[]> {
    const rules = await this.getRules();
    const nextRules = rules.filter((rule) => rule.id !== ruleId);
    await this.saveRules(nextRules);
    return nextRules;
  }

  async getTabState(tabId: number): Promise<InterceptionState | undefined> {
    const data = await chromeGet({ tabStates: DEFAULT_STORAGE.tabStates });
    return data.tabStates[String(tabId)];
  }

  async setTabState(state: InterceptionState): Promise<void> {
    const data = await chromeGet({ tabStates: DEFAULT_STORAGE.tabStates });
    await chromeSet({
      tabStates: {
        ...data.tabStates,
        [state.tabId]: state
      }
    });
  }

  async removeTabState(tabId: number): Promise<void> {
    const data = await chromeGet({ tabStates: DEFAULT_STORAGE.tabStates });
    const nextStates = { ...data.tabStates };
    delete nextStates[String(tabId)];
    await chromeSet({ tabStates: nextStates });
  }

  async addLog(entry: RequestLogEntry): Promise<RequestLogEntry[]> {
    const data = await chromeGet({ logs: DEFAULT_STORAGE.logs });
    const logs = [entry, ...data.logs].slice(0, MAX_LOG_ENTRIES);
    await chromeSet({ logs });
    return logs;
  }

  async clearLogs(): Promise<void> {
    await chromeSet({ logs: [] });
  }

  static storageKeys(): StorageKey[] {
    return ['rules', 'tabStates', 'logs'];
  }
}
