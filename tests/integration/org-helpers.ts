// Teams and departments are groups of kind TEAM and DEPARTMENT; setup.ts seeds
// both kinds in the test notebook. Not a test file.

import type { Registry } from '../../src/shared/registry';
import { addGroupMember, createGroup } from '../../src/api/group/operations';

type Reg = Pick<Registry, 'prisma'>;

export const createTeam = (reg: Reg, input: { readonly name: string; readonly description?: string }) =>
  createGroup(reg, { kind: 'TEAM', ...input });

export const createDepartment = (reg: Reg, input: { readonly name: string; readonly description?: string }) =>
  createGroup(reg, { kind: 'DEPARTMENT', ...input });

export const addTeamMember = (reg: Reg, groupId: string, input: { readonly personId: string }) =>
  addGroupMember(reg, groupId, input.personId);
