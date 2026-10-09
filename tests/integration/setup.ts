// Integration test setup. Runs before each test file: wipes the test data
// directory, lets the real bootstrap create the notebook layout and migrate the
// database, adds an empty second notebook, and seeds the first (three people
// and the work starter page kinds, as notebook.create gives a work notebook).

import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, afterAll } from 'vitest';
import { settings } from '../../src/shared/settings/server/index.server';
import { ensureDatabase } from '../../src/shared/db/bootstrap.server';
import { getNotebookStore } from '../../src/shared/notebooks/current.server';
import { closeRegistries, getRegistry } from '../../src/shared/registry.server';
import { addStarterKinds } from '../../src/api/page-kind/operations';
import { seedGroupKinds } from '../../src/api/group-kind/operations';
import { seedPersonRelationKinds } from '../../src/api/person-relation-kind/operations';
import { ORG_MODULE } from '../../src/shared/modules/org';
import { OTHER_NOTEBOOK, TEST_NOTEBOOK } from './test-notebooks';

beforeAll(async () => {
  // Never wipe the real notebooks.
  if (process.env.APP_ENV !== 'test' || resolve(settings.dataDir) !== resolve('data/test')) {
    throw new Error(`Integration tests must run with APP_ENV=test (data dir was ${settings.dataDir})`);
  }
  rmSync(settings.dataDir, { recursive: true, force: true });
  await ensureDatabase(TEST_NOTEBOOK);
  await getNotebookStore().create({ id: OTHER_NOTEBOOK, name: 'Other', profile: 'work', createdAt: new Date().toISOString() });

  await getRegistry(TEST_NOTEBOOK).prisma.person.createMany({
    data: [
      { id: 'person_alice', name: 'Alice Johnson', email: 'alice@example.com' },
      { id: 'person_bob', name: 'Bob Smith', email: 'bob@example.com' },
      { id: 'person_carol', name: 'Carol Lee' }
    ]
  });
  await addStarterKinds(getRegistry(TEST_NOTEBOOK));
  await seedGroupKinds(getRegistry(TEST_NOTEBOOK), ORG_MODULE.groupKinds);
  await seedPersonRelationKinds(getRegistry(TEST_NOTEBOOK), ORG_MODULE.personRelationKinds);
});

afterAll(async () => {
  await closeRegistries();
});
