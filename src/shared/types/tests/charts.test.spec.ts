import { describe, it, expect } from 'vitest';
import { extractChartBlocks, parseChartSpec, sectionsToSpec, validateChartBlocks, type AggregatedSection } from '../charts';

const chart = (json: string): string => ['```chart', json, '```'].join('\n');

describe('extractChartBlocks', () => {
  it('finds every chart block with its line number and skips other fences', () => {
    const md = [
      '# Report',                                   // 1
      '',                                           // 2
      chart('{"type":"bar","labels":["a"],"series":[{"values":[1]}]}'), // 3-5
      '',                                           // 6
      '```ts',                                      // 7
      '```chart',                                   // 8 (inside a ts fence? no: ts fence closes on this line)
      'const x = 1;',
      '```',
      chart('{"type":"line","labels":["a"],"series":[{"values":[2]}]}')
    ].join('\n');

    const blocks = extractChartBlocks(md);
    expect(blocks.map((b) => b.line)).toEqual([3, 11]);
    expect(blocks[1]!.source).toContain('"line"');
  });
});

describe('parseChartSpec', () => {
  it('accepts a multi-series spec', () => {
    const result = parseChartSpec('{"type":"radar","labels":["x","y"],"series":[{"label":"Q1","values":[1,2]},{"label":"Q2","values":[3,4]}],"max":5}');
    expect(result.ok).toBe(true);
  });

  it('reports a series whose length does not match the labels', () => {
    const result = parseChartSpec('{"type":"bar","labels":["a","b","c"],"series":[{"values":[1,2]}]}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('series.0.values has 2 values but there are 3 labels');
  });

  it('accepts a hex colour per series and rejects anything else', () => {
    const spec = (color: string): string =>
      `{"type":"line","labels":["a"],"series":[{"values":[1],"color":${JSON.stringify(color)}},{"values":[2]}]}`;
    const result = parseChartSpec(spec('#2563EB'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.series.map((s) => s.color)).toEqual(['#2563EB', undefined]);

    for (const bad of ['red', '#fff', '2563eb', 'rgb(0,0,0)']) {
      const rejected = parseChartSpec(spec(bad));
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) expect(rejected.error.message).toContain('series.0.color must be a hex colour');
    }
  });

  it('reports invalid JSON', () => {
    const result = parseChartSpec('{type: bar}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/^invalid JSON/);
  });

  it('rejects unknown chart types and unknown keys', () => {
    expect(parseChartSpec('{"type":"pie","labels":["a"],"series":[{"values":[1]}]}').ok).toBe(false);
    expect(parseChartSpec('{"type":"bar","labels":["a"],"series":[{"values":[1]}],"colour":"red"}').ok).toBe(false);
  });
});

describe('validateChartBlocks', () => {
  it('passes markdown without charts', () => {
    expect(validateChartBlocks('# Just text').ok).toBe(true);
  });

  it('names the line of each bad block', () => {
    const md = ['intro', chart('{"type":"bar","labels":["a"],"series":[{"values":[1]}]}'), chart('not json')].join('\n');
    const result = validateChartBlocks(md);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('chart block at line 5');
      expect(result.error.message).not.toContain('line 2');
    }
  });
});

describe('sectionsToSpec', () => {
  const sections: readonly AggregatedSection[] = [
    { sectionName: 'Delivery', questions: [
      { label: 'Ships on time', shortLabel: 'Time', avgScore: 4, scores: [4], comments: [] },
      { label: 'Quality', shortLabel: null, avgScore: 2, scores: [2], comments: [] }
    ], textResponses: [], sectionComments: [] },
    { sectionName: 'Empty', questions: [], textResponses: [], sectionComments: [] }
  ];

  it('averages scored sections for avg_by_section', () => {
    expect(sectionsToSpec('avg_by_section', sections)).toEqual({
      type: 'bar', labels: ['Delivery'], series: [{ values: [3] }], min: 0, max: 5
    });
  });

  it('builds a radar of one section', () => {
    const spec = sectionsToSpec('radar:Delivery', sections);
    expect(spec?.type).toBe('radar');
    expect(spec?.labels).toEqual(['Time', 'Quality']);
  });

  it('returns null for unknown keys and sections', () => {
    expect(sectionsToSpec('scores:Nope', sections)).toBeNull();
    expect(sectionsToSpec('bogus', sections)).toBeNull();
  });
});
