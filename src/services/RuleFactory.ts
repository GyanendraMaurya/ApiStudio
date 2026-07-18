import { createId } from '../shared/base64';
import type { ApiRule, HttpMethod, RequestLogEntry } from '../shared/types';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function createBlankRule(): ApiRule {
  const now = Date.now();
  return {
    id: createId('rule'),
    name: 'New rule',
    enabled: true,
    match: {
      urlType: 'contains',
      urlValue: '',
      method: 'ANY'
    },
    action: {
      type: 'replaceBody',
      responseBody: '{\n  "ok": true\n}',
      statusCode: 200,
      delayMs: 0,
      transformCode: 'return input;'
    },
    createdAt: now,
    updatedAt: now
  };
}

export function createRuleFromLog(log: RequestLogEntry): ApiRule {
  const now = Date.now();
  const url = safeRuleUrl(log.url);

  return {
    id: createId('rule'),
    name: `Mock ${log.method} ${url}`,
    enabled: true,
    match: {
      urlType: 'contains',
      urlValue: url,
      method: toRuleMethod(log.method)
    },
    action: {
      type: 'replaceBody',
      responseBody: log.responseBodyPreview ?? '{\n  "ok": true\n}',
      statusCode: log.statusCode ?? 200,
      delayMs: 0,
      transformCode: 'return input;'
    },
    createdAt: now,
    updatedAt: now
  };
}

function toRuleMethod(method: string): HttpMethod {
  const normalized = method.toUpperCase() as HttpMethod;
  return HTTP_METHODS.includes(normalized) ? normalized : 'ANY';
}

function safeRuleUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}
