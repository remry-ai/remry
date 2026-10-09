// Minimal structured logger. Swap for pino/winston later if needed -
// the Logger interface in $shared/types/logger is the contract.

import type { Logger } from '$shared/types/logger';

const fmt = (level: string, obj: Record<string, unknown>, msg?: string): string => {
  const base = { level, time: new Date().toISOString(), ...obj, msg };
  return JSON.stringify(base);
};

export const createLogger = (): Logger => ({
  info: (obj, msg) => console.log(fmt('info', obj, msg)),
  warn: (obj, msg) => console.warn(fmt('warn', obj, msg)),
  error: (obj, msg) => console.error(fmt('error', obj, msg)),
  debug: (obj, msg) => {
    if (process.env.APP_ENV !== 'production') console.debug(fmt('debug', obj, msg));
  }
});
