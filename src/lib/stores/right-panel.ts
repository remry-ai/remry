import { writable } from 'svelte/store';
import type { Snippet } from 'svelte';
import type { EntityType } from '$shared/types/enums';

interface Note {
  readonly id: string;
  readonly parentId: string | null;
  readonly content: string;
  readonly createdAt: Date | string;
  readonly replies: readonly Note[];
}

export interface RightPanelNotes {
  readonly notes: readonly Note[];
  readonly onAdd: (content: string, parentId?: string) => Promise<void>;
  readonly onRemove: (id: string) => Promise<void>;
  readonly onStartAdd?: (parentId?: string) => void;
  readonly onEdit?: (noteId: string) => void;
}

/** The entity page open in the center, for the chat tab. */
export interface RightPanelPage {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly entityName: string;
  /** The page's text as the user sees it: the center pane and the notes. */
  readonly getPageText: () => string;
}

/** An entity shown in the panel's Peek tab, set by `SidePeek` while `?peek=<id>` is open. */
export interface RightPanelPeek {
  readonly title: string;
  /** The entity's full page, for the Open link. */
  readonly href: string;
  readonly content: Snippet;
  readonly onClose: () => void;
}

export type RightPanelTabId = 'notes' | 'chat' | 'peek';

export const rightPanelNotes = writable<RightPanelNotes | null>(null);
export const rightPanelPage = writable<RightPanelPage | null>(null);
export const rightPanelPeek = writable<RightPanelPeek | null>(null);
export const rightPanelTab = writable<RightPanelTabId>('notes');
