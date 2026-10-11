import { describe, expect, it } from 'vitest';
import { activeAfterResize, isDrawerOpen, toggledActive } from '../drawer-state';

describe('isDrawerOpen', () => {
  it('follows the remembered state while docked', () => {
    expect(isDrawerOpen('left', false, true, null)).toBe(true);
    expect(isDrawerOpen('left', false, false, 'left')).toBe(false);
  });

  it('follows the active drawer while floating', () => {
    expect(isDrawerOpen('right', true, true, null)).toBe(false);
    expect(isDrawerOpen('right', true, false, 'right')).toBe(true);
    expect(isDrawerOpen('right', true, true, 'left')).toBe(false);
  });
});

describe('toggledActive', () => {
  it('opens one floating drawer at a time', () => {
    expect(toggledActive('left', null)).toBe('left');
    expect(toggledActive('right', 'left')).toBe('right');
    expect(toggledActive('right', 'right')).toBeNull();
  });
});

describe('activeAfterResize', () => {
  it('closes a floating drawer once its side docks', () => {
    expect(activeAfterResize('left', false, true)).toBeNull();
    expect(activeAfterResize('right', true, false)).toBeNull();
  });

  it('keeps one that still floats', () => {
    expect(activeAfterResize('left', true, false)).toBe('left');
    expect(activeAfterResize(null, true, true)).toBeNull();
  });
});
