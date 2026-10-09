// Pure: the dates a new or renewed license covers.

import { ok, err, type Result } from '../../src/shared/utils/result';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * From `from` (default today) for `months` months, through the day before the same
 * date that many months later: 2026-10-04 for 12 months runs through 2027-10-03.
 */
export const licensePeriod = (o: { readonly from?: string; readonly months: number; readonly today: Date }): Result<{ readonly issued: string; readonly expires: string }> => {
  if (!Number.isInteger(o.months) || o.months < 1 || o.months > 36) return err(new Error('--months must be a whole number from 1 to 36'));
  if (o.from !== undefined && !DATE.test(o.from)) return err(new Error('--from must be a date like 2027-10-04'));
  const start = o.from ? new Date(`${o.from}T00:00:00Z`) : new Date(Date.UTC(o.today.getUTCFullYear(), o.today.getUTCMonth(), o.today.getUTCDate()));
  if (Number.isNaN(start.getTime())) return err(new Error(`${o.from} isn't a date`));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + o.months, start.getUTCDate() - 1));
  return ok({ issued: iso(start), expires: iso(end) });
};
