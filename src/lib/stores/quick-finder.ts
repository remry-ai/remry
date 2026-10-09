import { writable } from 'svelte/store';

// Open state of the Cmd+K finder, so the nav search button can open it.
export const quickFinderOpen = writable(false);
