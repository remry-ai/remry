import { describe, it, expect } from 'vitest';
import { checksum, planMigrations, planRenames, type AppliedMigration, type MigrationFile } from '../migrate.server';

const file = (name: string, sql = `-- ${name}`): MigrationFile => ({ name, sql, checksum: checksum(sql) });
const applied = (m: MigrationFile, overrides: Partial<AppliedMigration> = {}): AppliedMigration => ({
  migrationName: m.name,
  checksum: m.checksum,
  finishedAt: '2026-01-01T00:00:00Z',
  rolledBackAt: null,
  ...overrides
});

describe('checksum', () => {
  it('is the hex SHA-256 of the SQL, as Prisma records it', () => {
    expect(checksum('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('planMigrations', () => {
  const a = file('20260101000000_init');
  const b = file('20260201000000_add_reports');

  it('returns every migration for a fresh database, in name order', () => {
    const result = planMigrations([b, a], []);
    expect(result.ok && result.value.pending.map((m) => m.name)).toEqual([a.name, b.name]);
  });

  it('returns only migrations that have not been applied', () => {
    const result = planMigrations([a, b], [applied(a)]);
    expect(result.ok && result.value.pending.map((m) => m.name)).toEqual([b.name]);
  });

  it('refuses a migration edited after it was applied', () => {
    const result = planMigrations([file(a.name, '-- edited')], [applied(a)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('modified after it was applied');
  });

  it('refuses when an applied migration is missing from disk', () => {
    const result = planMigrations([b], [applied(a), applied(b)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('missing');
  });

  it('refuses when a previous migration failed part way', () => {
    const result = planMigrations([a], [applied(a, { finishedAt: null })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('failed');
  });

  it('ignores rolled-back rows', () => {
    const result = planMigrations([a], [applied(a, { finishedAt: null, rolledBackAt: '2026-01-02T00:00:00Z' })]);
    expect(result.ok && result.value.pending.map((m) => m.name)).toEqual([a.name]);
  });
});

describe('planRenames', () => {
  const renamed = { '20260101000000_kinds': '20260102000000_kinds' };
  const moved = file('20260102000000_kinds', '-- same sql');

  it('renames a row recorded under the old name when the new file has the same SQL', () => {
    const row = applied({ ...moved, name: '20260101000000_kinds' });
    expect(planRenames([moved], [row], renamed)).toEqual([{ from: '20260101000000_kinds', to: '20260102000000_kinds' }]);
  });

  it('leaves it alone when the SQL differs or the new name is already recorded', () => {
    const changed = applied({ ...file('20260101000000_kinds', '-- other sql') });
    expect(planRenames([moved], [changed], renamed)).toEqual([]);
    const both = [applied({ ...moved, name: '20260101000000_kinds' }), applied(moved)];
    expect(planRenames([moved], both, renamed)).toEqual([]);
  });
});
