import { describe, it, expect, vi } from 'vitest';
import { createTestRegistry } from '$shared/registry.test';
import type { Registry } from '$shared/registry';
import { createBranding, updateBranding, getDefaultBranding, uploadImage } from '../operations';

// $transaction with an async callback: pass the tx client and await the callback.
const withTransaction = <T>(prismaMock: unknown) => {
  return async (cb: (tx: unknown) => Promise<T>): Promise<T> => cb(prismaMock);
};

describe('createBranding', () => {
  it('unsets any existing default when creating a new default profile', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue({ id: 'brand_new' });
    const prisma = { branding: { updateMany, create } };
    const reg = createTestRegistry({
      prisma: { ...prisma, $transaction: withTransaction(prisma) } as unknown as Registry['prisma'],
      uuid: () => 'brand_new'
    });

    const result = await createBranding(reg, { name: 'Acme', isDefault: true });

    expect(result.ok).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({ where: { isDefault: true }, data: { isDefault: false } });
    expect(create.mock.calls[0]![0].data.isDefault).toBe(true);
    expect(updateMany.mock.invocationCallOrder[0]!).toBeLessThan(create.mock.invocationCallOrder[0]!);
  });

  it('does not unset defaults when isDefault is false/omitted', async () => {
    const updateMany = vi.fn();
    const create = vi.fn().mockResolvedValue({ id: 'brand_new' });
    const prisma = { branding: { updateMany, create } };
    const reg = createTestRegistry({
      prisma: { ...prisma, $transaction: withTransaction(prisma) } as unknown as Registry['prisma']
    });

    await createBranding(reg, { name: 'Acme' });

    expect(updateMany).not.toHaveBeenCalled();
    expect(create.mock.calls[0]![0].data.isDefault).toBe(false);
  });
});

describe('updateBranding', () => {
  it('unsets other defaults when promoting a profile to default', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'brand_1', iconUrl: null, logoUrl: null });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({});
    const prisma = { branding: { findUnique, updateMany, update } };
    const reg = createTestRegistry({
      prisma: { ...prisma, $transaction: withTransaction(prisma) } as unknown as Registry['prisma']
    });

    const result = await updateBranding(reg, 'brand_1', { isDefault: true });
    expect(result.ok).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { isDefault: true, id: { not: 'brand_1' } },
      data: { isDefault: false }
    });
    expect(update).toHaveBeenCalledWith({ where: { id: 'brand_1' }, data: { isDefault: true } });
  });

  it('deletes the old image file when an image is replaced', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'brand_1', iconUrl: 'branding/brand_1/icon-old.png', logoUrl: null });
    const prisma = { branding: { findUnique, updateMany: vi.fn(), update: vi.fn().mockResolvedValue({}) } };
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const reg = createTestRegistry({
      prisma: { ...prisma, $transaction: withTransaction(prisma) } as unknown as Registry['prisma'],
      storage: { putObject: vi.fn(), readObject: vi.fn(), deleteObject, pathFor: vi.fn() }
    });

    await updateBranding(reg, 'brand_1', { iconUrl: 'branding/brand_1/icon-new.png' });
    expect(deleteObject).toHaveBeenCalledWith('branding/brand_1/icon-old.png');
  });
});

describe('getDefaultBranding', () => {
  it('returns the id, a local /files icon URL and the primary colours', async () => {
    const reg = createTestRegistry({
      prisma: {
        branding: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'brand_1',
            iconUrl: 'branding/brand_1/icon.png',
            primaryColor: '#16a34a',
            primaryFontColor: '#ffffff',
            accentColor: '#06b6d4',
            accentFontColor: '#ffffff'
          })
        }
      } as unknown as Registry['prisma']
    });

    const result = await getDefaultBranding(reg);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        id: 'brand_1',
        iconUrl: '/files/branding/brand_1/icon.png',
        primaryColor: '#16a34a',
        primaryFontColor: '#ffffff',
        accentColor: '#06b6d4',
        accentFontColor: '#ffffff'
      });
    }
  });

  it('returns null when there is no default', async () => {
    const reg = createTestRegistry({
      prisma: { branding: { findFirst: vi.fn().mockResolvedValue(null) } } as unknown as Registry['prisma']
    });

    const result = await getDefaultBranding(reg);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});

describe('uploadImage', () => {
  it('stores the image under the branding and returns its key', async () => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const reg = createTestRegistry({
      prisma: { branding: { findUnique: vi.fn().mockResolvedValue({ id: 'brand_1' }) } } as unknown as Registry['prisma'],
      storage: { putObject, readObject: vi.fn(), deleteObject: vi.fn(), pathFor: vi.fn() },
      uuid: () => 'u1'
    });

    const result = await uploadImage(reg, {
      brandingId: 'brand_1',
      type: 'logo',
      contentType: 'image/png',
      dataBase64: Buffer.from('png').toString('base64')
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.key).toBe('branding/brand_1/logo-u1.png');
    expect(putObject.mock.calls[0]![0]).toBe('branding/brand_1/logo-u1.png');
  });
});
