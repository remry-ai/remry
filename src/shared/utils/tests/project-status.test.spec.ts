import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PROJECT_STATUS_SYNONYMS,
  isFinishedStatus,
  projectStatusLabel,
  projectStatusTone,
  statusKey,
  toProjectStatus,
  unknownStatusMessage
} from '../project-status';

describe('statusKey', () => {
  it('folds case, dashes, underscores and spaces', () => {
    expect(statusKey('  In_Progress ')).toBe('in progress');
    expect(statusKey('in--progress')).toBe('in progress');
  });
});

describe('toProjectStatus', () => {
  it('keeps the six', () => {
    for (const s of ['proposed', 'committed', 'in-progress', 'blocked', 'done', 'abandoned']) {
      expect(toProjectStatus(s)).toBe(s);
    }
  });

  it('maps common words', () => {
    expect(toProjectStatus('Idea')).toBe('proposed');
    expect(toProjectStatus('planning')).toBe('committed');
    expect(toProjectStatus('active')).toBe('in-progress');
    expect(toProjectStatus('In Progress')).toBe('in-progress');
    expect(toProjectStatus('in_progress')).toBe('in-progress');
    expect(toProjectStatus('On hold')).toBe('blocked');
    expect(toProjectStatus('Shipped')).toBe('done');
    expect(toProjectStatus('archived')).toBe('abandoned');
    expect(toProjectStatus('Cancelled')).toBe('abandoned');
  });

  it('treats blank as no status and anything else as not a status', () => {
    expect(toProjectStatus(null)).toBeNull();
    expect(toProjectStatus('  ')).toBeNull();
    expect(toProjectStatus('vibes')).toBeUndefined();
  });
});

describe('labels, tones and finished', () => {
  it('labels in-progress with a space', () => {
    expect(projectStatusLabel('in-progress')).toBe('in progress');
    expect(projectStatusLabel('done')).toBe('done');
    expect(projectStatusLabel(null)).toBeNull();
  });

  it('gives every status its own tone', () => {
    const tones = ['proposed', 'committed', 'in-progress', 'blocked', 'done', 'abandoned'].map(projectStatusTone);
    expect(new Set(tones).size).toBe(6);
    expect(projectStatusTone('in-progress')).toBe('success');
    expect(projectStatusTone(null)).toBe('muted');
  });

  it('counts done and abandoned as finished', () => {
    expect(isFinishedStatus('done')).toBe(true);
    expect(isFinishedStatus('abandoned')).toBe(true);
    expect(isFinishedStatus('blocked')).toBe(false);
  });

  it('names the six in the error', () => {
    expect(unknownStatusMessage('wip?')).toBe(
      'Unknown project status "wip?". Use one of: proposed, committed, in-progress, blocked, done, abandoned.'
    );
  });
});

describe('the project_statuses migration', () => {
  it('maps stored data with the same words as toProjectStatus', () => {
    const sql = readFileSync('prisma/migrations/20261008120000_project_statuses/migration.sql', 'utf8');
    const pairs = Object.fromEntries(
      [...sql.matchAll(/WHEN '((?:[^']|'')+)' THEN '([^']+)'/g)].map((m) => [m[1]!.replace(/''/g, "'"), m[2]])
    );
    expect(pairs).toEqual(PROJECT_STATUS_SYNONYMS);
  });
});
