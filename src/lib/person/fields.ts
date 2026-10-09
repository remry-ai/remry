// Reading the fields modules add to a person (`extensions`), as the notebook
// model lists them. Pure; used by the people list, the person page and the form.

import type { PersonFieldDescriptor } from '$shared/modules/types';
import type { PersonExtensions } from '$shared/types/person';
import { formatBirthday } from '$shared/utils/birthday';

/** The stored value: a string, or null when unset. */
export const fieldRaw = (extensions: PersonExtensions, field: PersonFieldDescriptor): string | null => {
  const data = extensions[field.module as keyof PersonExtensions] as Readonly<Record<string, unknown>> | undefined;
  const value = data?.[field.key];
  return typeof value === 'string' && value !== '' ? value : null;
};

/** The value as shown: a lead's name, a birthday as "3 May". */
export const fieldText = (extensions: PersonExtensions, field: PersonFieldDescriptor): string | null => {
  if (field.input === 'person') return extensions.org?.leadName ?? null;
  const raw = fieldRaw(extensions, field);
  if (raw === null) return null;
  return field.input === 'birthday' ? formatBirthday(raw) : raw;
};

/** A one-module patch for `person.update --extensions`: `{ org: { title: … } }`. */
export const fieldPatch = (field: PersonFieldDescriptor, value: string | null): Readonly<Record<string, Readonly<Record<string, string | null>>>> =>
  ({ [field.module]: { [field.key]: value } });
