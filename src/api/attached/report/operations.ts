import type { Registry } from '$shared/registry';
import { ok, err, type Result } from '$shared/utils';
import { ensureWritable } from '$api/_archive';
import { validateChartBlocks } from '$shared/types/charts';
import type { EntityType } from '$shared/types/enums';
import type { ReportBrandingProfile, ReportDetail, ReportSummary } from '$shared/types/report';
import { entityPath } from '$shared/utils/entity';
import { fileUrl } from '$shared/utils/files';
import { resolveEntityLabel } from '$api/_entity-labels';
import { planEntityCleanup, removeFiles } from '$api/_entity-cleanup';
import { syncMentions } from '$api/relation/mentions';

// ----- Row shapes -----

interface BrandingRow {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
  readonly logoUrl: string | null;
  readonly primaryColor: string;
  readonly accentColor: string;
  readonly primaryFontColor: string;
  readonly accentFontColor: string;
}

interface ReportRow {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly title: string;
  readonly content: string;
  readonly brandingId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly branding: BrandingRow | null;
}

const NAMED_ENTITIES: ReadonlySet<EntityType> = new Set(['PERSON', 'GROUP', 'PROJECT', 'GOAL', 'PAGE']);

const toProfile = (b: BrandingRow): ReportBrandingProfile => ({
  id: b.id,
  name: b.name,
  iconUrl: b.iconUrl ? fileUrl(b.iconUrl) : null,
  logoUrl: b.logoUrl ? fileUrl(b.logoUrl) : null,
  primaryColor: b.primaryColor,
  accentColor: b.accentColor,
  primaryFontColor: b.primaryFontColor,
  accentFontColor: b.accentFontColor
});

const toSummary = async (reg: Pick<Registry, 'prisma'>, row: ReportRow): Promise<ReportSummary> => {
  const entityType = row.entityType as EntityType;
  return {
    id: row.id,
    title: row.title,
    entityType,
    entityId: row.entityId,
    entityName: await resolveEntityLabel(reg, entityType, row.entityId),
    entityPath: entityPath(entityType, row.entityId),
    brandingId: row.brandingId,
    brandingName: row.branding?.name ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

const checkBranding = async (
  reg: Pick<Registry, 'prisma'>,
  brandingId: string | null | undefined
): Promise<Result<void>> => {
  if (!brandingId) return ok(undefined);
  const branding = await reg.prisma.branding.findUnique({ where: { id: brandingId }, select: { id: true } });
  return branding ? ok(undefined) : err(new Error(`Branding profile ${brandingId} not found`));
};

// ----- Queries -----

export const listReports = async (
  reg: Pick<Registry, 'prisma'>
): Promise<Result<readonly ReportSummary[]>> => {
  const rows = await reg.prisma.report.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { branding: true }
  });
  return ok(await Promise.all(rows.map((row) => toSummary(reg, row))));
};

export const listReportsForEntity = async (
  reg: Pick<Registry, 'prisma'>,
  entityType: EntityType,
  entityId: string
): Promise<Result<readonly ReportSummary[]>> => {
  const rows = await reg.prisma.report.findMany({
    where: { entityType, entityId },
    orderBy: { updatedAt: 'desc' },
    include: { branding: true }
  });
  return ok(await Promise.all(rows.map((row) => toSummary(reg, row))));
};

export const getReport = async (
  reg: Pick<Registry, 'prisma'>,
  id: string
): Promise<Result<ReportDetail>> => {
  const row = await reg.prisma.report.findUnique({ where: { id }, include: { branding: true } });
  if (!row) return err(new Error('Report not found'));

  const branding = row.branding ?? (await reg.prisma.branding.findFirst({ where: { isDefault: true } }));
  return ok({
    ...(await toSummary(reg, row)),
    content: row.content,
    branding: branding ? toProfile(branding) : null
  });
};

// ----- Mutations -----

export interface CreateReportInput {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly title: string;
  readonly content?: string;
  readonly brandingId?: string | null;
}

export const createReport = async (
  reg: Pick<Registry, 'prisma'>,
  input: CreateReportInput
): Promise<Result<{ readonly id: string }>> => {
  const writable = await ensureWritable(reg, input.entityType, input.entityId);
  if (!writable.ok) return err(writable.error);
  const charts = validateChartBlocks(input.content ?? '');
  if (!charts.ok) return err(charts.error);

  if (NAMED_ENTITIES.has(input.entityType)) {
    const name = await resolveEntityLabel(reg, input.entityType, input.entityId);
    if (name === null) return err(new Error(`${input.entityType} ${input.entityId} not found`));
  }

  const branding = await checkBranding(reg, input.brandingId);
  if (!branding.ok) return err(branding.error);

  const row = await reg.prisma.report.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      content: input.content ?? '',
      brandingId: input.brandingId ?? null
    }
  });
  if (input.content) await syncMentions(reg, { entityType: 'REPORT', entityId: row.id }, input.content);
  return ok({ id: row.id });
};

export interface UpdateReportInput {
  readonly title?: string;
  readonly content?: string;
  readonly brandingId?: string | null;
}

export const updateReport = async (
  reg: Pick<Registry, 'prisma'>,
  id: string,
  input: UpdateReportInput
): Promise<Result<{ readonly id: string }>> => {
  const existing = await reg.prisma.report.findUnique({ where: { id } });
  if (!existing) return err(new Error('Report not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  if (input.content !== undefined) {
    const charts = validateChartBlocks(input.content);
    if (!charts.ok) return err(charts.error);
  }

  const branding = await checkBranding(reg, input.brandingId);
  if (!branding.ok) return err(branding.error);

  await reg.prisma.report.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.brandingId !== undefined && { brandingId: input.brandingId })
    }
  });
  if (input.content !== undefined) await syncMentions(reg, { entityType: 'REPORT', entityId: id }, input.content);
  return ok({ id });
};

export const removeReport = async (
  reg: Pick<Registry, 'prisma' | 'storage' | 'logger'>,
  id: string
): Promise<Result<{ readonly deleted: true }>> => {
  const existing = await reg.prisma.report.findUnique({ where: { id } });
  if (!existing) return err(new Error('Report not found'));
  const writable = await ensureWritable(reg, existing.entityType, existing.entityId);
  if (!writable.ok) return err(writable.error);

  const cleanup = await planEntityCleanup(reg, 'REPORT', id);
  await reg.prisma.$transaction([...cleanup.ops, reg.prisma.report.delete({ where: { id } })]);
  await removeFiles(reg, cleanup.files);
  return ok({ deleted: true as const });
};
