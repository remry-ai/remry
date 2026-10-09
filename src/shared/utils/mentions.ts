// Entity links inside markdown. Content that links to an app path
// (`[Jira](/app/wiki/<id>)`) mentions that entity; the relation domain turns
// those mentions into MENTIONS relations, which show up as backlinks.

import { parseEntityPath, type EntityRef } from './entity';

const FENCE = /^\s*(`{3,}|~{3,})/;
const INLINE_CODE = /`[^`]*`/g;
// [text](href "title"), <href>, or a bare loopback URL.
const LINK =
  /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|<([^>\s]+)>|(https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/app\/[^\s)>\]]+)/g;

/** Entities linked by app path, in first-seen order, without duplicates. Code blocks and inline code are skipped. */
export const extractEntityLinks = (markdown: string): readonly EntityRef[] => {
  const seen = new Set<string>();
  const refs: EntityRef[] = [];
  let fence: string | null = null;

  for (const line of markdown.split('\n')) {
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null;
      continue;
    }
    if (marker) {
      fence = marker;
      continue;
    }
    for (const match of line.replace(INLINE_CODE, '').matchAll(LINK)) {
      // A bare URL at the end of a sentence carries its punctuation.
      const href = match[1] ?? match[2] ?? match[3]?.replace(/[.,;:!?]+$/, '') ?? '';
      const ref = parseEntityPath(href);
      if (!ref) continue;
      const key = `${ref.entityType}:${ref.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(ref);
    }
  }
  return refs;
};
