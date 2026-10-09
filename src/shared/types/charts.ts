// Chart specs for ```chart blocks in docs and reports, plus the legacy
// survey-shaped [chart:key] tags (results imported from form-engine).
// Shared by the server (report validation) and the client (rendering).

import { z } from 'zod';
import { ok, err, type Result } from '$shared/utils';

export const CHART_TYPES = ['bar', 'line', 'radar'] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export interface ChartSeries {
  readonly label?: string;
  readonly values: readonly number[];
  /** `#rrggbb`; without it the series takes the branding's colour. */
  readonly color?: string;
}

export interface ChartSpec {
  readonly type: ChartType;
  readonly title?: string;
  readonly labels: readonly string[];
  readonly series: readonly ChartSeries[];
  readonly min?: number;
  readonly max?: number;
}

export const chartSpecSchema: z.ZodType<ChartSpec, z.ZodTypeDef, unknown> = z
  .object({
    type: z.enum(CHART_TYPES),
    title: z.string().max(200).optional(),
    labels: z.array(z.string()).min(1).max(100),
    series: z
      .array(z.object({
        label: z.string().max(100).optional(),
        values: z.array(z.number()),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex colour like "#2563eb"').optional()
      }).strict())
      .min(1)
      .max(6),
    min: z.number().optional(),
    max: z.number().optional()
  })
  .strict()
  .superRefine((spec, ctx) => {
    spec.series.forEach((s, i) => {
      if (s.values.length !== spec.labels.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['series', i, 'values'],
          message: `has ${s.values.length} values but there are ${spec.labels.length} labels`
        });
      }
    });
  });

export interface ChartBlock {
  /** 1-based line number of the opening ```chart fence. */
  readonly line: number;
  readonly source: string;
}

const FENCE = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/;

/** Every ```chart block in the markdown. Fences of other languages are skipped. */
export const extractChartBlocks = (markdown: string): readonly ChartBlock[] => {
  const lines = markdown.split('\n');
  const blocks: ChartBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i]!);
    if (!open) continue;
    const fence = open[1]!;
    const isChart = open[2] === 'chart';
    const start = i;
    const body: string[] = [];
    i++;
    const closing = new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`);
    while (i < lines.length && !closing.test(lines[i]!)) {
      body.push(lines[i]!);
      i++;
    }
    if (isChart) blocks.push({ line: start + 1, source: body.join('\n') });
  }
  return blocks;
};

export const parseChartSpec = (source: string): Result<ChartSpec> => {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch (e) {
    return err(new Error(`invalid JSON (${e instanceof Error ? e.message : String(e)})`));
  }
  const parsed = chartSpecSchema.safeParse(json);
  if (!parsed.success) {
    return err(new Error(parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'chart'} ${issue.message}`)
      .join('; ')));
  }
  return ok(parsed.data);
};

/** Validates every ```chart block; the error names each bad block's line. */
export const validateChartBlocks = (markdown: string): Result<void> => {
  const problems = extractChartBlocks(markdown).flatMap((block) => {
    const result = parseChartSpec(block.source);
    return result.ok ? [] : [`chart block at line ${block.line}: ${result.error.message}`];
  });
  return problems.length > 0 ? err(new Error(problems.join('\n'))) : ok(undefined);
};

// ----- Legacy survey charts -----

export interface AggregatedSection {
  readonly sectionName: string;
  readonly questions: readonly {
    readonly label: string | null;
    readonly shortLabel: string | null;
    readonly avgScore: number;
    readonly scores: readonly number[];
    readonly comments: readonly string[];
  }[];
  readonly textResponses: readonly {
    readonly label: string | null;
    readonly responses: readonly string[];
  }[];
  readonly sectionComments: readonly string[];
}

/** Spec for a legacy `[chart:key]` tag over survey sections (0–5 Likert scale). */
export const sectionsToSpec = (key: string, sections: readonly AggregatedSection[]): ChartSpec | null => {
  const type: ChartType = key === 'radar_by_section' || key.startsWith('radar:') ? 'radar' : 'bar';

  if (key === 'avg' || key === 'avg_by_section' || key === 'radar_by_section') {
    const scored = sections.filter((s) => s.questions.length > 0);
    if (scored.length === 0) return null;
    return {
      type,
      labels: scored.map((s) => s.sectionName),
      series: [{ values: scored.map((s) => s.questions.reduce((sum, q) => sum + q.avgScore, 0) / s.questions.length) }],
      min: 0,
      max: 5
    };
  }

  const prefix = key.startsWith('scores:') ? 'scores:' : key.startsWith('radar:') ? 'radar:' : null;
  if (!prefix) return null;
  const section = sections.find((s) => s.sectionName === key.slice(prefix.length));
  if (!section) return null;
  return {
    type,
    labels: section.questions.map((q) => q.shortLabel ?? q.label ?? ''),
    series: [{ values: section.questions.map((q) => q.avgScore) }],
    min: 0,
    max: 5
  };
};
