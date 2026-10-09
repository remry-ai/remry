// SvelteKit ambient types.
// See https://kit.svelte.dev/docs/types#app

import type { NotebookInfo } from '$shared/types/notebook';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      /** The notebook this request reads and writes, set by notebookHandle in hooks.server.ts. */
      notebook: NotebookInfo;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
