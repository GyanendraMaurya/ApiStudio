export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'ANY';

export type UrlMatchType = 'exact' | 'contains' | 'regex';

export type RuleActionType = 'replaceBody' | 'modifyJson' | 'customStatus' | 'delay' | 'block';

export interface RuleMatch {
  urlType: UrlMatchType;
  urlValue: string;
  method: HttpMethod;
}

export interface RuleAction {
  type: RuleActionType;
  responseBody?: string;
  transformCode?: string;
  statusCode?: number;
  delayMs?: number;
}

export interface ApiRule {
  id: string;
  name: string;
  enabled: boolean;
  match: RuleMatch;
  action: RuleAction;
  createdAt: number;
  updatedAt: number;
}

export interface InterceptionState {
  tabId: number;
  enabled: boolean;
  attached: boolean;
  url?: string;
  error?: string;
  updatedAt: number;
}

export type LogResult = 'matched' | 'continued' | 'fulfilled' | 'blocked' | 'error';

export interface RequestLogEntry {
  id: string;
  tabId: number;
  url: string;
  method: string;
  ruleId?: string;
  ruleName?: string;
  actionType?: RuleActionType;
  result: LogResult;
  error?: string;
  createdAt: number;
}

export interface AppStorageSnapshot {
  rules: ApiRule[];
  tabStates: Record<string, InterceptionState>;
  logs: RequestLogEntry[];
}

export interface MatchResult {
  rule?: ApiRule;
  errors: string[];
}
