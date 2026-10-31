import { describe, expect, it } from 'vitest';
import { hasStoredImages, noteFromPage, pageMarkdown, projectPageContent, relinkContent, titleFromNote } from '../content';

const none = {
  description: null, status: null, owner: null, startDate: null, endDate: null,
  daysOptimistic: null, daysLikely: null, daysPessimistic: null, goals: []
};

describe('projectPageContent', () => {
  it('lists the facts the project has, then its brief', () => {
    expect(projectPageContent({
      ...none,
      description: 'Rebuild checkout.\n',
      status: 'in-progress',
      owner: { label: 'Payments', path: '/app/groups/g1' },
      startDate: new Date('2026-01-05T00:00:00Z'),
      daysLikely: 20,
      goals: [{ label: 'Grow [revenue]', path: '/app/goals/x' }]
    })).toBe([
      '- **Status:** In progress',
      '- **Owner:** [Payments](/app/groups/g1)',
      '- **Dates:** 2026-01-05 → ongoing',
      '- **Estimate:** ? / 20 / ? days (optimistic / likely / pessimistic)',
      '- **Goals:** [Grow revenue](/app/goals/x)',
      '',
      'Rebuild checkout.'
    ].join('\n'));
  });

  it('is empty for a project with nothing set, and just the brief without facts', () => {
    expect(projectPageContent(none)).toBe('');
    expect(projectPageContent({ ...none, description: 'Why' })).toBe('Why');
  });
});

describe('titleFromNote', () => {
  it('takes the first line without its markdown', () => {
    expect(titleFromNote('\n## Vendor **renewal** notes\nmore')).toBe('Vendor renewal notes');
    expect(titleFromNote('- [Datadog](https://x) costs')).toBe('Datadog costs');
    expect(titleFromNote('   ')).toBe('Untitled');
    expect(titleFromNote('x'.repeat(100))).toHaveLength(80);
  });
});

describe('relinkContent', () => {
  it('points links at the new path, leaving a longer id alone', () => {
    const text = 'See [it](/app/projects/abc) and http://127.0.0.1:7369/app/projects/abc?doc=1, not /app/projects/abcd';
    expect(relinkContent(text, '/app/projects/abc', '/app/wiki/p9')).toBe(
      'See [it](/app/wiki/p9) and http://127.0.0.1:7369/app/wiki/p9?doc=1, not /app/projects/abcd'
    );
  });
});

describe('page text', () => {
  it('turns a sheet into a table and keeps a document', () => {
    const sheet = JSON.stringify({ columns: [{ title: 'Item' }, { title: 'Cost' }], data: [['Rent', '1200']], values: [['Rent', '1200']] });
    expect(pageMarkdown('sheet', sheet)).toBe('| Item | Cost |\n| --- | --- |\n| Rent | 1200 |');
    expect(pageMarkdown('doc', '# Hi')).toBe('# Hi');
  });

  it('makes a note with the title in bold', () => {
    expect(noteFromPage('Datadog', 'Costs $40k')).toBe('**Datadog**\n\nCosts $40k');
    expect(noteFromPage('Datadog', '')).toBe('**Datadog**');
  });

  it('spots stored images', () => {
    expect(hasStoredImages('![x](storage://pages/p1/image-1.png)')).toBe(true);
    expect(hasStoredImages('![x](https://example.com/a.png)')).toBe(false);
  });
});
