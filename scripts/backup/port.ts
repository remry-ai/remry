// Whether something listens on a local port. No settings or database imports, so the
// MCP server can check for an old app before anything opens the data directory.

import { connect } from 'node:net';

export const isPortListening = (port: number, host = '127.0.0.1'): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (listening: boolean): void => {
      socket.destroy();
      resolve(listening);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(500, () => done(false));
  });
