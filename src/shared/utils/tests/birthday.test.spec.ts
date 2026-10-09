import { describe, it, expect } from 'vitest';
import { formatBirthday, upcomingBirthdays } from '../birthday';

describe('birthdays', () => {
  it('formats with or without the year', () => {
    expect(formatBirthday('1990-05-03')).toBe('3 May 1990');
    expect(formatBirthday('--12-25')).toBe('25 December');
  });

  it('lists the next month of birthdays, soonest first, across the new year', () => {
    const people = [
      { name: 'Sam', birthday: '1990-12-30' },
      { name: 'Alex', birthday: '--12-20' },
      { name: 'Jo', birthday: '1985-01-05' },
      { name: 'Kim', birthday: '1980-06-01' },
      { name: 'Lee', birthday: null }
    ];
    const upcoming = upcomingBirthdays(people, new Date(2026, 11, 20));
    expect(upcoming.map((b) => [b.item.name, b.inDays, b.turns])).toEqual([
      ['Alex', 0, null],
      ['Sam', 10, 36],
      ['Jo', 16, 42]
    ]);
  });
});
