import type { ApiRule, MatchResult } from '../shared/types';

export class RuleEngine {
  constructor(private readonly rules: ApiRule[]) {}

  findFirstMatch(url: string, method: string): MatchResult {
    const errors: string[] = [];
    const normalizedMethod = method.toUpperCase();

    for (const rule of this.rules) {
      if (!rule.enabled) {
        continue;
      }

      if (rule.match.method !== 'ANY' && rule.match.method !== normalizedMethod) {
        continue;
      }

      const urlMatches = this.matchesUrl(rule, url, errors);
      if (urlMatches) {
        return { rule, errors };
      }
    }

    return { errors };
  }

  private matchesUrl(rule: ApiRule, url: string, errors: string[]): boolean {
    const expected = rule.match.urlValue.trim();
    if (!expected) {
      return false;
    }

    if (rule.match.urlType === 'exact') {
      return url === expected;
    }

    if (rule.match.urlType === 'contains') {
      return url.includes(expected);
    }

    try {
      return new RegExp(expected).test(url);
    } catch (error) {
      errors.push(`Rule "${rule.name}" has an invalid regex: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
