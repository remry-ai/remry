// People: the core keeps a name and an email; modules keep their own fields in
// their own tables and show up under `extensions` (org: title and lead;
// personal: birthday and how you know them). Shared by the server and the client.

import { z } from 'zod';
import type { PersonGroup } from './groups';

export interface OrgPersonData {
  readonly title: string | null;
  readonly leadId: string | null;
  readonly leadName: string | null;
}

export interface OrgPersonDetail extends OrgPersonData {
  readonly reports: readonly { readonly id: string; readonly name: string; readonly title: string | null }[];
}

export interface PersonalPersonData {
  /** `YYYY-MM-DD`, or `--MM-DD` when the year isn't known. */
  readonly birthday: string | null;
  readonly knownAs: string | null;
}

/** Each module's data, present when the person has some. */
export interface PersonExtensions {
  readonly org?: OrgPersonData;
  readonly personal?: PersonalPersonData;
}

export interface PersonSummary {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  /** The notebook's owner ("me"); at most one person. */
  readonly isMe: boolean;
  /** How this person relates to me, read from their side ("Child of", "Lead of"); empty without a "me". */
  readonly toMe: readonly string[];
  readonly path: string;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly extensions: PersonExtensions;
}

export interface PersonDetail extends Omit<PersonSummary, 'extensions'> {
  readonly updatedAt: Date;
  readonly groups: readonly PersonGroup[];
  readonly extensions: { readonly org?: OrgPersonDetail; readonly personal?: PersonalPersonData };
}

/** 1990-05-03, or --05-03 when the year isn't known. */
export const BIRTHDAY_PATTERN = /^(\d{4}-|--)(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const orgPersonPatch = z.object({
  title: z.string().max(200).nullable().optional(),
  leadId: z.string().nullable().optional()
}).strict();

export const personalPersonPatch = z.object({
  birthday: z.string().regex(BIRTHDAY_PATTERN, 'must be a date like 1990-05-03, or --05-03 without the year').nullable().optional(),
  knownAs: z.string().max(200).nullable().optional()
}).strict();

/** `person.create` / `person.update --extensions`: each module's fields, under its id. */
export const personExtensionsPatch = z.object({
  org: orgPersonPatch.optional(),
  personal: personalPersonPatch.optional()
}).strict();

export type PersonExtensionsPatch = z.infer<typeof personExtensionsPatch>;
