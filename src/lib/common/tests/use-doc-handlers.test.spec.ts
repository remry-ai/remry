import { describe, it, expect, vi, beforeEach } from 'vitest';

const invalidateAll = vi.fn().mockResolvedValue(undefined);

vi.mock('$app/navigation', () => ({
  invalidateAll: (...args: unknown[]) => invalidateAll(...args)
}));

// Import after mock is registered.
import { createDocHandlers } from '../use-doc-handlers';

describe('createDocHandlers.handleAddDoc', () => {
  beforeEach(() => {
    invalidateAll.mockClear();
  });

  it('calls invalidateAll before setActiveDocId', async () => {
    const add = vi.fn().mockResolvedValue({ ok: true, value: { id: 'doc_new' } });
    const setActiveDocId = vi.fn();

    const handlers = createDocHandlers(
      {
        add: { mutate: add },
        update: { mutate: vi.fn() },
        remove: { mutate: vi.fn() },
        reorder: { mutate: vi.fn() },
      },
      'PROJECT',
      'proj_1',
      () => null,
      setActiveDocId,
    );

    await handlers.handleAddDoc('New');

    expect(invalidateAll).toHaveBeenCalledTimes(1);
    expect(setActiveDocId).toHaveBeenCalledTimes(1);
    expect(setActiveDocId).toHaveBeenCalledWith('doc_new');

    const invalidateOrder = invalidateAll.mock.invocationCallOrder[0]!;
    const setActiveOrder = setActiveDocId.mock.invocationCallOrder[0]!;
    expect(invalidateOrder).toBeLessThan(setActiveOrder);
  });

  it('throws the error and does not call setActiveDocId when the mutation fails', async () => {
    const add = vi.fn().mockResolvedValue({ ok: false, error: new Error('nope') });
    const setActiveDocId = vi.fn();

    const handlers = createDocHandlers(
      {
        add: { mutate: add },
        update: { mutate: vi.fn() },
        remove: { mutate: vi.fn() },
        reorder: { mutate: vi.fn() },
      },
      'PROJECT',
      'proj_1',
      () => null,
      setActiveDocId,
    );

    await expect(handlers.handleAddDoc('New')).rejects.toThrow('nope');
    expect(setActiveDocId).not.toHaveBeenCalled();
    expect(invalidateAll).not.toHaveBeenCalled();
  });
});

describe('createDocHandlers.handleRemoveDoc', () => {
  beforeEach(() => {
    invalidateAll.mockClear();
  });

  it('throws the error of a failed remove and keeps the active doc', async () => {
    const remove = vi.fn().mockResolvedValue({ ok: false, error: { message: 'Doc not found' } });
    const setActiveDocId = vi.fn();
    const handlers = createDocHandlers(
      {
        add: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
        remove: { mutate: remove },
        reorder: { mutate: vi.fn() },
      },
      'PROJECT',
      'proj_1',
      () => 'doc_1',
      setActiveDocId,
    );

    await expect(handlers.handleRemoveDoc('doc_1')).rejects.toThrow('Doc not found');
    expect(setActiveDocId).not.toHaveBeenCalled();
    expect(invalidateAll).not.toHaveBeenCalled();
  });
});

describe('createDocHandlers.handleUploadPdf', () => {
  beforeEach(() => {
    invalidateAll.mockClear();
  });

  it('is a no-op when there is no active doc id', async () => {
    const attachSource = vi.fn();
    const handlers = createDocHandlers(
      {
        add: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
        remove: { mutate: vi.fn() },
        reorder: { mutate: vi.fn() },
        attachSource: { mutate: attachSource },
      },
      'PROJECT',
      'proj_1',
      () => null,
      vi.fn(),
    );

    const file = new File([new Uint8Array([1, 2, 3])], 'x.pdf', { type: 'application/pdf' });
    await handlers.handleUploadPdf(file);

    expect(attachSource).not.toHaveBeenCalled();
  });

  it('reads file bytes and calls attachSource with base64', async () => {
    const attachSource = vi.fn().mockResolvedValue({ ok: true, value: { ok: true } });
    const handlers = createDocHandlers(
      {
        add: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
        remove: { mutate: vi.fn() },
        reorder: { mutate: vi.fn() },
        attachSource: { mutate: attachSource },
      },
      'PROJECT',
      'proj_1',
      () => 'doc_1',
      vi.fn(),
    );

    const bytes = new Uint8Array([1, 2, 3, 250]);
    const file = new File([bytes], 'x.pdf', { type: 'application/pdf' });
    await handlers.handleUploadPdf(file);

    expect(attachSource).toHaveBeenCalledTimes(1);
    const arg = attachSource.mock.calls[0]![0];
    expect(arg.docId).toBe('doc_1');
    expect(arg.contentType).toBe('application/pdf');
    expect(Buffer.from(arg.dataBase64, 'base64')).toEqual(Buffer.from(bytes));
    expect(invalidateAll).toHaveBeenCalledTimes(1);
  });
});

describe('createDocHandlers.handleConvertPdf', () => {
  beforeEach(() => {
    invalidateAll.mockClear();
  });

  const handlersWith = (convertPdf: ReturnType<typeof vi.fn>, pdfConversion: ReturnType<typeof vi.fn>) =>
    createDocHandlers(
      {
        add: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
        remove: { mutate: vi.fn() },
        reorder: { mutate: vi.fn() },
        convertPdf: { mutate: convertPdf },
        pdfConversion: { query: pdfConversion },
      },
      'PROJECT',
      'proj_1',
      () => 'doc_1',
      vi.fn(),
      0,
    );

  it('returns the warning and does not poll when claude is not installed', async () => {
    const convertPdf = vi.fn().mockResolvedValue({ ok: true, value: { started: false, warning: 'Install claude' } });
    const pdfConversion = vi.fn();

    await expect(handlersWith(convertPdf, pdfConversion).handleConvertPdf('doc_1')).resolves.toBe('Install claude');
    expect(pdfConversion).not.toHaveBeenCalled();
    expect(invalidateAll).not.toHaveBeenCalled();
  });

  it('polls until the job finishes, then reloads the doc', async () => {
    const convertPdf = vi.fn().mockResolvedValue({ ok: true, value: { started: true } });
    const pdfConversion = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: { state: 'running' } })
      .mockResolvedValueOnce({ ok: true, value: { state: 'idle' } });

    await expect(handlersWith(convertPdf, pdfConversion).handleConvertPdf('doc_1')).resolves.toBeNull();
    expect(convertPdf).toHaveBeenCalledWith({ id: 'doc_1' });
    expect(pdfConversion).toHaveBeenCalledTimes(2);
    expect(invalidateAll).toHaveBeenCalledTimes(1);
  });

  it("throws the job's failure message", async () => {
    const convertPdf = vi.fn().mockResolvedValue({ ok: true, value: { started: true } });
    const pdfConversion = vi.fn().mockResolvedValue({ ok: true, value: { state: 'failed', message: 'OAuth session expired' } });

    await expect(handlersWith(convertPdf, pdfConversion).handleConvertPdf('doc_1')).rejects.toThrow('OAuth session expired');
  });
});

describe('createDocHandlers images', () => {
  const handlersWith = (uploadImage: ReturnType<typeof vi.fn>, docId: string | null) =>
    createDocHandlers(
      {
        add: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
        remove: { mutate: vi.fn() },
        reorder: { mutate: vi.fn() },
        uploadImage: { mutate: uploadImage },
      },
      'PROJECT',
      'proj_1',
      () => docId,
      vi.fn(),
    );

  it('uploads the image as base64 and returns its storage key', async () => {
    const uploadImage = vi.fn().mockResolvedValue({ ok: true, value: { key: 'docs/doc_1/image-a.png' } });
    const bytes = new Uint8Array([137, 80, 78, 71]);

    const key = await handlersWith(uploadImage, 'doc_1').handleUploadImage(new File([bytes], 'x.png', { type: 'image/png' }));

    expect(key).toBe('docs/doc_1/image-a.png');
    const arg = uploadImage.mock.calls[0]![0];
    expect(arg.docId).toBe('doc_1');
    expect(arg.contentType).toBe('image/png');
    expect(Buffer.from(arg.dataBase64, 'base64')).toEqual(Buffer.from(bytes));
  });

  it('throws the API error for an unsupported image', async () => {
    const uploadImage = vi.fn().mockResolvedValue({ ok: false, error: { message: 'Invalid input' } });
    const file = new File([new Uint8Array([1])], 'x.bmp', { type: 'image/bmp' });

    await expect(handlersWith(uploadImage, 'doc_1').handleUploadImage(file)).rejects.toThrow();
  });

  it('resolves storage keys to file URLs without a request', async () => {
    const uploadImage = vi.fn();

    const urls = await handlersWith(uploadImage, 'doc_1').handleResolveImages(['docs/doc_1/image a.png']);

    expect(urls).toEqual({ 'docs/doc_1/image a.png': '/files/docs/doc_1/image%20a.png' });
    expect(uploadImage).not.toHaveBeenCalled();
  });
});
