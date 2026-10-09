// A notebook is a separate local database and files folder: work, or a personal project.

/**
 * What the notebook is for. A home notebook hides the org-only parts (departments,
 * leads, the org map) and calls teams groups; see $shared/settings/base/profile.
 */
export const NOTEBOOK_PROFILES = ['work', 'home'] as const;

export type NotebookProfile = (typeof NOTEBOOK_PROFILES)[number];

export interface NotebookInfo {
  /** Folder name, `--notebook` value and `?notebook=` value. Never changes. */
  readonly id: string;
  readonly name: string;
  /** `work` when notebook.json doesn't say. */
  readonly profile: NotebookProfile;
  /** ISO timestamp. */
  readonly createdAt: string;
}

export interface NotebookSummary extends NotebookInfo {
  /** The notebook this call ran against. */
  readonly isCurrent: boolean;
  /** The notebook the CLI and MCP tools use when none is named. */
  readonly isDefault: boolean;
}
