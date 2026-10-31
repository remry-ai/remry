// Which local AI assistant CLI the web app runs (Claude Code, GitHub Copilot…). The user picks a
// default once, saved for the whole computer (`llmProvider` in settings.json). The app never calls
// a model itself: it runs the user's own CLI, signed in with their own account.

export const LLM_PROVIDER_IDS = ['claude', 'copilot'] as const;

export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

export const isLlmProviderId = (value: unknown): value is LlmProviderId =>
  typeof value === 'string' && (LLM_PROVIDER_IDS as readonly string[]).includes(value);

/** One assistant, as the choice popup lists it. */
export interface LlmProviderInfo {
  readonly id: LlmProviderId;
  readonly name: string;
  /** Whether its CLI was found on this computer just now. */
  readonly installed: boolean;
  /** How to install and sign in, for one that isn't installed. */
  readonly installHint: string;
}

export interface LlmChoiceStatus {
  readonly providers: readonly LlmProviderInfo[];
  /** The saved default, or null before the user has picked one. */
  readonly current: LlmProviderId | null;
}

/** The default assistant's CLI, found on disk: what a job runs. */
export interface LocatedLlm {
  readonly provider: LlmProviderId;
  readonly path: string;
}

export type LlmLookup =
  | { readonly state: 'ready'; readonly llm: LocatedLlm }
  /** No default picked yet: the browser asks which to use. */
  | { readonly state: 'unchosen' }
  /** The default's CLI isn't installed (any more). */
  | { readonly state: 'missing'; readonly provider: LlmProviderId };

export const LLM_CHOICE_NEEDED = 'Choose which AI assistant to use first: notebook menu → AI assistant….';
