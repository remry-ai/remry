import { describe, it, expect } from 'vitest';
import { entityPath, parseEntityPath } from '../entity';
import { extractEntityLinks } from '../mentions';

describe('parseEntityPath', () => {
  it('round-trips every entity type that has a page', () => {
    for (const entityType of ['PERSON', 'GROUP', 'PROJECT', 'GOAL', 'PAGE', 'REPORT'] as const) {
      expect(parseEntityPath(entityPath(entityType, 'abc_123'))).toEqual({ entityType, entityId: 'abc_123' });
    }
  });

  it('accepts loopback origins, query strings and sub-paths', () => {
    expect(parseEntityPath('http://127.0.0.1:5173/app/wiki/p1?popup=edit-page')).toEqual({ entityType: 'PAGE', entityId: 'p1' });
    expect(parseEntityPath('http://localhost:5173/app/reports/r1/print')).toEqual({ entityType: 'REPORT', entityId: 'r1' });
  });

  it('ignores other hosts and routes that are not entities', () => {
    expect(parseEntityPath('https://example.com/app/wiki/p1')).toBeNull();
    expect(parseEntityPath('/app/todos')).toBeNull();
    expect(parseEntityPath('/app/orgmap/x')).toBeNull();
  });
});

describe('extractEntityLinks', () => {
  it('finds markdown links, autolinks and bare loopback URLs, once each', () => {
    const md = [
      'We moved off [Jira](/app/wiki/jira) to [Linear](/app/wiki/linear "Linear").',
      'Owner: <http://127.0.0.1:5173/app/teams/t1>',
      'See http://localhost:5173/app/wiki/jira.'
    ].join('\n');
    expect(extractEntityLinks(md)).toEqual([
      { entityType: 'PAGE', entityId: 'jira' },
      { entityType: 'PAGE', entityId: 'linear' },
      { entityType: 'GROUP', entityId: 't1' }
    ]);
  });

  it('skips fenced code, inline code and external links', () => {
    const md = [
      '```md',
      '[x](/app/wiki/in-fence)',
      '```',
      'Write `[y](/app/wiki/inline)` to link.',
      '[docs](https://example.com/app/wiki/z)',
      '[Q3 goal](/app/goals/g1)'
    ].join('\n');
    expect(extractEntityLinks(md)).toEqual([{ entityType: 'GOAL', entityId: 'g1' }]);
  });
});
