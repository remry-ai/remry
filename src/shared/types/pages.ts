// Wiki pages: a page tree of markdown documents and spreadsheets. Pages have no
// kinds or fields (removed in 0.16.42: the drop_page_kinds migration wrote each
// page's field values into the top of its text). Shared by the server and the client.

/** What a page's body is: markdown (`doc`) or a spreadsheet's JSON (`sheet`, see $shared/utils/sheet). */
export const PAGE_BODY_TYPES = ['doc', 'sheet'] as const;

export type PageBodyType = (typeof PAGE_BODY_TYPES)[number];

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
  /**
   * Its source file's storage key (a PDF, an image or a text file), or null without one. Like a
   * page's images, the file is only on disk, in its folder (`pages/<id>/source-…`): no column.
   */
  readonly sourceUrl: string | null;
  readonly parent: { readonly id: string; readonly title: string } | null;
  readonly children: readonly PageLink[];
  readonly createdAt: Date;
}
