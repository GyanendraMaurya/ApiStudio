import { describe, expect, it } from 'vitest';
import { createRuleFromLog } from './RuleFactory';
import type { RequestLogEntry } from '../shared/types';

function log(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return {
    id: 'log_1',
    requestId: 'request_1',
    tabId: 10,
    url: 'https://example.com/api/users?page=1',
    method: 'GET',
    statusCode: 200,
    responseBodyPreview: '{\n  "ok": true\n}',
    result: 'fulfilled',
    createdAt: 1,
    ...overrides
  };
}

describe('RuleFactory', () => {
  it('creates a contains URL rule from a request log', () => {
    const rule = createRuleFromLog(log());

    expect(rule.name).toBe('Mock GET /api/users?page=1');
    expect(rule.enabled).toBe(true);
    expect(rule.match).toEqual({
      urlType: 'contains',
      urlValue: '/api/users?page=1',
      method: 'GET'
    });
  });

  it('uses the response preview and status code as the starter response', () => {
    const rule = createRuleFromLog(log({ statusCode: 404, responseBodyPreview: '{"missing":true}' }));

    expect(rule.action.responseBody).toBe('{"missing":true}');
    expect(rule.action.statusCode).toBe(404);
  });

  it('falls back to ANY for non-standard methods', () => {
    const rule = createRuleFromLog(log({ method: 'TRACE' }));

    expect(rule.match.method).toBe('ANY');
  });
});
