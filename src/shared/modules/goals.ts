import type { ModuleDefinition } from './types';

/** Goals with targets, periods and check-ins. */
export const GOALS_MODULE: ModuleDefinition = {
  id: 'goals',
  name: 'Goals',
  groupKinds: [],
  personFields: [],
  personRelationKinds: [],
  entityTypes: ['GOAL'],
  nav: [{ href: '/app/goals', label: 'Goals', after: '/app/projects' }],
  routes: ['/app/goals'],
  procedures: ['goal.'],
  homeWidgets: []
};
