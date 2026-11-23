import { describe, it, expect } from 'vitest';
import { isNotebookId, notebookIdFromName, uniqueNotebookId } from '../id';

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

describe('uniqueNotebookId', () => {
  it('uses the id made from the name when it is free', () => {
    expect(uniqueNotebookId('Side Project', new Set(['work']))).toBe('side-project');
  });

  it('adds -2, -3… when it is taken', () => {
    expect(uniqueNotebookId('Work', new Set(['work']))).toBe('work-2');
    expect(uniqueNotebookId('Work', new Set(['work', 'work-2']))).toBe('work-3');
  });

  it('falls back to "notebook" for a name with no letters or digits', () => {
    expect(uniqueNotebookId('🙂 !!', new Set())).toBe('notebook');
    expect(uniqueNotebookId('日記', new Set(['notebook']))).toBe('notebook-2');
  });

  it('stays a valid id at the length limit', () => {
    const long = 'x'.repeat(40);
    const id = uniqueNotebookId(long, new Set([long]));
    expect(id).toBe(`${'x'.repeat(38)}-2`);
    expect(isNotebookId(id)).toBe(true);
  });
});
