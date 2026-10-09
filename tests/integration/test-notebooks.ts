// The notebooks setup.ts creates in ./data/test. Not a test file.

import { FIRST_NOTEBOOK } from '../../src/shared/notebooks/layout';

/** Created by the layout in a fresh data directory, and the default. Seeded with three people. */
export const TEST_NOTEBOOK: string = FIRST_NOTEBOOK.id;

/** An empty second notebook. */
export const OTHER_NOTEBOOK = 'other';
