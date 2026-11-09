import { describe, it, expect } from 'vitest';
import { deletePreviewSections, isEmptyPreview, type DeletePreview } from '../delete-preview';

const empty: DeletePreview = { name: 'Atlas', docs: [], todos: [], files: [], links: [], notes: 0, comments: 0, checkIns: 0, children: [], owned: [] };

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

  it('lists sub-projects and sub-pages first among what goes', () => {
    const sections = deletePreviewSections('PAGE', { ...empty, children: [{ id: 'p1', title: 'Setup' }, { id: 'p2', title: 'Deep' }] });
    expect(sections.deleted[0]).toEqual({ heading: '2 sub-pages', items: ['Setup', 'Deep'] });
    expect(sections.kept).toEqual([]);
  });

  it('lists a goal\'s sub-goals with what goes, and keeps what it owned', () => {
    const sections = deletePreviewSections('GOAL', {
      ...empty,
      children: [{ id: 'g1', title: 'Latency' }],
      checkIns: 4,
      owned: [{ type: 'PROJECT', id: 'x', title: 'Launch' }, { type: 'GOAL', id: 'y', title: 'Uptime' }]
    });
    expect(sections.deleted).toEqual([{ heading: '1 sub-goal', items: ['Latency'] }, { heading: '4 check-ins', items: [] }]);
    expect(sections.kept).toEqual([{ heading: '2 projects and goals it owns lose their owner', items: ['Launch', 'Uptime'] }]);
  });
});
