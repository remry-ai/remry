// Health domain - operations.
// Demonstrates the minimum: registry slice first parameter, typed return,
// no direct `new Date()` (uses reg.now()).

import type { Registry } from '$shared/registry';
import type { HealthStatus } from '$shared/types/health';

const VERSION = '0.0.1';

export const getStatus = async (
  reg: Pick<Registry, 'prisma' | 'now' | 'logger'>
): Promise<HealthStatus> => {
  let database: 'up' | 'down' = 'down';
  try {
    await reg.prisma.$queryRaw`SELECT 1`;
    database = 'up';
  } catch (error) {
    reg.logger.warn({ error: String(error) }, 'health: database check failed');
  }

  return {
    ok: database === 'up',
    checkedAt: reg.now(),
    database,
    version: VERSION
  };
};
