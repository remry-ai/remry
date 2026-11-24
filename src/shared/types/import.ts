// What `entity.import` reports: each item it made, updated or left as it was, the images it
// stored, and what it couldn't do. Read by the app's Import popup and by Claude.

export const IMPORT_EXISTING = ['skip', 'overwrite'] as const;
/** What to do with an item whose id (from a Remry export) is already in this notebook. */
export type ImportExisting = (typeof IMPORT_EXISTING)[number];

/** Where imported items that have no parent of their own go. */
export const IMPORT_UNDER_TYPES = ['PAGE', 'PROJECT', 'PERSON', 'GROUP', 'GOAL'] as const;
export type ImportUnderType = (typeof IMPORT_UNDER_TYPES)[number];

export type ImportedKind = 'PAGE' | 'PROJECT' | 'DOC';

export interface ImportedItem {
  readonly kind: ImportedKind;
  readonly id: string;
  readonly title: string;
  /** Its app path. */
  readonly path: string;
  readonly outcome: 'created' | 'updated' | 'skipped';
  /** Whether it's at the top of what was imported (no imported parent). */
  readonly top: boolean;
}

export interface ImportProblem {
  /** The file it came from, or the image. */
  readonly file: string;
  readonly message: string;
}

export interface ImportResult {
  readonly items: readonly ImportedItem[];
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  /** Images stored from the import. */
  readonly images: number;
  /** Images the text showed that weren't in the import: each became an "Image lost" note. */
  readonly imagesMissing: readonly string[];
  readonly problems: readonly ImportProblem[];
}
