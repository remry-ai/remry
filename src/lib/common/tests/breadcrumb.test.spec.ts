import { describe, it, expect } from 'vitest';
import { planBreadcrumb } from '../breadcrumb';

const list = { label: 'Projects', href: '/app/projects' };
const crumb = (label: string, id: string) => ({ label, href: `/app/projects/${id}` });

describe('planBreadcrumb', () => {
  it('shows a short trail whole', () => {
    const parents = [crumb('Platform', 'a'), crumb('Infra', 'b')];
    expect(planBreadcrumb(list, parents, 'Migration')).toEqual({ first: list, folded: [], rest: parents });
  });

  it('folds the parents before the nearest one when the trail is long', () => {
    const parents = [crumb('Platform engineering programme', 'a'), crumb('Cloud infrastructure', 'b'), crumb('AWS accounts', 'c')];
    expect(planBreadcrumb(list, parents, 'Move billing to the org account')).toEqual({
      first: list,
      folded: parents.slice(0, 2),
      rest: [parents[2]]
    });
  });

  it("doesn't fold a single parent, however long", () => {
    const parents = [crumb('A very long parent project name that goes on and on', 'a')];
    expect(planBreadcrumb(list, parents, 'And a long project name too')).toEqual({ first: list, folded: [], rest: parents });
  });

  it('counts the entity name toward the limit', () => {
    const parents = [crumb('One', 'a'), crumb('Two', 'b')];
    expect(planBreadcrumb(list, parents, 'x'.repeat(10), 30).folded).toEqual([]);
    expect(planBreadcrumb(list, parents, 'x'.repeat(30), 30).folded).toEqual([parents[0]]);
  });
});
