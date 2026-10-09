// A project's status: one of six, stored as these exact strings. Common words
// from Claude, imports and older data map onto them; anything else isn't a status.

export const PROJECT_STATUSES = ['proposed', 'committed', 'in-progress', 'blocked', 'done', 'abandoned'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  proposed: 'proposed',
  committed: 'committed',
  'in-progress': 'in progress',
  blocked: 'blocked',
  done: 'done',
  abandoned: 'abandoned'
};

/** Words that mean one of the six, keyed as `statusKey` leaves them. The migration `project_statuses` maps stored data the same way. */
export const PROJECT_STATUS_SYNONYMS: Readonly<Record<string, ProjectStatus>> = {
  proposed: 'proposed', idea: 'proposed', prospective: 'proposed', proposal: 'proposed', backlog: 'proposed', pitched: 'proposed',
  committed: 'committed', planning: 'committed', planned: 'committed', todo: 'committed', 'to do': 'committed', 'not started': 'committed',
  'in progress': 'in-progress', active: 'in-progress', started: 'in-progress', doing: 'in-progress', wip: 'in-progress',
  blocked: 'blocked', 'at risk': 'blocked', 'off track': 'blocked', 'on hold': 'blocked', paused: 'blocked', waiting: 'blocked',
  done: 'done', complete: 'done', completed: 'done', shipped: 'done', launched: 'done', finished: 'done',
  abandoned: 'abandoned', archived: 'abandoned', cancelled: 'abandoned', canceled: 'abandoned', dropped: 'abandoned', "won't do": 'abandoned'
};

/** Lower case, with `-`, `_` and runs of spaces folded to one space. */
export const statusKey = (value: string): string => value.trim().toLowerCase().replace(/[-_\s]+/g, ' ');

/** The status a value means; null for null or blank (no status); undefined for a value that isn't a status. */
export const toProjectStatus = (value: string | null | undefined): ProjectStatus | null | undefined => {
  if (value === null || value === undefined || value.trim() === '') return null;
  return PROJECT_STATUS_SYNONYMS[statusKey(value)];
};

export const isProjectStatus = (value: string | null | undefined): value is ProjectStatus =>
  (PROJECT_STATUSES as readonly (string | null | undefined)[]).includes(value);

export const projectStatusLabel = (status: string | null | undefined): string | null => {
  if (!status) return null;
  return isProjectStatus(status) ? PROJECT_STATUS_LABELS[status] : status;
};

export type ProjectStatusTone = 'accent' | 'success' | 'danger' | 'muted' | 'viz-1' | 'viz-4';

const TONES: Readonly<Record<ProjectStatus, ProjectStatusTone>> = {
  proposed: 'viz-4',
  committed: 'accent',
  'in-progress': 'success',
  blocked: 'danger',
  done: 'viz-1',
  abandoned: 'muted'
};

/** Each status's colour, shared by its badge and its swimlane bar. */
export const projectStatusTone = (status: string | null | undefined): ProjectStatusTone =>
  isProjectStatus(status) ? TONES[status] : 'muted';

/** Done or abandoned: no longer running, so never late. */
export const isFinishedStatus = (status: string | null | undefined): boolean => status === 'done' || status === 'abandoned';

/** The error for a value that isn't a status, naming the six. */
export const unknownStatusMessage = (value: string): string =>
  `Unknown project status "${value}". Use one of: ${PROJECT_STATUSES.join(', ')}.`;
