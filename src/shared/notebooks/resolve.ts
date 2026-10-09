// Which notebook a call runs against. Pure: the notebooks and the default are passed in.
//   CLI and MCP: the notebook named on the call, then REMRY_NOTEBOOK, then the default
//   UI:          ?notebook=, then the cookie, then the default

import { ok, err, type Result } from '$shared/utils/result';
import type { NotebookInfo } from '$shared/types/notebook';

export interface NotebookSources {
  /** Named on this call: `--notebook`, the MCP `notebook` argument, or `?notebook=`. Id or name. */
  readonly explicit?: string | null;
  /** REMRY_NOTEBOOK. Id or name. */
  readonly env?: string | null;
  /** The UI's cookie. Ignored if that notebook no longer exists. */
  readonly remembered?: string | null;
}

export interface NotebookChoices extends NotebookSources {
  readonly notebooks: readonly NotebookInfo[];
  readonly defaultId: string | null;
}

/** REMRY_NOTEBOOK, or its earlier names WONO_NOTEBOOK and WNOTES_NOTEBOOK. */
export const notebookFromEnv = (env: Readonly<Record<string, string | undefined>>): string | undefined =>
  env['REMRY_NOTEBOOK'] || env['WONO_NOTEBOOK'] || env['WNOTES_NOTEBOOK'] || undefined;

/** By id, or else by a name that matches exactly one notebook, ignoring case. */
export const findNotebook = (notebooks: readonly NotebookInfo[], value: string): NotebookInfo | null => {
  const wanted = value.trim();
  const byId = notebooks.find((n) => n.id === wanted);
  if (byId) return byId;
  const byName = notebooks.filter((n) => n.name.toLowerCase() === wanted.toLowerCase());
  return byName.length === 1 ? byName[0]! : null;
};

const listIds = (notebooks: readonly NotebookInfo[]): string => notebooks.map((n) => n.id).join(', ') || 'none';

export const resolveNotebook = (choices: NotebookChoices): Result<NotebookInfo> => {
  const { notebooks } = choices;

  if (choices.explicit?.trim()) {
    const found = findNotebook(notebooks, choices.explicit);
    return found
      ? ok(found)
      : err(new Error(`There is no notebook "${choices.explicit}". Notebooks: ${listIds(notebooks)}. Use notebook.list to see them, or notebook.create to add one.`));
  }

  if (choices.env?.trim()) {
    const found = findNotebook(notebooks, choices.env);
    return found
      ? ok(found)
      : err(new Error(`REMRY_NOTEBOOK is "${choices.env}", but there is no such notebook. Notebooks: ${listIds(notebooks)}.`));
  }

  const remembered = choices.remembered ? notebooks.find((n) => n.id === choices.remembered) : undefined;
  if (remembered) return ok(remembered);

  const fallback = notebooks.find((n) => n.id === choices.defaultId) ?? notebooks[0];
  return fallback ? ok(fallback) : err(new Error('There are no notebooks. Create one with notebook.create.'));
};
