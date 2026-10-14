// Holds a database's write lock for a while, as another process mid-write would.
// Prints "locked" once it has it. Used by busy-timeout.test.ts.

import { createClient } from '@libsql/client';

const [path, ms] = process.argv.slice(2);
const client = createClient({ url: `file:${path}` });
const tx = await client.transaction('write');
await tx.execute('INSERT INTO t VALUES (2)');
console.log('locked');
await new Promise((resolve) => setTimeout(resolve, Number(ms)));
await tx.commit();
tx.close();
client.close();
