import { describe, expect, it } from 'vitest';
import { expectedDays, relativeSize, sizeBarHeight, shortDuration, sizeText, timelineAxis, timelineBar, toDay } from '../project-timeline';

const TODAY = '2026-08-15';

describe('toDay', () => {
  it('reads Dates and ISO strings', () => {
    expect(toDay(new Date('2026-07-01T00:00:00Z'))).toBe('2026-07-01');
    expect(toDay('2026-07-01T00:00:00.000Z')).toBe('2026-07-01');
    expect(toDay(null)).toBeNull();
    expect(toDay('soon')).toBeNull();
  });
});

describe('timelineAxis', () => {
  it('is null when nothing is dated', () => {
    expect(timelineAxis([{ status: 'in-progress' }], TODAY)).toBeNull();
  });

  it('spans whole months from the earliest date to the latest', () => {
    const axis = timelineAxis([{ status: 'in-progress', startDate: '2026-07-10', endDate: '2026-09-20' }], TODAY);
    expect(axis?.start).toBe('2026-07-01');
    expect(axis?.end).toBe('2026-10-01');
    expect(axis?.months.map((m) => m.label)).toEqual(['Jul', 'Aug', 'Sep']);
    expect(axis?.months[0]?.offset).toBe(0);
  });

  it('always includes today', () => {
    const axis = timelineAxis([{ status: 'in-progress', endDate: '2026-03-05' }], TODAY);
    expect(axis?.start).toBe('2026-03-01');
    expect(axis?.end).toBe('2026-09-01');
    expect(axis!.today).toBeGreaterThan(0.8);
    expect(axis!.today).toBeLessThan(1);
  });

  it('puts the year on January', () => {
    const axis = timelineAxis([{ status: 'in-progress', startDate: '2026-11-01', endDate: '2027-02-01' }], '2026-11-02');
    expect(axis?.months.map((m) => m.label)).toEqual(['Nov', 'Dec', "Jan '27", 'Feb']);
  });

  it('labels fewer months on a long axis', () => {
    const axis = timelineAxis([{ status: 'in-progress', startDate: '2026-01-01', endDate: '2027-12-01' }], TODAY);
    expect(axis?.months).toHaveLength(24);
    expect(axis?.months.filter((m) => m.label !== null)).toHaveLength(12);
  });
});

describe('timelineBar', () => {
  const julToSep = { status: 'in-progress', startDate: '2026-07-01', endDate: '2026-09-30' };
  const octToDec = { status: 'committed', startDate: '2026-10-01', endDate: '2026-12-31' };
  const axis = timelineAxis([julToSep, octToDec], TODAY)!;

  it('runs from start to target', () => {
    const bar = timelineBar(julToSep, axis, TODAY)!;
    expect(bar.left).toBe(0);
    expect(bar.left + bar.width).toBeCloseTo(axis.months[3]?.offset ?? 0);
    expect(bar.late).toBeNull();
    expect(bar.tone).toBe('success');
    expect(bar.title).toBe('Jul 1, 2026 → Sep 30, 2026');
  });

  it('marks the stretch past a missed target as late', () => {
    const bar = timelineBar({ status: 'in-progress', startDate: '2026-07-01', endDate: '2026-08-01' }, axis, TODAY)!;
    expect(bar.late).not.toBeNull();
    expect(bar.late!.left + bar.late!.width).toBeCloseTo(axis.today);
    expect(bar.title).toBe('Jul 1, 2026 → Aug 1, 2026 · 2w late');
  });

  it('is not late once finished', () => {
    expect(timelineBar({ status: 'done', endDate: '2026-08-01' }, axis, TODAY)!.late).toBeNull();
    expect(timelineBar({ status: 'in-progress', archivedAt: '2026-08-02', endDate: '2026-08-01' }, axis, TODAY)!.late).toBeNull();
  });

  it('runs an open-ended bar from the start to today', () => {
    const bar = timelineBar({ status: 'in-progress', startDate: '2026-07-01' }, axis, TODAY)!;
    expect(bar.open).toBe(true);
    expect(bar.marker).toBe(false);
    expect(bar.left + bar.width).toBeCloseTo(axis.today);
  });

  it('marks a future start with no target', () => {
    const bar = timelineBar({ status: 'committed', startDate: '2026-11-01' }, axis, TODAY)!;
    expect(bar.marker).toBe(true);
    expect(bar.width).toBe(0);
  });

  it('marks a target with no start', () => {
    const bar = timelineBar({ status: 'committed', endDate: '2026-11-01' }, axis, TODAY)!;
    expect(bar.marker).toBe(true);
    expect(bar.title).toBe('Target Nov 1, 2026 · no start date');
  });

  it('is null without dates', () => {
    expect(timelineBar({ status: 'in-progress' }, axis, TODAY)).toBeNull();
  });
});

describe('shortDuration', () => {
  it('picks days, weeks or months', () => {
    expect(shortDuration(5)).toBe('5d');
    expect(shortDuration(21)).toBe('3w');
    expect(shortDuration(120)).toBe('4mo');
  });
});

describe('expectedDays', () => {
  it('uses PERT with all three points', () => {
    expect(expectedDays({ daysOptimistic: 10, daysLikely: 15, daysPessimistic: 32 })).toBe(17);
  });

  it('falls back to the likely value, then the mean of what is given', () => {
    expect(expectedDays({ daysLikely: 12 })).toBe(12);
    expect(expectedDays({ daysOptimistic: 10, daysLikely: 12 })).toBe(12);
    expect(expectedDays({ daysOptimistic: 10, daysPessimistic: 20 })).toBe(15);
    expect(expectedDays({})).toBeNull();
  });
});

describe('sizeText', () => {
  it('labels the expected days and lists the points', () => {
    expect(sizeText({ daysOptimistic: 10, daysLikely: 15, daysPessimistic: 32 })).toEqual({
      label: '~17d',
      title: 'About 17 days (optimistic 10, likely 15, pessimistic 32)'
    });
    expect(sizeText({})).toBeNull();
  });
});

describe('relativeSize', () => {
  it('scales against the biggest', () => {
    expect(relativeSize(10, 40)).toBe(0.25);
    expect(relativeSize(10, 0)).toBe(0);
  });
});

describe('sizeBarHeight', () => {
  it('scales by the square root up to the full height', () => {
    expect(sizeBarHeight(1)).toBe(20);
    expect(sizeBarHeight(0.25)).toBe(10);
  });

  it('spreads small projects apart', () => {
    expect(sizeBarHeight(8 / 63)).toBe(7);
    expect(sizeBarHeight(10 / 63)).toBe(8);
  });

  it('keeps a tiny project visible', () => {
    expect(sizeBarHeight(0)).toBe(2);
  });
});
