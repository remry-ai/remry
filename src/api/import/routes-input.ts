// What `entity.import` takes, and turning it into files for `importMarkdown`.

import { z } from 'zod';
import { ok, err, type Result } from '$shared/utils/result';
import { IMPORT_EXISTING, IMPORT_UNDER_TYPES } from '$shared/types/import';
import { decodeBase64 } from '$api/_uploads';
import type { ImportFile } from './plan';
import { readZip } from './zip';

// Under the 25M request limit, as for a file link.
const MAX_ARCHIVE_BASE64_CHARS = 24_000_000;

export const importInput = z.object({
  archiveBase64: z.string().max(MAX_ARCHIVE_BASE64_CHARS).optional()
    .describe('A .zip of markdown and images, as base64: a Remry markdown export, or any folder of .md files'),
  files: z.array(z.object({
    path: z.string().min(1).max(500).describe('Its path in the import, as links name it (Handbook/Onboarding.md, images/x.png)'),
    text: z.string().max(5_000_000).optional().describe('A markdown file\'s text'),
    dataBase64: z.string().max(MAX_ARCHIVE_BASE64_CHARS).optional().describe('An image\'s bytes as base64')
  })).max(2000).optional().describe('Loose files instead of a .zip: markdown as text, images as base64'),
  underType: z.enum(IMPORT_UNDER_TYPES).optional().describe('Where items with no parent in the import go: under a page or project, or (docs) on a person, group, project or goal. Left out: top level'),
  underId: z.string().optional(),
  existing: z.enum(IMPORT_EXISTING).default('skip').describe('An item exported from Remry whose id is already here: skip it (default) or overwrite its title and text')
});

export type ImportRequest = z.infer<typeof importInput>;

/** The files the request carries, unpacked. */
export const requestFiles = (input: ImportRequest): Result<readonly ImportFile[]> => {
  if ((input.archiveBase64 === undefined) === (input.files === undefined)) {
    return err(new Error('Send either archiveBase64 (a .zip) or files, not both or neither.'));
  }
  if ((input.underType === undefined) !== (input.underId === undefined)) {
    return err(new Error('Give underType and underId together, or neither.'));
  }
  if (input.archiveBase64 !== undefined) {
    const bytes = decodeBase64(input.archiveBase64);
    if (!bytes.ok) return err(bytes.error);
    return readZip(new Uint8Array(bytes.value));
  }
  const files: ImportFile[] = [];
  const encoder = new TextEncoder();
  for (const file of input.files ?? []) {
    if ((file.text === undefined) === (file.dataBase64 === undefined)) {
      return err(new Error(`${file.path}: send its text (markdown) or its dataBase64 (an image), one of them.`));
    }
    if (file.text !== undefined) {
      files.push({ path: file.path, bytes: encoder.encode(file.text) });
      continue;
    }
    const bytes = decodeBase64(file.dataBase64!);
    if (!bytes.ok) return err(new Error(`${file.path}: ${bytes.error.message}`));
    files.push({ path: file.path, bytes: new Uint8Array(bytes.value) });
  }
  return ok(files);
};
