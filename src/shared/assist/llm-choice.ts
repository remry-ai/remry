// Which assistant runs, from the saved default and what's installed. Pure: llm-choice.server.ts
// reads settings.json and looks on disk.

import { LLM_PROVIDERS } from './providers/registry';
import type { LlmChoiceStatus, LlmLookup, LlmProviderId } from '$shared/types/llm';

export type Locate = (id: LlmProviderId) => string | null;

export const choiceStatus = (saved: LlmProviderId | null, locate: Locate): LlmChoiceStatus => ({
  providers: LLM_PROVIDERS.map((p) => ({ id: p.id, name: p.product, installed: locate(p.id) !== null, installHint: p.installHint })),
  current: saved
});

/**
 * The saved default's CLI. With none saved, the only installed assistant when there's just one
 * (the caller saves it), else `unchosen`, so the browser asks.
 */
export const lookupFrom = (saved: LlmProviderId | null, locate: Locate): LlmLookup => {
  if (saved === null) {
    const installed = LLM_PROVIDERS.flatMap((p) => {
      const path = locate(p.id);
      return path === null ? [] : [{ provider: p.id, path }];
    });
    return installed.length === 1 && installed[0] ? { state: 'ready', llm: installed[0] } : { state: 'unchosen' };
  }
  const path = locate(saved);
  return path === null ? { state: 'missing', provider: saved } : { state: 'ready', llm: { provider: saved, path } };
};
