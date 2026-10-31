// Converting an attached source file with the local Claude, for a doc or a wiki page: start the
// job, then poll its status until it's done. Pure apart from the calls it's given.

import type { ConvertPdfResult, PdfConversionStatus } from '$shared/types/pdf-conversion';

export interface ConvertCalls {
  /** Starts the job (`doc.convertPdf`, `page.convertSource`). */
  readonly start: () => Promise<ConvertPdfResult>;
  /** Its status (`doc.pdfConversion`, `page.sourceConversion`). */
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
