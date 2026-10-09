// Wiki pages: one entity with a `kind`, a page tree, markdown content and
// kind-specific properties. Kinds are data: each notebook defines its own in the
// page_kind table (a key, a name and typed fields), and GENERAL, with no fields,
// always exists. The Zod schemas are derived from a kind's fields, so the form,
// the dataset table and the validation can't disagree. Shared by the server
// (validation) and the client (PageForm, the properties table, the dataset view).

import { z } from 'zod';
import { ok, err, type Result } from '$shared/utils';

export type PagePropertyValue = string | number | boolean | readonly string[];

export type PageProperties = Readonly<Record<string, PagePropertyValue>>;

export const PAGE_FIELD_INPUTS = ['text', 'number', 'date', 'url', 'select', 'multiselect', 'checkbox'] as const;

export type PageFieldInput = (typeof PAGE_FIELD_INPUTS)[number];

export const NUMBER_FORMATS = ['plain', 'money'] as const;

export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export interface PageKindField {
  readonly key: string;
  readonly label: string;
  readonly input: PageFieldInput;
  /** select and multiselect only. */
  readonly options?: readonly string[];
  /** number only; money shows with `currency` and sums like any number. */
  readonly format?: NumberFormat;
  /** number with format money only: an ISO code such as USD. */
  readonly currency?: string;
}

/** A kind as stored in page_kind. */
export interface PageKindDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly fields: readonly PageKindField[];
  readonly sortOrder: number;
}

/** A kind with how many pages use it. */
export interface PageKindSummary extends PageKindDefinition {
  readonly pageCount: number;
}

/** The kind every notebook has: a plain page with no properties. */
export const GENERAL_KIND: PageKindDefinition = {
  key: 'GENERAL',
  name: 'Page',
  description: null,
  fields: [],
  sortOrder: -1
};

/** Kind keys look like EXPENSE or HOME_ITEM. */
export const PAGE_KIND_KEY = /^[A-Z][A-Z0-9_]{0,39}$/;

export const PAGE_KIND_KEY_RULE = 'capital letters, digits and underscores, starting with a letter (like EXPENSE or HOME_ITEM), at most 40';

/** Field keys look like amount or nextDue. */
export const PAGE_FIELD_KEY = /^[a-z][a-zA-Z0-9]{0,39}$/;

export const PAGE_KIND_LIMITS = { fields: 30, options: 50 } as const;

/** The work notebook's starter kinds: what the wiki offered before kinds were data. */
export const STARTER_KINDS: readonly Omit<PageKindDefinition, 'sortOrder'>[] = [
  {
    key: 'POLICY',
    name: 'Policy',
    description: null,
    fields: [
      { key: 'status', label: 'Status', input: 'select', options: ['DRAFT', 'ACTIVE', 'RETIRED'] },
      { key: 'version', label: 'Version', input: 'text' },
      { key: 'effectiveDate', label: 'Effective', input: 'date' },
      { key: 'reviewDate', label: 'Review by', input: 'date' }
    ]
  },
  {
    key: 'PRODUCT',
    name: 'Product',
    description: null,
    fields: [
      { key: 'status', label: 'Status', input: 'select', options: ['IDEA', 'BUILDING', 'LIVE', 'SUNSET'] },
      { key: 'url', label: 'URL', input: 'url' }
    ]
  },
  {
    key: 'SOFTWARE',
    name: 'Software',
    description: null,
    fields: [
      { key: 'vendor', label: 'Vendor', input: 'text' },
      { key: 'url', label: 'URL', input: 'url' },
      { key: 'annualCost', label: 'Annual cost', input: 'number' },
      { key: 'currency', label: 'Currency', input: 'text' },
      { key: 'renewalDate', label: 'Renews', input: 'date' },
      { key: 'seats', label: 'Seats', input: 'number' }
    ]
  },
  {
    key: 'DECISION',
    name: 'Decision',
    description: null,
    fields: [
      { key: 'status', label: 'Status', input: 'select', options: ['PROPOSED', 'ACCEPTED', 'SUPERSEDED', 'REJECTED'] },
      { key: 'decidedOn', label: 'Decided on', input: 'date' }
    ]
  }
];

export interface PageSummary {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly parentId: string | null;
  readonly properties: PageProperties;
  readonly path: string;
  readonly archivedAt: Date | null;
  readonly updatedAt: Date;
}

export interface PageLink {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly path: string;
}

export interface PageDetail extends PageSummary {
  readonly content: string;
  readonly parent: { readonly id: string; readonly title: string } | null;
  readonly children: readonly PageLink[];
  readonly createdAt: Date;
}

// ----- Field definitions -----

const optionsSchema = z
  .array(z.string().trim().min(1).max(60))
  .min(1, 'needs at least one option')
  .max(PAGE_KIND_LIMITS.options)
  .refine((options) => new Set(options).size === options.length, 'has the same option twice')
  .readonly();

export const pageKindFieldSchema = z
  .object({
    key: z.string().regex(PAGE_FIELD_KEY, 'must be camelCase letters and digits, like amount or nextDue'),
    label: z.string().trim().min(1).max(60),
    input: z.enum(PAGE_FIELD_INPUTS),
    options: optionsSchema.optional(),
    format: z.enum(NUMBER_FORMATS).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'must be a three-letter code like USD').optional()
  })
  .strict()
  .superRefine((field, ctx) => {
    const choice = field.input === 'select' || field.input === 'multiselect';
    if (choice && !field.options) ctx.addIssue({ code: 'custom', message: `a ${field.input} field needs options` });
    if (!choice && field.options) ctx.addIssue({ code: 'custom', message: `only select and multiselect fields take options` });
    if (field.input !== 'number' && field.format) ctx.addIssue({ code: 'custom', message: 'only number fields take a format' });
    if (field.currency && field.format !== 'money') ctx.addIssue({ code: 'custom', message: 'currency needs format money' });
  });

export const pageKindFieldsSchema = z
  .array(pageKindFieldSchema)
  .max(PAGE_KIND_LIMITS.fields)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    for (const field of fields) {
      if (seen.has(field.key)) ctx.addIssue({ code: 'custom', message: `two fields have the key ${field.key}` });
      seen.add(field.key);
    }
  });

/** Fields as stored. Unreadable JSON (never written by the app) reads as none. */
export const readPageKindFields = (raw: string): readonly PageKindField[] => {
  try {
    const parsed = pageKindFieldsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as readonly PageKindField[]) : [];
  } catch {
    return [];
  }
};

// ----- Property values -----

const choices = (field: PageKindField): [string, ...string[]] =>
  field.options && field.options.length > 0 ? [field.options[0]!, ...field.options.slice(1)] : [''];

const fieldSchema = (field: PageKindField): z.ZodTypeAny => {
  switch (field.input) {
    case 'date':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-09-13');
    case 'url':
      return z.string().url().max(2000);
    case 'number':
      return z.number().finite();
    case 'checkbox':
      return z.boolean();
    case 'select':
      return z.enum(choices(field));
    case 'multiselect':
      return z.array(z.enum(choices(field))).min(1).refine((v) => new Set(v).size === v.length, 'lists an option twice');
    default:
      return z.string().min(1).max(2000);
  }
};

const schemaFor = (fields: readonly PageKindField[]): z.ZodTypeAny =>
  z.object(Object.fromEntries(fields.map((field) => [field.key, fieldSchema(field).optional()]))).strict();

/** Validates properties (an object or its JSON) against the kind; errors name the field and the allowed keys. */
export const parsePageProperties = (
  kind: Pick<PageKindDefinition, 'key' | 'fields'>,
  input: unknown
): Result<PageProperties> => {
  let value = input ?? {};
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value || '{}');
    } catch (e) {
      return err(new Error(`properties: invalid JSON (${e instanceof Error ? e.message : String(e)})`));
    }
  }
  const parsed = schemaFor(kind.fields).safeParse(value);
  if (parsed.success) return ok(parsed.data as PageProperties);

  const allowed = kind.fields.map((field) => field.key);
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'properties'} ${issue.message}`).join('; ');
  const hint = allowed.length > 0 ? `allowed keys: ${allowed.join(', ')}` : 'this kind has no properties';
  return err(new Error(`properties for a ${kind.key} page: ${issues} (${hint})`));
};

/** Properties as stored. Unreadable JSON (never written by the app) reads as none. */
export const readPageProperties = (raw: string): PageProperties => {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as PageProperties) : {};
  } catch {
    return {};
  }
};
