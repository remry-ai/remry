// Birthdays are `YYYY-MM-DD`, or `--MM-DD` when the year isn't known.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const parts = (birthday: string): { readonly year: number | null; readonly month: number; readonly day: number } | null => {
  const match = /^(?:(\d{4})-|--)(\d{2})-(\d{2})$/.exec(birthday);
  if (!match) return null;
  return { year: match[1] ? Number(match[1]) : null, month: Number(match[2]), day: Number(match[3]) };
};

/** `3 May 1990`, or `3 May` without the year. */
export const formatBirthday = (birthday: string): string => {
  const p = parts(birthday);
  if (!p) return birthday;
  return `${p.day} ${MONTHS[p.month - 1]}${p.year ? ` ${p.year}` : ''}`;
};

export interface UpcomingBirthday<T> {
  readonly item: T;
  /** 0 is today. */
  readonly inDays: number;
  /** The age they turn, when the year is known. */
  readonly turns: number | null;
}

const DAY = 24 * 60 * 60 * 1000;

/** Birthdays in the next `withinDays` days (today included), soonest first. 29 February falls on 1 March in other years. */
export const upcomingBirthdays = <T extends { readonly birthday: string | null }>(
  items: readonly T[],
  today: Date,
  withinDays = 30
): readonly UpcomingBirthday<T>[] => {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const found: UpcomingBirthday<T>[] = [];
  for (const item of items) {
    const p = item.birthday ? parts(item.birthday) : null;
    if (!p) continue;
    for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
      const date = new Date(Date.UTC(year, p.month - 1, p.day));
      const inDays = Math.round((date.getTime() - start) / DAY);
      if (inDays >= 0) {
        if (inDays <= withinDays) found.push({ item, inDays, turns: p.year ? year - p.year : null });
        break;
      }
    }
  }
  return found.sort((a, b) => a.inDays - b.inDays);
};
