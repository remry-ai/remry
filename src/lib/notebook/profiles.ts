// The profiles a new notebook can have, as the New notebook form offers them. A profile picks
// the notebook's modules (`notebookModel`, $shared/modules/model); the hint says what each adds.

import type { NotebookProfile } from '$shared/types/notebook';

export interface ProfileOption {
  readonly id: NotebookProfile;
  readonly name: string;
  readonly hint: string;
}

/** Every profile, `work` first (the default). A Record, so a new profile can't be left out. */
const PROFILES: Readonly<Record<NotebookProfile, Omit<ProfileOption, 'id'>>> = {
  work: { name: 'Work', hint: 'Titles, leads, teams and departments, the org map, and goals.' },
  home: { name: 'Home', hint: 'Birthdays, families and friends, and how people are related.' }
};

export const PROFILE_OPTIONS: readonly ProfileOption[] = (Object.keys(PROFILES) as NotebookProfile[]).map((id) => ({ id, ...PROFILES[id] }));

/** What a profile adds, for the field's hint. */
export const profileHint = (profile: NotebookProfile): string => PROFILES[profile].hint;
