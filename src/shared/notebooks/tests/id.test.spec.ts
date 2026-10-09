import { describe, it, expect } from 'vitest';
import { isNotebookId, notebookIdFromName } from '../id';

describe('isNotebookId', () => {
  it('accepts lowercase slugs', () => {
    for (const id of ['work', 'work-work', 'a', 'q4-2026', 'x'.repeat(40)]) expect(isNotebookId(id)).toBe(true);
  });

  it('rejects anything that could escape a folder or read badly in a URL', () => {
    for (const id of ['', 'Work', '-work', 'work-', '../work', 'work/notes', 'work work', '.hidden', 'x'.repeat(41), 42, null]) {
      expect(isNotebookId(id)).toBe(false);
    }
  });
});

describe('notebookIdFromName', () => {
  it('makes a valid id from a name', () => {
    expect(notebookIdFromName('Side Project!')).toBe('side-project');
    expect(notebookIdFromName('  Café  Réunion ')).toBe('cafe-reunion');
    expect(notebookIdFromName('Q4 / 2026')).toBe('q4-2026');
    expect(isNotebookId(notebookIdFromName(`${'long name '.repeat(10)}`))).toBe(true);
  });

  it('is empty when the name has no letters or digits', () => {
    expect(notebookIdFromName('🙂 !!')).toBe('');
  });
});
