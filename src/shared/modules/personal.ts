import type { ModuleDefinition } from './types';

/** Personal life: birthdays, how you know someone, family and friends. */
export const PERSONAL_MODULE: ModuleDefinition = {
  id: 'personal',
  name: 'Personal',
  groupKinds: [
    { key: 'FAMILY', name: 'Family', plural: 'Families', exclusive: false },
    { key: 'FRIENDS', name: 'Friends', plural: 'Friend groups', exclusive: false }
  ],
  personFields: [
    { module: 'personal', key: 'knownAs', label: 'How we know them', input: 'text', placeholder: 'e.g. College friend' },
    { module: 'personal', key: 'birthday', label: 'Birthday', input: 'birthday', placeholder: '1990-05-03, or --05-03 without the year' }
  ],
  personRelationKinds: [
    { key: 'PARTNER_OF', label: 'Partner of', inverseLabel: 'Partner of', symmetric: true, exclusive: false },
    { key: 'PARENT_OF', label: 'Parent of', inverseLabel: 'Child of', symmetric: false, exclusive: false },
    { key: 'SIBLING_OF', label: 'Sibling of', inverseLabel: 'Sibling of', symmetric: true, exclusive: false },
    { key: 'FRIEND_OF', label: 'Friend of', inverseLabel: 'Friend of', symmetric: true, exclusive: false },
    { key: 'PARENT_IN_LAW_OF', label: 'Parent-in-law of', inverseLabel: 'Child-in-law of', symmetric: false, exclusive: false },
    { key: 'SIBLING_IN_LAW_OF', label: 'Sibling-in-law of', inverseLabel: 'Sibling-in-law of', symmetric: true, exclusive: false }
  ],
  entityTypes: [],
  nav: [],
  routes: [],
  procedures: [],
  homeWidgets: ['birthdays']
};
