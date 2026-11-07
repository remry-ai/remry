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

describe('createDocHandlers: adding a doc', () => {
  beforeEach(() => {
    invalidateAll.mockClear();
  });

  it('adds any type the same way: made at once, its id handed over, then opened', async () => {
    for (const bodyType of ['doc', 'sheet', 'drawing'] as const) {
      const add = vi.fn().mockResolvedValue({ ok: true, value: { id: `doc_${bodyType}` } });
      const order: string[] = [];
      const setActiveDocId = vi.fn(() => { order.push('open'); });
      const handlers = createDocHandlers(
        { add: { mutate: add }, update: { mutate: vi.fn() }, remove: { mutate: vi.fn() }, reorder: { mutate: vi.fn() } },
        'PROJECT',
        'proj_1',
        () => null,
        setActiveDocId,
      );
      await handlers.handleAddDoc(`Untitled ${bodyType}`, bodyType, (id) => { order.push(`new ${id}`); });
      expect(add).toHaveBeenCalledWith({ entityType: 'PROJECT', entityId: 'proj_1', title: `Untitled ${bodyType}`, bodyType });
      expect(order).toEqual([`new doc_${bodyType}`, 'open']);
      expect(setActiveDocId).toHaveBeenCalledWith(`doc_${bodyType}`);
    }
  });
});
