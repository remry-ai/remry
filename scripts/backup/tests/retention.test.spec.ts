import { describe, it, expect } from 'vitest';
import { parseSnapshotId, selectSnapshotsToKeep, snapshotId } from '../retention';

const now = new Date('2026-09-12T12:00:00Z');
const hoursAgo = (h: number): string => snapshotId(new Date(now.getTime() - h * 3_600_000));

describe('snapshot ids', () => {
  it('round-trips and sorts chronologically', () => {
    const id = snapshotId(new Date('2026-09-12T19:05:07.123Z'));
    expect(id).toBe('2026-09-12T19-05-07Z');
    expect(parseSnapshotId(id)?.toISOString()).toBe('2026-09-12T19:05:07.000Z');
    expect([hoursAgo(1), hoursAgo(30), hoursAgo(5)].sort()).toEqual([hoursAgo(30), hoursAgo(5), hoursAgo(1)]);
  });

  it('rejects anything else', () => {
    expect(parseSnapshotId('.2026-09-12T19-05-07Z.partial')).toBeNull();
    expect(parseSnapshotId('notes')).toBeNull();
  });
});

describe('selectSnapshotsToKeep', () => {
  // One snapshot every hour for a year.
  const hourly = Array.from({ length: 24 * 365 }, (_, h) => hoursAgo(h + 0.5));
  const keep = selectSnapshotsToKeep(hourly, now);
  const kept = [...keep].map((id) => parseSnapshotId(id)!).sort((a, b) => b.getTime() - a.getTime());
  const age = (d: Date): number => (now.getTime() - d.getTime()) / 3_600_000;

  it('keeps every snapshot from the last 48 hours', () => {
    expect(kept.filter((d) => age(d) < 48)).toHaveLength(48);
  });

  it('keeps one snapshot per day between 48 hours and 30 days, the newest of that day', () => {
    const daily = kept.filter((d) => age(d) >= 48 && age(d) < 30 * 24);
    const days = daily.map((d) => d.toISOString().slice(0, 10));
    expect(new Set(days).size).toBe(days.length);
    expect(daily.every((d) => d.getUTCHours() === 23 || age(d) < 72)).toBe(true);
  });

  it('keeps roughly one per week up to 26 weeks and nothing older', () => {
    const weekly = kept.filter((d) => age(d) >= 30 * 24);
    expect(weekly.length).toBeGreaterThanOrEqual(21);
    expect(weekly.length).toBeLessThanOrEqual(23);
    expect(kept.every((d) => age(d) < 26 * 7 * 24)).toBe(true);
  });

  it('always keeps the newest few, however old', () => {
    const old = [snapshotId(new Date('2020-01-01T00:00:00Z')), snapshotId(new Date('2020-01-02T00:00:00Z'))];
    expect([...selectSnapshotsToKeep(old, now)].sort()).toEqual(old);
  });

  it('ignores ids that are not snapshots', () => {
    expect(selectSnapshotsToKeep(['.tmp.partial', hoursAgo(1)], now).has('.tmp.partial')).toBe(false);
  });
});
