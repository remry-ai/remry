// Which assistant runs, from the saved default and what's installed. Pure: llm-choice.server.ts
// reads settings.json and looks on disk.

import { LLM_PROVIDERS } from './providers/registry';
import type { LlmChoiceStatus, LlmLookup, LlmProviderId } from '$shared/types/llm';

export type Locate = (id: LlmProviderId) => string | null;

export const choiceStatus = (saved: LlmProviderId | null, locate: Locate): LlmChoiceStatus => ({
  providers: LLM_PROVIDERS.map((p) => ({ id: p.id, name: p.product, installed: locate(p.id) !== null, installHint: p.installHint })),
  current: saved
});

export const lookupFrom = (saved: LlmProviderId | null, locate: Locate): LlmLookup => {
  if (saved === null) return { state: 'unchosen' };
  const path = locate(saved);
  return path === null ? { state: 'missing', provider: saved } : { state: 'ready', llm: { provider: saved, path } };
};
