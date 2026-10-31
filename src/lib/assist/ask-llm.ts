// `withLlmChoice` with the app's popup, for the feature helpers in the browser.

import { openPopup } from '$lib/ui/popup-url';
import { LLM_POPUP, withLlmChoice } from './llm-choice';

export const startWithLlm = <T extends { readonly started: boolean; readonly needsChoice?: true }>(
  start: () => Promise<T>
): Promise<T> => withLlmChoice(start, () => openPopup(LLM_POPUP));
