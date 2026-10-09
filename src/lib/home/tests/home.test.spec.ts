import { describe, it, expect } from 'vitest';
import { focusHeight, layoutFocus } from '../focus-layout';
import { timeAgo } from '../utils';

describe('layoutFocus', () => {
  const groups = [{ size: 1 }, { size: 5 }, { size: 9 }];

  it('places every pill inside the canvas, and the focus in the middle', () => {
    const layout = layoutFocus(groups, 1000, 560);
    expect(layout.centre).toEqual({ x: 500, y: 280 });
    expect(layout.nodes.map((g) => g.length)).toEqual([1, 5, 9]);
    for (const p of [...layout.nodes.flat(), ...layout.labels]) {
      expect(p.x).toBeGreaterThanOrEqual(90);
      expect(p.x).toBeLessThanOrEqual(910);
      expect(p.y).toBeGreaterThanOrEqual(36);
      expect(p.y).toBeLessThanOrEqual(524);
    }
  });

  it('starts at the top and gives each group its own slice', () => {
    const layout = layoutFocus([{ size: 1 }, { size: 1 }], 1000, 560);
    expect(layout.nodes[0]?.[0]?.x).toBeCloseTo(500);
    expect(layout.nodes[0]?.[0]?.y).toBeLessThan(280);
    expect(layout.nodes[1]?.[0]?.y).toBeGreaterThan(280);
  });

  it('is deterministic', () => {
    expect(layoutFocus(groups, 1000, 560)).toEqual(layoutFocus(groups, 1000, 560));
  });

  it('handles no groups', () => {
    expect(layoutFocus([], 1000, 560).nodes).toEqual([]);
  });

  it('with a second ring, puts the first ring inside and fans each branch out beyond its parent', () => {
    const layout = layoutFocus([{ size: 2, branches: [3, 0] }, { size: 1, branches: [2] }], 1000, 560);
    const distance = (p: { x: number; y: number }) => Math.hypot((p.x - 500) / 410, (p.y - 280) / 244);
    expect(layout.outer.map((g) => g.map((b) => b.length))).toEqual([[3, 0], [2]]);
    for (const p of layout.nodes.flat()) expect(distance(p)).toBeCloseTo(0.5);
    for (const p of layout.outer.flat(2)) {
      expect(distance(p)).toBeCloseTo(1);
      expect(p.x).toBeGreaterThanOrEqual(90);
      expect(p.x).toBeLessThanOrEqual(910);
    }
    // A branch's middle child sits on its parent's angle.
    const parent = layout.nodes[0]![0]!;
    const middle = layout.outer[0]![0]![1]!;
    expect(Math.atan2(middle.y - 280, (middle.x - 500) * 244 / 410)).toBeCloseTo(Math.atan2(parent.y - 280, (parent.x - 500) * 244 / 410));
  });

  it('keeps the one-ring layout when no pill has a branch', () => {
    expect(layoutFocus([{ size: 2, branches: [0, 0] }], 1000, 560).nodes).toEqual(layoutFocus([{ size: 2 }], 1000, 560).nodes);
  });
});

describe('focusHeight', () => {
  it('grows with the number of pills, up to a limit', () => {
    expect(focusHeight(3)).toBe(390);
    expect(focusHeight(10)).toBe(520);
    expect(focusHeight(30)).toBeGreaterThan(520);
    expect(focusHeight(500)).toBe(910);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-09-12T12:00:00Z');
  it('formats relative times', () => {
    expect(timeAgo(new Date('2026-09-12T11:59:30Z'), now)).toBe('just now');
    expect(timeAgo(new Date('2026-09-12T11:55:00Z'), now)).toBe('5m ago');
    expect(timeAgo(new Date('2026-09-12T09:00:00Z'), now)).toBe('3h ago');
    expect(timeAgo('2026-09-10T12:00:00Z', now)).toBe('2d ago');
  });
});
