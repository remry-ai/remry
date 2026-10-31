// Before a web app feature runs the assistant: the default's CLI, or the reply to send instead
// (no default picked yet, so the browser asks; or it isn't installed).

import { notFoundWarning } from '$shared/assist/providers/provider';
import { llmProvider } from '$shared/assist/providers/registry';
import { LLM_CHOICE_NEEDED, type LlmLookup, type LocatedLlm } from '$shared/types/llm';

export interface NotStarted {
  readonly started: false;
  readonly warning: string;
  readonly needsChoice?: true;
}

export type ReadyLlm<R> =
  | { readonly ready: true; readonly llm: LocatedLlm; readonly runner: R }
  | { readonly ready: false; readonly reply: NotStarted };

/** `retry` finishes the not-installed warning: "send your message again." */
export const readyLlm = async <R extends { readonly locate: () => Promise<LlmLookup> }>(
  runner: R | undefined,
  retry: string
): Promise<ReadyLlm<R>> => {
  // Without a runner (the CLI or MCP), there's nothing to run: say what the app would.
  const lookup: LlmLookup = runner ? await runner.locate() : { state: 'missing', provider: 'claude' };
  if (runner && lookup.state === 'ready') return { ready: true, llm: lookup.llm, runner };
  if (lookup.state === 'unchosen') return { ready: false, reply: { started: false, warning: LLM_CHOICE_NEEDED, needsChoice: true } };
  const provider = lookup.state === 'missing' ? lookup.provider : 'claude';
  return { ready: false, reply: { started: false, warning: notFoundWarning(llmProvider(provider), retry) } };
};
