import { describe, expect, it } from 'vitest';
import { DEFAULT_STORAGE, MAX_LOG_ENTRIES, StorageService } from './StorageService';

describe('StorageService constants', () => {
  it('defines empty defaults for extension storage', () => {
    expect(DEFAULT_STORAGE).toEqual({
      rules: [],
      tabStates: {},
      logs: []
    });
  });

  it('keeps the storage keys explicit', () => {
    expect(StorageService.storageKeys()).toEqual(['rules', 'tabStates', 'logs']);
  });

  it('caps logs at a small local history size', () => {
    expect(MAX_LOG_ENTRIES).toBe(100);
  });
});
