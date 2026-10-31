// Pure parts of entity.convert: the text a converted item gets, and links to it rewritten.

import { readSheetContent, sheetToMarkdown } from '$shared/utils/sheet';
import { projectStatusLabel } from '$shared/utils/project-status';

/** A wiki page's body as markdown: a sheet becomes a table, a document stays as it is. */
export const pageMarkdown = (bodyType: string, content: string): string =>
  bodyType === 'sheet' ? sheetToMarkdown(readSheetContent(content)) : content;

export interface LinkedItem {
  readonly label: string;
  readonly path: string;
}

export interface ProjectFacts {
  readonly description: string | null;
  readonly status: string | null;
  readonly owner: LinkedItem | null;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly daysOptimistic: number | null;
  readonly daysLikely: number | null;
  readonly daysPessimistic: number | null;
  readonly goals: readonly LinkedItem[];
}

const day = (d: Date): string => d.toISOString().slice(0, 10);
const link = (item: LinkedItem): string => `[${item.label.replace(/[[\]]/g, '')}](${item.path})`;

/**
 * A project's page text: its facts as a details list (the owner and goals as links, which
 * become backlinks), then its brief. Only the facts it has.
 */
export const projectPageContent = (facts: ProjectFacts): string => {
  const lines: string[] = [];
  const status = projectStatusLabel(facts.status);
  if (status) lines.push(`- **Status:** ${status[0]!.toUpperCase()}${status.slice(1)}`);
  if (facts.owner) lines.push(`- **Owner:** ${link(facts.owner)}`);
  if (facts.startDate || facts.endDate) {
    lines.push(`- **Dates:** ${facts.startDate ? day(facts.startDate) : '?'} → ${facts.endDate ? day(facts.endDate) : 'ongoing'}`);
  }
  const days = [facts.daysOptimistic, facts.daysLikely, facts.daysPessimistic];
  if (days.some((d) => d !== null)) {
    lines.push(`- **Estimate:** ${days.map((d) => d ?? '?').join(' / ')} days (optimistic / likely / pessimistic)`);
  }
  if (facts.goals.length > 0) lines.push(`- **Goals:** ${facts.goals.map(link).join(', ')}`);
  const brief = facts.description?.trim() ?? '';
  return [lines.join('\n'), brief].filter(Boolean).join('\n\n');
};

/** A note's first line, without markdown marks, as a page title (at most 80 characters). */
export const titleFromNote = (content: string): string => {
  const first = content.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? '';
  const plain = first
    .replace(/^#+\s*|^[-*+>]\s+|^\d+[.)]\s+/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
  if (plain === '') return 'Untitled';
  return plain.length <= 80 ? plain : `${plain.slice(0, 79).trimEnd()}…`;
};

/** A page turned into a note: its title in bold, then its text. */
export const noteFromPage = (title: string, markdown: string): string =>
  markdown.trim() === '' ? `**${title}**` : `**${title}**\n\n${markdown}`;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The text with every link to `from` (an app path, `/app/projects/<id>`, with or without
 * the local origin) pointing at `to` instead. A longer id that starts the same is left alone.
 */
export const relinkContent = (content: string, from: string, to: string): string =>
  content.replace(new RegExp(`${escapeRegExp(from)}(?![\\w-])`, 'g'), to);

/** Whether the text shows images stored in the notebook, which a note can't hold. */
export const hasStoredImages = (content: string): boolean => /(?:storage:\/\/|\/files\/)(?:docs|pages)\//.test(content);
