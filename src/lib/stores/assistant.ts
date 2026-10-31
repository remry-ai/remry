// The name of the AI assistant the web app runs ("Claude", "Copilot"), from the app layout's
// data, for labels such as "Convert with Copilot". "AI" before one is picked.

import { derived, type Readable } from 'svelte/store';
import { page } from '$app/stores';

export const assistantName: Readable<string> = derived(page, ($page) =>
  (($page.data as { assistantName?: string | null }).assistantName) ?? 'AI'
);
