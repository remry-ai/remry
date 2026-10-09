// Converting a doc's attached PDF to markdown with the local Claude Code CLI.
// Only the web app's tRPC context carries a PdfConverter; the CLI and MCP don't.

import type { Result } from '$shared/utils/result';

export type PdfConversionState = 'idle' | 'running' | 'failed';

export interface PdfConversionStatus {
  readonly state: PdfConversionState;
  readonly message?: string;
}

export interface PdfConversionJob {
  /** `<notebookId>/<docId>`: one job per doc. */
  readonly key: string;
  readonly claudePath: string;
  readonly pdfPath: string;
  /** Saves the markdown. A failed Result marks the job failed with its message. */
  readonly onMarkdown: (markdown: string) => Promise<Result<unknown>>;
}

export interface PdfConverter {
  /** Looks for the `claude` executable on every call; null when it isn't installed. */
  readonly locate: () => string | null;
  /** Starts the job, or does nothing if one is already running for `key`. */
  readonly start: (job: PdfConversionJob) => void;
  /** A failed status is reported once, then the job reads as idle. */
  readonly status: (key: string) => PdfConversionStatus;
}

export type ConvertPdfResult =
  | { readonly started: true }
  | { readonly started: false; readonly warning: string };
