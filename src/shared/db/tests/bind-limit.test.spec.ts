import { describe, it, expect } from 'vitest';
import { PrismaLibSqlWaiting, SQLITE_MAX_BIND_VALUES } from '../libsql.server';

describe('PrismaLibSqlWaiting', () => {
  it('tells Prisma the real limit on values per statement, not the 999 it assumes for SQLite', async () => {
    const adapter = await new PrismaLibSqlWaiting({ url: ':memory:' }).connect();
    try {
      expect(adapter.getConnectionInfo?.()).toMatchObject({ maxBindValues: SQLITE_MAX_BIND_VALUES, supportsRelationJoins: false });
    } finally {
      await adapter.dispose();
    }
  });

  it('runs a statement with that many values', async () => {
    const adapter = await new PrismaLibSqlWaiting({ url: ':memory:' }).connect();
    try {
      const args = Array.from({ length: SQLITE_MAX_BIND_VALUES }, () => 1);
      const result = await adapter.queryRaw({ sql: `SELECT 1 AS one WHERE 1 IN (${args.map(() => '?').join(',')})`, args, argTypes: args.map(() => ({ scalarType: 'int', arity: 'scalar' })) } as never);
      expect(result.rows).toEqual([[1]]);
    } finally {
      await adapter.dispose();
    }
  });
});
