// What a runner's `locate` returns in tests: Claude at `path`, or not installed when null.

import type { LlmLookup } from '$shared/types/llm';

export const fakeLookup = (path: string | null): (() => Promise<LlmLookup>) => async () =>
  path === null ? { state: 'missing', provider: 'claude' } : { state: 'ready', llm: { provider: 'claude', path } };

export const unchosenLookup = async (): Promise<LlmLookup> => ({ state: 'unchosen' });
