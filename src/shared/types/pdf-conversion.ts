// Converting a doc's attached PDF to markdown with the local AI assistant CLI (Claude Code, Copilot…).
// Only the web app's tRPC context carries a PdfConverter; the CLI and MCP don't.

import type { Result } from '$shared/utils/result';
import type { LlmLookup, LocatedLlm } from './llm';

export type PdfConversionState = 'idle' | 'running' | 'failed';

export interface PdfConversionStatus {
  readonly state: PdfConversionState;
  readonly message?: string;
}

export interface PdfConversionJob {
  /** `<notebookId>/<docId>`: one job per doc. */
  readonly key: string;
  /** The default assistant's CLI. */
  readonly llm: LocatedLlm;
  readonly pdfPath: string;
  /** Saves the markdown. A failed Result marks the job failed with its message. */
  readonly onMarkdown: (markdown: string) => Promise<Result<unknown>>;
}

export interface PdfConverter {
  /** The default assistant's CLI, looked up on every call (see llm-choice.server.ts). */
  readonly locate: () => Promise<LlmLookup>;
  /** Starts the job, or does nothing if one is already running for `key`. */
  readonly start: (job: PdfConversionJob) => void;
  /** A failed status is reported once, then the job reads as idle. */
  readonly status: (key: string) => PdfConversionStatus;
}

export type ConvertPdfResult =
  | { readonly started: true }
  /** Nothing ran: the warning to show; `needsChoice` when no default assistant is picked yet. */
  | { readonly started: false; readonly warning: string; readonly needsChoice?: true };
