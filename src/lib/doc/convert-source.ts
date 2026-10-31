// A local Claude job on a file uploaded as a link (writing a doc or wiki page from it, or saving
// its text): start the job, then poll its status until it's done. Pure apart from the calls it's given.

import type { ConvertPdfResult, PdfConversionStatus } from '$shared/types/pdf-conversion';

export interface ConvertCalls {
  /** Starts the job (`link.convert`, `link.transcribe`). */
  readonly start: () => Promise<ConvertPdfResult>;
  /** Its status (`link.conversion`). */
  readonly status: () => Promise<PdfConversionStatus>;
  readonly wait: (ms: number) => Promise<void>;
}

/**
 * Converts and waits. Returns a warning when `claude` isn't installed (nothing ran), null once
 * the text is written; throws with Claude's message when it fails.
 */
export const convertAndWait = async (calls: ConvertCalls, pollMs = 3000): Promise<string | null> => {
  const started = await calls.start();
  if (!started.started) return started.warning;
  for (;;) {
    await calls.wait(pollMs);
    const status = await calls.status();
    if (status.state === 'running') continue;
    if (status.state === 'failed') throw new Error(status.message ?? "Claude couldn't convert the file.");
    return null;
  }
};
