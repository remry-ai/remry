import { describe, it, expect } from 'vitest';
import {
  canAddDrawing, drawingLimitMessage, FREE_DRAWINGS, lockedMessage, NO_LICENSE, PRO_FEATURE_DETAILS, PRO_FEATURE_LABELS, PRO_FEATURES,
  type LicenseStatus
} from '../license';
import { REMRY_LINKS } from '../site';

const active: LicenseStatus = { state: 'active', licensee: { name: 'Dana', email: 'd@x' }, expires: '2027-10-03', daysLeft: 300, problem: null };
const expired: LicenseStatus = { state: 'expired', licensee: { name: 'Dana', email: 'd@x' }, expires: '2026-01-01', daysLeft: -10, problem: null };
const invalid: LicenseStatus = { state: 'invalid', licensee: null, expires: null, daysLeft: null, problem: 'revoked' };

describe('Pro features', () => {
  it('leaves full-text search and spreadsheets free', () => {
    expect(PRO_FEATURES).toEqual(['ai', 'sync', 'drawings', 'branding', 'other-devices']);
    expect(PRO_FEATURES as readonly string[]).not.toContain('search');
    expect(PRO_FEATURES as readonly string[]).not.toContain('pdf-export');
  });

  it('names and describes every feature', () => {
    for (const feature of PRO_FEATURES) {
      expect(PRO_FEATURE_LABELS[feature]).toMatch(/\S/);
      expect(PRO_FEATURE_DETAILS[feature]).toMatch(/\S/);
    }
  });

  it('says each feature is part of Remry Pro, in a sentence that reads', () => {
    expect(lockedMessage('ai', NO_LICENSE)).toBe(`AI assist is part of Remry Pro. Buy a license (${REMRY_LINKS.buy}), then add its key in the app (License) or with license.activate.`);
    expect(lockedMessage('other-devices', NO_LICENSE, 'app')).toBe('Opening Remry on other devices is part of Remry Pro. Buy a license, then add its key on the License page.');
  });
});

describe('canAddDrawing', () => {
  it(`allows ${FREE_DRAWINGS} drawings without a license, then refuses`, () => {
    expect(FREE_DRAWINGS).toBe(3);
    for (const status of [NO_LICENSE, expired, invalid]) {
      expect([0, 1, 2, 3, 4, 10].map((used) => canAddDrawing(used, status))).toEqual([true, true, true, false, false, false]);
    }
  });

  it('never refuses with an active license', () => {
    expect([0, 3, 4, 500].map((used) => canAddDrawing(used, active))).toEqual([true, true, true, true]);
  });
});

describe('drawingLimitMessage', () => {
  it('says how many there are, that they stay editable, and how to get more', () => {
    const message = drawingLimitMessage(3, NO_LICENSE);
    expect(message).toBe(
      `This notebook has 3 drawings, and 3 are free in each notebook; more are part of Remry Pro. Its drawings stay editable either way, and deleting one frees a place. Buy a license (${REMRY_LINKS.buy}), then add its key in the app (License) or with license.activate.`
    );
    expect(drawingLimitMessage(1, NO_LICENSE)).toContain('has 1 drawing,');
  });

  it('says when the license expired, for the app without links', () => {
    const message = drawingLimitMessage(4, expired, 'app');
    expect(message).toContain('This notebook has 4 drawings');
    expect(message).toContain('expired on 2026-01-01');
    expect(message).not.toContain('http');
  });
});
