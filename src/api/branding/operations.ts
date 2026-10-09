import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { fileUrl } from '$shared/utils/files';
import type { BrandingProfile, BrandingSummary } from './types';

export const listBrandings = async (
  reg: Pick<Registry, 'prisma'>
): Promise<Result<readonly BrandingSummary[]>> => {
  const rows = await reg.prisma.branding.findMany({ orderBy: { name: 'asc' } });

  return ok(rows.map((r) => ({
    id: r.id,
    name: r.name,
    primaryColor: r.primaryColor,
    accentColor: r.accentColor,
    primaryFontColor: r.primaryFontColor,
    accentFontColor: r.accentFontColor,
    hasIcon: !!r.iconUrl,
    hasLogo: !!r.logoUrl,
    isDefault: r.isDefault
  })));
};

export interface DefaultBranding {
  readonly id: string;
  readonly iconUrl: string | null;
  /** Colours the app chrome for this notebook (see `.branded` in styles/_tokens.scss). */
  readonly primaryColor: string;
  readonly primaryFontColor: string;
  /** Chart colours in the doc preview, so it matches the exported PDF. */
  readonly accentColor: string;
  readonly accentFontColor: string;
}

export const getDefaultBranding = async (
  reg: Pick<Registry, 'prisma'>
): Promise<Result<DefaultBranding | null>> => {
  const row = await reg.prisma.branding.findFirst({
    where: { isDefault: true },
    select: { id: true, iconUrl: true, primaryColor: true, primaryFontColor: true, accentColor: true, accentFontColor: true }
  });
  if (!row) return ok(null);
  return ok({
    id: row.id,
    iconUrl: row.iconUrl ? fileUrl(row.iconUrl) : null,
    primaryColor: row.primaryColor,
    primaryFontColor: row.primaryFontColor,
    accentColor: row.accentColor,
    accentFontColor: row.accentFontColor
  });
};

export const getBranding = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<BrandingProfile>> => {
  const row = await reg.prisma.branding.findUnique({ where: { id } });
  if (!row) return err(new Error('Branding profile not found'));

  return ok({
    id: row.id,
    name: row.name,
    iconUrl: row.iconUrl ? fileUrl(row.iconUrl) : null,
    logoUrl: row.logoUrl ? fileUrl(row.logoUrl) : null,
    primaryColor: row.primaryColor,
    accentColor: row.accentColor,
    primaryFontColor: row.primaryFontColor,
    accentFontColor: row.accentFontColor,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
};

export interface BrandingInput {
  readonly name: string;
  /** Storage key (from uploadImage), not a URL. */
  readonly iconUrl?: string | null;
  /** Storage key (from uploadImage), not a URL. */
  readonly logoUrl?: string | null;
  readonly primaryColor?: string;
  readonly accentColor?: string;
  readonly primaryFontColor?: string;
  readonly accentFontColor?: string;
  readonly isDefault?: boolean;
}

export const createBranding = async (
  reg: Pick<Registry, 'prisma' | 'uuid'>,
  input: BrandingInput
): Promise<Result<{ readonly id: string }>> => {
  const id = reg.uuid();

  await reg.prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.branding.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      });
    }
    await tx.branding.create({
      data: {
        id,
        name: input.name,
        iconUrl: input.iconUrl ?? null,
        logoUrl: input.logoUrl ?? null,
        primaryColor: input.primaryColor ?? '#4f46e5',
        accentColor: input.accentColor ?? '#06b6d4',
        primaryFontColor: input.primaryFontColor ?? '#ffffff',
        accentFontColor: input.accentFontColor ?? '#ffffff',
        isDefault: input.isDefault ?? false
      }
    });
  });
  return ok({ id });
};

export const updateBranding = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger'>,
  id: string,
  input: Partial<BrandingInput>
): Promise<Result<{ readonly updated: boolean }>> => {
  const existing = await reg.prisma.branding.findUnique({ where: { id } });
  if (!existing) return err(new Error('Branding profile not found'));

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.iconUrl !== undefined) data.iconUrl = input.iconUrl;
  if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;
  if (input.primaryColor !== undefined) data.primaryColor = input.primaryColor;
  if (input.accentColor !== undefined) data.accentColor = input.accentColor;
  if (input.primaryFontColor !== undefined) data.primaryFontColor = input.primaryFontColor;
  if (input.accentFontColor !== undefined) data.accentFontColor = input.accentFontColor;
  if (input.isDefault !== undefined) data.isDefault = input.isDefault;

  await reg.prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.branding.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false }
      });
    }
    await tx.branding.update({ where: { id }, data });
  });

  // Replaced or removed images leave orphaned files; clean them up.
  const replaced = [
    input.iconUrl !== undefined && existing.iconUrl !== input.iconUrl ? existing.iconUrl : null,
    input.logoUrl !== undefined && existing.logoUrl !== input.logoUrl ? existing.logoUrl : null
  ].filter((key): key is string => !!key);
  for (const key of replaced) {
    try {
      await reg.storage.deleteObject(key);
    } catch (error) {
      reg.logger.warn({ brandingId: id, key, error }, 'failed to delete replaced branding image');
    }
  }

  return ok({ updated: true });
};

export const deleteBranding = async (
  reg: Pick<Registry, 'prisma' | 'storage'>,
  id: string
): Promise<Result<{ readonly deleted: boolean }>> => {
  const row = await reg.prisma.branding.findUnique({ where: { id } });
  if (!row) return err(new Error('Branding profile not found'));

  if (row.iconUrl) await reg.storage.deleteObject(row.iconUrl);
  if (row.logoUrl) await reg.storage.deleteObject(row.logoUrl);

  await reg.prisma.branding.delete({ where: { id } });
  return ok({ deleted: true });
};

export const uploadImage = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'uuid'>,
  input: {
    readonly brandingId: string;
    readonly type: 'icon' | 'logo';
    readonly contentType: 'image/png' | 'image/jpeg';
    readonly dataBase64: string;
  }
): Promise<Result<{ readonly key: string }>> => {
  const existing = await reg.prisma.branding.findUnique({ where: { id: input.brandingId } });
  if (!existing) return err(new Error('Branding profile not found'));

  const ext = input.contentType === 'image/png' ? 'png' : 'jpg';
  const key = `branding/${input.brandingId}/${input.type}-${reg.uuid()}.${ext}`;
  await reg.storage.putObject(key, Buffer.from(input.dataBase64, 'base64'), input.contentType);
  return ok({ key });
};
