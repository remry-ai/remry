import { afterAll, describe, it, expect, vi } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ok, err } from '$shared/utils/result';
import type { PdfConversionStatus, PdfConverter } from '$shared/types/pdf-conversion';
import { createPdfConverter } from '../pdf-converter.server';

// A stand-in for `claude` that prints a fixed reply, so the job runs a real process.
const dir = mkdtempSync(join(tmpdir(), 'wn-pdf-converter-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const fakeClaude = (name: string, stdout: string): string => {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\ncat <<'EOF'\n${stdout}\nEOF\n`);
  chmodSync(path, 0o755);
  return path;
};

const pdfPath = join(dir, 'source.pdf');
writeFileSync(pdfPath, '%PDF-1.4');

const settle = async (converter: PdfConverter, key: string): Promise<PdfConversionStatus> => {
  for (let i = 0; i < 200; i++) {
    const status = converter.status(key);
    if (status.state !== 'running') return status;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('job did not finish');
};

describe('createPdfConverter', () => {
  it('runs claude, saves the markdown and goes back to idle', async () => {
    const claudePath = fakeClaude('ok', JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '# Hello' }));
    const onMarkdown = vi.fn().mockResolvedValue(ok({ id: 'doc_1' }));
    const converter = createPdfConverter();

    converter.start({ key: 'work/doc_1', claudePath, pdfPath, onMarkdown });
    expect(converter.status('work/doc_1')).toEqual({ state: 'running' });

    expect(await settle(converter, 'work/doc_1')).toEqual({ state: 'idle' });
    expect(onMarkdown).toHaveBeenCalledWith('# Hello');
  });

  it('reports a failure once, with the reason, and does not save', async () => {
    const claudePath = fakeClaude('expired', JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'OAuth session expired' }));
    const onMarkdown = vi.fn();
    const converter = createPdfConverter();

    converter.start({ key: 'work/doc_2', claudePath, pdfPath, onMarkdown });
    const status = await settle(converter, 'work/doc_2');

    expect(status.state).toBe('failed');
    expect(status.message).toContain('OAuth session expired');
    expect(converter.status('work/doc_2')).toEqual({ state: 'idle' });
    expect(onMarkdown).not.toHaveBeenCalled();
  });

  it('fails with the save error when the doc cannot be written', async () => {
    const claudePath = fakeClaude('ok2', JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '# Hi' }));
    const converter = createPdfConverter();

    converter.start({ key: 'work/doc_3', claudePath, pdfPath, onMarkdown: async () => err(new Error('Doc not found')) });

    expect(await settle(converter, 'work/doc_3')).toEqual({ state: 'failed', message: 'Doc not found' });
  });

  it('fails when the executable cannot run', async () => {
    const converter = createPdfConverter();
    converter.start({ key: 'work/doc_4', claudePath: join(dir, 'missing'), pdfPath, onMarkdown: vi.fn() });

    const status = await settle(converter, 'work/doc_4');
    expect(status.state).toBe('failed');
    expect(status.message).toContain("Couldn't run Claude");
  });
});
