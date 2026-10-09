import type { ModuleDefinition } from './types';

/** The org chart: titles, who reports to whom, teams and departments, the org map. */
export const ORG_MODULE: ModuleDefinition = {
  id: 'org',
  name: 'Org chart',
  groupKinds: [
    { key: 'TEAM', name: 'Team', plural: 'Teams', exclusive: false },
    { key: 'DEPARTMENT', name: 'Department', plural: 'Departments', exclusive: true }
  ],
  personFields: [
    { module: 'org', key: 'title', label: 'Title', input: 'text', placeholder: 'e.g. Senior Engineer' },
    { module: 'org', key: 'leadId', label: 'Lead', input: 'person' }
  ],
  personRelationKinds: [{ key: 'LEAD_OF', label: 'Lead of', inverseLabel: 'Reports to', symmetric: false, exclusive: true }],
  entityTypes: [],
  nav: [{ href: '/app/orgmap', label: 'Org Map', replaces: ['/app/people', '/app/groups'], after: '/app' }],
  routes: ['/app/orgmap'],
  procedures: [],
  homeWidgets: []
};
