import { describe, it, expect } from 'vitest';
import { planLayout, type LayoutState } from '../layout';

const state = (overrides: Partial<LayoutState> = {}): LayoutState => ({
  legacyDatabase: false,
  legacyFiles: false,
  legacySnapshots: [],
  notebookIds: [],
  legacyTargetHasDatabase: false,
  legacyTargetHasFiles: false,
  defaultId: null,
  ...overrides
});

describe('planLayout', () => {
  it('moves a pre-notebooks data directory into work-work and makes it the default', () => {
    const plan = planLayout(state({ legacyDatabase: true, legacyFiles: true, legacySnapshots: ['2026-09-12T19-00-00Z'] }));
    expect(plan.ok && plan.value).toEqual([
      { kind: 'create-notebook', id: 'work-work', name: 'work-work' },
      { kind: 'move-database' },
      { kind: 'move-files' },
      { kind: 'move-snapshot', snapshotId: '2026-09-12T19-00-00Z' },
      { kind: 'set-default', id: 'work-work' }
    ]);
  });

  it('creates one notebook in a fresh data directory', () => {
    const plan = planLayout(state());
    expect(plan.ok && plan.value).toEqual([
      { kind: 'create-notebook', id: 'notebook', name: 'Notebook' },
      { kind: 'set-default', id: 'notebook' }
    ]);
  });

  it('does nothing once the layout is in place', () => {
    const plan = planLayout(state({ notebookIds: ['work-work', 'garden'], defaultId: 'garden' }));
    expect(plan.ok && plan.value).toEqual([]);
  });

  it('finishes an interrupted move', () => {
    const plan = planLayout(state({ legacyFiles: true, notebookIds: ['work-work'], legacyTargetHasDatabase: true, defaultId: null }));
    expect(plan.ok && plan.value).toEqual([{ kind: 'move-files' }, { kind: 'set-default', id: 'work-work' }]);
  });

  it('picks a new default when the default notebook is gone', () => {
    const plan = planLayout(state({ notebookIds: ['garden', 'allotment'], defaultId: 'removed' }));
    expect(plan.ok && plan.value).toEqual([{ kind: 'set-default', id: 'allotment' }]);
  });

  it('refuses to overwrite a database or files that are already in work-work', () => {
    const db = planLayout(state({ legacyDatabase: true, notebookIds: ['work-work'], legacyTargetHasDatabase: true }));
    expect(!db.ok && db.error.message).toContain('Move one of them aside');
    const files = planLayout(state({ legacyFiles: true, notebookIds: ['work-work'], legacyTargetHasFiles: true }));
    expect(files.ok).toBe(false);
  });
});
