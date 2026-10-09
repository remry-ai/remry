import { describe, it, expect } from 'vitest';
import { isBackupDue, isLockStale } from '../schedule';

const now = new Date('2026-09-30T12:00:00Z');

describe('isBackupDue', () => {
  it('is due without a previous run, or an unreadable one', () => {
    expect(isBackupDue(null, now)).toBe(true);
    expect(isBackupDue(new Date('garbage'), now)).toBe(true);
  });

  it('waits an hour after the last run', () => {
    expect(isBackupDue(new Date('2026-09-30T11:30:00Z'), now)).toBe(false);
    expect(isBackupDue(new Date('2026-09-30T11:00:00Z'), now)).toBe(true);
  });

  it('runs when the last run is in the future, as after a clock change', () => {
    expect(isBackupDue(new Date('2026-10-01T00:00:00Z'), now)).toBe(true);
  });
});

describe('isLockStale', () => {
  it('takes over a lock after 15 minutes', () => {
    expect(isLockStale(now.getTime() - 60_000, now.getTime())).toBe(false);
    expect(isLockStale(now.getTime() - 16 * 60_000, now.getTime())).toBe(true);
  });
});
