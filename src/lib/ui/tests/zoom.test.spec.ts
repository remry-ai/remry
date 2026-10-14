import { describe, it, expect } from 'vitest';
import { ZOOM_LIMITS, centredView, fitView, panBy, scaleLabel, zoomAt } from '../zoom';

const viewport = { width: 1000, height: 800 };

describe('fitView', () => {
  it('shrinks wide content to the viewport width, centred', () => {
    expect(fitView({ width: 2000, height: 400 }, viewport)).toEqual({ scale: 0.5, x: 0, y: 300 });
  });

  it('shrinks tall content to the viewport height, inside the padding', () => {
    expect(fitView({ width: 100, height: 1520 }, viewport, 20)).toEqual({ scale: 0.5, x: 475, y: 20 });
  });

  it('grows small content to fill the viewport, up to the limit', () => {
    expect(fitView({ width: 250, height: 100 }, viewport)).toEqual({ scale: 4, x: 0, y: 200 });
    expect(fitView({ width: 10, height: 10 }, viewport).scale).toBe(ZOOM_LIMITS.max);
  });

  it('leaves empty content at 1', () => {
    expect(fitView({ width: 0, height: 0 }, viewport)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe('centredView', () => {
  it('centres the content at a scale', () => {
    expect(centredView({ width: 200, height: 100 }, viewport, 1)).toEqual({ scale: 1, x: 400, y: 350 });
  });
});

describe('zoomAt', () => {
  it('keeps the point under the cursor fixed', () => {
    const view = { scale: 1, x: 100, y: 50 };
    const point = { x: 300, y: 250 };
    const zoomed = zoomAt(view, 2, point);
    expect(zoomed.scale).toBe(2);
    // The content point under the cursor before and after.
    expect((point.x - view.x) / view.scale).toBeCloseTo((point.x - zoomed.x) / zoomed.scale);
    expect((point.y - view.y) / view.scale).toBeCloseTo((point.y - zoomed.y) / zoomed.scale);
  });

  it('stops at the limits', () => {
    expect(zoomAt({ scale: 7, x: 0, y: 0 }, 2, { x: 0, y: 0 }).scale).toBe(ZOOM_LIMITS.max);
    expect(zoomAt({ scale: 0.12, x: 0, y: 0 }, 0.5, { x: 0, y: 0 }).scale).toBe(ZOOM_LIMITS.min);
  });
});

describe('panBy and scaleLabel', () => {
  it('moves the content and names the scale', () => {
    expect(panBy({ scale: 2, x: 10, y: 20 }, 5, -5)).toEqual({ scale: 2, x: 15, y: 15 });
    expect(scaleLabel({ scale: 1.5, x: 0, y: 0 })).toBe('150%');
  });
});
