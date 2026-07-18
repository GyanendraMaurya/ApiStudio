import { describe, expect, it } from 'vitest';
import { RuleEngine } from './RuleEngine';
import type { ApiRule, RuleActionType, UrlMatchType } from '../shared/types';

function rule(id: string, overrides: Partial<ApiRule> = {}): ApiRule {
  const now = 1;
  const base: ApiRule = {
    id,
    name: id,
    enabled: true,
    match: {
      urlType: 'contains',
      urlValue: '/api',
      method: 'ANY'
    },
    action: {
      type: 'replaceBody',
      responseBody: '{}',
      statusCode: 200,
      delayMs: 0
    },
    createdAt: now,
    updatedAt: now
  };

  return {
    ...base,
    ...overrides,
    id,
    match: {
      ...base.match,
      ...overrides.match
    },
    action: {
      ...base.action,
      ...overrides.action
    }
  };
}

describe('RuleEngine', () => {
  it('matches exact URLs', () => {
    const result = new RuleEngine([
      rule('exact', { match: { urlType: 'exact', urlValue: 'https://example.com/api/users', method: 'ANY' } })
    ]).findFirstMatch('https://example.com/api/users', 'GET');

    expect(result.rule?.id).toBe('exact');
  });

  it('matches contains URLs', () => {
    const result = new RuleEngine([
      rule('contains', { match: { urlType: 'contains', urlValue: '/api/users', method: 'ANY' } })
    ]).findFirstMatch('https://example.com/api/users?id=1', 'GET');

    expect(result.rule?.id).toBe('contains');
  });

  it('matches regex URLs', () => {
    const result = new RuleEngine([
      rule('regex', { match: { urlType: 'regex', urlValue: '/api/users/\\d+$', method: 'ANY' } })
    ]).findFirstMatch('https://example.com/api/users/42', 'GET');

    expect(result.rule?.id).toBe('regex');
  });

  it('matches HTTP methods', () => {
    const result = new RuleEngine([
      rule('post', { match: { urlType: 'contains', urlValue: '/api', method: 'POST' } })
    ]).findFirstMatch('https://example.com/api', 'GET');

    expect(result.rule).toBeUndefined();
  });

  it('ignores disabled rules', () => {
    const result = new RuleEngine([
      rule('disabled', { enabled: false }),
      rule('enabled')
    ]).findFirstMatch('https://example.com/api', 'GET');

    expect(result.rule?.id).toBe('enabled');
  });

  it('uses the first enabled matching rule', () => {
    const result = new RuleEngine([
      rule('first', { action: { type: 'block' as RuleActionType } }),
      rule('second', { action: { type: 'delay' as RuleActionType } })
    ]).findFirstMatch('https://example.com/api', 'GET');

    expect(result.rule?.id).toBe('first');
  });

  it('treats invalid regex as a non-match and reports an error', () => {
    const result = new RuleEngine([
      rule('bad-regex', { match: { urlType: 'regex' as UrlMatchType, urlValue: '[', method: 'ANY' } })
    ]).findFirstMatch('https://example.com/api', 'GET');

    expect(result.rule).toBeUndefined();
    expect(result.errors[0]).toContain('invalid regex');
  });
});
