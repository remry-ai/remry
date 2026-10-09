// tRPC context: the notebook a call runs against, its Registry (`reg`), the
// notebook store for the `notebook` procedures, and the Pro license check. Routes forward `ctx.reg` (or a
// slice of it) into operations.
//
// Only the web app's context has `pdfConverter` and `pageChat`, which run the
// local Claude Code CLI. It isn't on the Registry, and the CLI and MCP server go without it.

import type { RequestEvent } from '@sveltejs/kit';
import { getPdfConverter } from '$shared/assist/pdf-converter.server';
import { getPageChat } from '$shared/assist/page-chat.server';
import { getReadyRegistry } from '$shared/db/bootstrap.server';
import { currentLicense } from '$shared/license/store.server';
import { getNotebookStore } from '$shared/notebooks/current.server';
import type { NotebookStore } from '$shared/notebooks/store.server';
import type { Registry } from '$shared/registry';
import type { LicenseStatus } from '$shared/types/license';
import type { NotebookInfo } from '$shared/types/notebook';
import { notebookModel, type NotebookModel } from '$shared/modules/model';
import type { PdfConverter } from '$shared/types/pdf-conversion';
import type { PageChat } from '$shared/types/page-chat';

export interface Context {
  readonly reg: Registry;
  readonly notebook: NotebookInfo;
  /** What the notebook is made of: the core plus its profile's modules. */
  readonly model: NotebookModel;
  readonly notebooks: NotebookStore;
  /** The Remry Pro license on this computer, checked when called (see src/api/_license.ts). */
  readonly license: () => Promise<LicenseStatus>;
  readonly pdfConverter?: PdfConverter;
  readonly pageChat?: PageChat;
}

/** Used by the HTTP handler and by in-process callers (the CLI and MCP server). */
export const createNotebookContext = async (notebook: NotebookInfo): Promise<Context> => ({
  reg: await getReadyRegistry(notebook.id),
  notebook,
  model: notebookModel(notebook.profile),
  notebooks: getNotebookStore(),
  license: () => currentLicense()
});

/** `event.locals.notebook` is set by notebookHandle in hooks.server.ts. */
export const createContext = async (opts: { readonly event: RequestEvent }): Promise<Context> => ({
  ...(await createNotebookContext(opts.event.locals.notebook)),
  pdfConverter: getPdfConverter(),
  pageChat: getPageChat()
});
