// Which snapshots to keep: everything from the last 48 hours, then the newest
// per day for 30 days, then the newest per ISO week for 26 weeks — and always
// the 3 newest. Days and weeks are UTC.

export interface RetentionPolicy {
  readonly keepAllHours: number;
  readonly dailyDays: number;
  readonly weeklyWeeks: number;
  readonly minKeep: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = { keepAllHours: 48, dailyDays: 30, weeklyWeeks: 26, minKeep: 3 };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Snapshot ids are sortable UTC timestamps that are safe as folder names: 2026-09-12T19-00-00Z. */
export const snapshotId = (date: Date): string =>
  date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');

export const parseSnapshotId = (id: string): Date | null => {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/.exec(id);
  if (!m) return null;
  const date = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isoWeek = (date: Date): string => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

/** Ids that aren't snapshot timestamps are never selected for deletion (they're not returned either). */
export const selectSnapshotsToKeep = (
  ids: readonly string[],
  now: Date,
  policy: RetentionPolicy = DEFAULT_RETENTION
): ReadonlySet<string> => {
  const dated = ids
    .map((id) => ({ id, at: parseSnapshotId(id) }))
    .filter((s): s is { id: string; at: Date } => s.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const keep = new Set(dated.slice(0, policy.minKeep).map((s) => s.id));
  const days = new Set<string>();
  const weeks = new Set<string>();

  // Newest first, so the first snapshot seen in a day or week is that bucket's newest.
  for (const s of dated) {
    const age = now.getTime() - s.at.getTime();
    if (age < policy.keepAllHours * HOUR) {
      keep.add(s.id);
    } else if (age < policy.dailyDays * DAY) {
      const day = s.at.toISOString().slice(0, 10);
      if (!days.has(day)) {
        days.add(day);
        keep.add(s.id);
      }
    } else if (age < policy.weeklyWeeks * 7 * DAY) {
      const week = isoWeek(s.at);
      if (!weeks.has(week)) {
        weeks.add(week);
        keep.add(s.id);
      }
    }
  }
  return keep;
};
