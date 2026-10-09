// Runs the local Claude Code CLI to convert a doc's PDF, one background job per
// doc. The web app's tRPC context is the only thing that holds this (see
// context.server.ts); jobs live in memory, since there is one local process.

import { basename, dirname } from 'node:path';
import { buildClaudeArgs, parseClaudeOutput } from './claude-cli';
import { lastStderrLine, locateClaude, runClaude } from './claude-process.server';
import type { PdfConversionJob, PdfConversionStatus, PdfConverter } from '$shared/types/pdf-conversion';

const TIMEOUT_MS = 10 * 60 * 1000;

const convert = async (job: PdfConversionJob): Promise<PdfConversionStatus> => {
  const { code, stdout, stderr } = await runClaude(job.claudePath, buildClaudeArgs(basename(job.pdfPath)), {
    cwd: dirname(job.pdfPath),
    timeoutMs: TIMEOUT_MS
  });
  if (stdout.trim() === '') {
    const detail = lastStderrLine(stderr);
    return {
      state: 'failed',
      message: code === null
        ? 'Claude took longer than 10 minutes to convert the PDF, so the doc wasn\'t changed.'
        : `Claude exited without a reply${detail ? `: ${detail}` : ''}.`
    };
  }
  const markdown = parseClaudeOutput(stdout);
  if (!markdown.ok) return { state: 'failed', message: markdown.error.message };
  const saved = await job.onMarkdown(markdown.value);
  return saved.ok ? { state: 'idle' } : { state: 'failed', message: saved.error.message };
};

export const createPdfConverter = (): PdfConverter => {
  const jobs = new Map<string, PdfConversionStatus>();

  return {
    locate: locateClaude,

    start: (job) => {
      if (jobs.get(job.key)?.state === 'running') return;
      jobs.set(job.key, { state: 'running' });
      convert(job)
        .catch((error: unknown): PdfConversionStatus => ({
          state: 'failed',
          message: `Couldn't run Claude: ${error instanceof Error ? error.message : String(error)}`
        }))
        .then((status) => {
          if (status.state === 'idle') jobs.delete(job.key);
          else jobs.set(job.key, status);
        });
    },

    status: (key) => {
      const status = jobs.get(key) ?? { state: 'idle' };
      if (status.state === 'failed') jobs.delete(key);
      return status;
    }
  };
};

let converter: PdfConverter | null = null;

export const getPdfConverter = (): PdfConverter => {
  converter ??= createPdfConverter();
  return converter;
};
