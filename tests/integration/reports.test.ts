// Reports against a real database: branding resolution and chart validation.

import { describe, it, expect } from 'vitest';
import { getRegistry } from '../../src/shared/registry.server';
import { createBranding } from '../../src/api/branding/operations';
import { createReport, getReport, updateReport } from '../../src/api/attached/report/operations';
import { TEST_NOTEBOOK } from './test-notebooks';

const chart = (json: string): string => ['```chart', json, '```'].join('\n');

describe('reports', () => {
  it('creates a report with a valid chart, resolves default branding, rejects a bad chart on update', async () => {
    const reg = getRegistry(TEST_NOTEBOOK);

    const branding = await createBranding(reg, { name: 'Acme', primaryColor: '#123456', isDefault: true });
    expect(branding.ok).toBe(true);

    const content = ['# Q3 review', '', chart('{"type":"bar","labels":["Jul","Aug","Sep"],"series":[{"values":[3,5,4]}]}')].join('\n');
    const created = await createReport(reg, { entityType: 'PERSON', entityId: 'person_bob', title: 'Q3 review', content });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const report = await getReport(reg, created.value.id);
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.value.entityName).toBe('Bob Smith');
    expect(report.value.brandingId).toBeNull();
    expect(report.value.branding?.name).toBe('Acme');
    expect(report.value.branding?.primaryColor).toBe('#123456');

    const bad = await updateReport(reg, created.value.id, {
      content: ['# Q3 review', '', chart('{"type":"bar","labels":["Jul","Aug","Sep"],"series":[{"values":[1,2]}]}')].join('\n')
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.message).toContain('chart block at line 3');

    const unchanged = await getReport(reg, created.value.id);
    expect(unchanged.ok && unchanged.value.content).toBe(content);
  });
});
