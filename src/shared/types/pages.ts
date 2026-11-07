// Wiki pages: a page tree of markdown documents, spreadsheets and drawings. Pages have no
// kinds or fields (removed in 0.16.42: the drop_page_kinds migration wrote each
// page's field values into the top of its text). Shared by the server and the client.

import type { LastSync } from './sync-now';
import { BODY_TYPES, type BodyType } from './body-types';

/** What a page's body is: the same three a doc's can be ($shared/types/body-types). */
export const PAGE_BODY_TYPES = BODY_TYPES;

export type PageBodyType = BodyType;

export interface PageSummary {
  readonly id: string;
  readonly title: string;
  readonly bodyType: PageBodyType;
  readonly parentId: string | null;
  readonly path: string;
  readonly archivedAt: Date | null;
  readonly updatedAt: Date;
}

export interface PageLink {
  readonly id: string;
  readonly title: string;
  readonly path: string;
}

export interface PageDetail extends PageSummary {
  readonly content: string;
  /** A sync page's prompt: what to pull from its linked sources. Null for an ordinary page. */
  readonly prompt: string | null;
  /** A sync page's last sync: when, by what (the app's Sync now or Claude) and how it went. Null if never. */
  readonly lastSync: LastSync | null;
  readonly parent: { readonly id: string; readonly title: string } | null;
  readonly children: readonly PageLink[];
  readonly createdAt: Date;
}
