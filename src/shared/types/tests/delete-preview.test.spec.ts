import { describe, it, expect } from 'vitest';
import { deletePreviewSections, isEmptyPreview, type DeletePreview } from '../delete-preview';

const empty: DeletePreview = { name: 'Atlas', docs: [], todos: [], files: [], links: [], notes: 0, comments: 0, checkIns: 0, children: [], movesTo: null, owned: [] };

describe('deletePreviewSections', () => {
  it('lists nothing for an entity with nothing attached', () => {
    const sections = deletePreviewSections('PROJECT', empty);
    expect(sections).toEqual({ deleted: [], kept: [] });
    expect(isEmptyPreview(sections)).toBe(true);
  });

  it('names what goes and counts what has no title, in reading order', () => {
    const sections = deletePreviewSections('GOAL', {
      ...empty,
      docs: [{ id: 'd1', title: 'Plan' }, { id: 'd2', title: 'Notes' }],
      todos: [{ id: 't1', title: 'Book review' }],
      files: [{ id: 'l1', title: 'brief.pdf' }],
      notes: 3,
      checkIns: 1
    });
    expect(sections.deleted).toEqual([
      { heading: '2 docs', items: ['Plan', 'Notes'] },
      { heading: '1 todo', items: ['Book review'] },
      { heading: '1 file', items: ['brief.pdf'] },
      { heading: '3 notes', items: [] },
      { heading: '1 check-in', items: [] }
    ]);
    expect(isEmptyPreview(sections)).toBe(false);
  });

  it('says where sub-items move and what loses its owner', () => {
    const kept = deletePreviewSections('PAGE', {
      ...empty,
      children: [{ id: 'p1', title: 'Setup' }],
      movesTo: 'Handbook',
      owned: [{ type: 'PROJECT', id: 'x', title: 'Launch' }, { type: 'GOAL', id: 'y', title: 'Uptime' }]
    }).kept;
    expect(kept).toEqual([
      { heading: '1 sub-page moves up to Handbook', items: ['Setup'] },
      { heading: '2 projects and goals it owns lose their owner', items: ['Launch', 'Uptime'] }
    ]);
    expect(deletePreviewSections('PROJECT', { ...empty, children: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }).kept[0]!.heading)
      .toBe('2 sub-projects move up to the top level');
  });
});
