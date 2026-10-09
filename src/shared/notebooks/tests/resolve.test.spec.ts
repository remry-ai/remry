import { describe, it, expect } from 'vitest';
import { notebookFromEnv, resolveNotebook, type NotebookChoices } from '../resolve';

const notebooks = [
  { id: 'work-work', name: 'Work', profile: 'work' as const, createdAt: '' },
  { id: 'garden', name: 'Garden', profile: 'home' as const, createdAt: '' },
  { id: 'side', name: 'Side project', profile: 'work' as const, createdAt: '' }
];

const pick = (choices: Partial<NotebookChoices>): string => {
  const result = resolveNotebook({ notebooks, defaultId: 'work-work', ...choices });
  return result.ok ? result.value.id : `error: ${result.error.message}`;
};

describe('resolveNotebook', () => {
  it('uses the named notebook first, then REMRY_NOTEBOOK, then the remembered one, then the default', () => {
    expect(pick({ explicit: 'garden', env: 'side', remembered: 'side' })).toBe('garden');
    expect(pick({ env: 'side', remembered: 'garden' })).toBe('side');
    expect(pick({ remembered: 'garden' })).toBe('garden');
    expect(pick({})).toBe('work-work');
  });

  it('matches a name, ignoring case', () => {
    expect(pick({ explicit: 'side PROJECT' })).toBe('side');
    expect(pick({ env: ' work ' })).toBe('work-work');
  });

  it('refuses a named notebook that does not exist, listing the ones that do', () => {
    expect(pick({ explicit: 'nope' })).toBe('error: There is no notebook "nope". Notebooks: work-work, garden, side. Use notebook.list to see them, or notebook.create to add one.');
    expect(pick({ env: 'nope' })).toContain('REMRY_NOTEBOOK is "nope"');
  });

  it('ignores a remembered notebook that is gone, and a default that is gone', () => {
    expect(pick({ remembered: 'deleted' })).toBe('work-work');
    expect(pick({ defaultId: 'deleted' })).toBe('work-work');
    expect(pick({ defaultId: null })).toBe('work-work');
  });

  it('fails when there are no notebooks', () => {
    expect(resolveNotebook({ notebooks: [], defaultId: null }).ok).toBe(false);
  });
});

describe('notebookFromEnv', () => {
  it('reads REMRY_NOTEBOOK, then its name before the rename', () => {
    expect(notebookFromEnv({ REMRY_NOTEBOOK: 'home', WNOTES_NOTEBOOK: 'work' })).toBe('home');
    expect(notebookFromEnv({ WONO_NOTEBOOK: 'home', WNOTES_NOTEBOOK: 'work' })).toBe('home');
    expect(notebookFromEnv({ WNOTES_NOTEBOOK: 'work' })).toBe('work');
    expect(notebookFromEnv({ REMRY_NOTEBOOK: '' })).toBeUndefined();
  });
});
