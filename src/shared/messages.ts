import type { InterceptionState } from './types';

export const MESSAGE_TYPES = {
  GET_TAB_STATE: 'GET_TAB_STATE',
  SET_TAB_INTERCEPTION: 'SET_TAB_INTERCEPTION',
  TAB_STATE_CHANGED: 'TAB_STATE_CHANGED',
  RUN_TRANSFORM: 'RUN_TRANSFORM'
} as const;

export type RuntimeMessage =
  | { type: typeof MESSAGE_TYPES.GET_TAB_STATE; tabId: number }
  | { type: typeof MESSAGE_TYPES.SET_TAB_INTERCEPTION; tabId: number; enabled: boolean; url?: string }
  | { type: typeof MESSAGE_TYPES.TAB_STATE_CHANGED; state: InterceptionState }
  | { type: typeof MESSAGE_TYPES.RUN_TRANSFORM; requestId: string; payload: unknown; code: string };

export interface RuntimeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
