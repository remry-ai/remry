// Every assistant the web app can run, in the order the choice popup lists them.

import type { LlmProviderId } from '$shared/types/llm';
import { claudeProvider } from './claude';
import { copilotProvider } from './copilot';
import type { LlmProvider } from './provider';

export const LLM_PROVIDERS: readonly LlmProvider[] = [claudeProvider, copilotProvider];

export const llmProvider = (id: LlmProviderId): LlmProvider =>
  LLM_PROVIDERS.find((p) => p.id === id) ?? claudeProvider;
