// Runs the default assistant's CLI to convert a file to markdown, one background job per doc,
// page or link. The web app's tRPC context is the only thing that holds this (see
// context.server.ts); jobs live in memory, since there is one local process.

import { basename, dirname } from 'node:path';
import { lastStderrLine, runLlm } from './claude-process.server';
import { lookupLlm } from './llm-choice.server';
import { llmProvider } from './providers/registry';
import type { PdfConversionJob, PdfConversionStatus, PdfConverter } from '$shared/types/pdf-conversion';

const TIMEOUT_MS = 10 * 60 * 1000;

const convert = async (job: PdfConversionJob): Promise<PdfConversionStatus> => {
  const provider = llmProvider(job.llm.provider);
  const { code, stdout, stderr } = await runLlm(job.llm, { kind: 'convert', fileName: basename(job.pdfPath) }, {
    cwd: dirname(job.pdfPath),
    timeoutMs: TIMEOUT_MS
  });
  if (stdout.trim() === '') {
    const detail = lastStderrLine(stderr);
    return {
      state: 'failed',
      message: code === null
        ? `${provider.name} took longer than 10 minutes to convert the file, so the doc wasn't changed.`
        : `${provider.name} exited without a reply${detail ? `: ${detail}` : ''}.`
    };
  }
  const markdown = provider.parse(stdout, 'convert');
  if (!markdown.ok) return { state: 'failed', message: markdown.error.message };
  const saved = await job.onMarkdown(markdown.value);
  return saved.ok ? { state: 'idle' } : { state: 'failed', message: saved.error.message };
};

export const createPdfConverter = (): PdfConverter => {
  const jobs = new Map<string, PdfConversionStatus>();

  return {
    locate: lookupLlm,

    start: (job) => {
      if (jobs.get(job.key)?.state === 'running') return;
      jobs.set(job.key, { state: 'running' });
      convert(job)
        .catch((error: unknown): PdfConversionStatus => ({
          state: 'failed',
          message: `Couldn't run ${llmProvider(job.llm.provider).name}: ${error instanceof Error ? error.message : String(error)}`
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
