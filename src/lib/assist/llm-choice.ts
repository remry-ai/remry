// Asking which AI assistant to use, the first time the browser runs one. A feature's start
// (`link.convert`, `chat.send`, `sync.now`…) replies `needsChoice` while no default is saved;
// `withLlmChoice` then opens the choice popup (LlmChoicePopup, `?popup=choose-llm`), waits for
// the user, and starts it again once with the assistant they picked.

export const LLM_POPUP = 'choose-llm';

type Settle = (chosen: boolean) => void;

let pending: Settle | null = null;

/** Called by the popup: true once a default is saved, false when it closes without one. */
export const settleLlmChoice = (chosen: boolean): void => {
  const settle = pending;
  pending = null;
  settle?.(chosen);
};

/** Whether a feature is waiting on the popup (so closing it means "not now"). */
export const llmChoicePending = (): boolean => pending !== null;

/** Opens the popup (`open`, injectable for tests) and resolves with whether a default was saved. */
export const requestLlmChoice = (open: () => unknown): Promise<boolean> =>
  new Promise((resolve) => {
    settleLlmChoice(false);
    pending = resolve;
    void open();
  });

interface StartReply {
  readonly started: boolean;
  readonly needsChoice?: true;
}

/**
 * Runs `start`; when it says no assistant is picked yet, asks, then runs it once more. Without a
 * choice, the first reply comes back (its warning says how to choose later).
 */
export const withLlmChoice = async <T extends StartReply>(
  start: () => Promise<T>,
  open: () => unknown
): Promise<T> => {
  const first = await start();
  if (first.started || first.needsChoice !== true) return first;
  return (await requestLlmChoice(open)) ? start() : first;
};
