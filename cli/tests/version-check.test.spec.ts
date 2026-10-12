import { describe, it, expect } from 'vitest';
import { planVersionCheck, type VersionState } from '../version-check';

const state = (over: Partial<VersionState>): VersionState => ({
  version: '0.15.1',
  repoDir: '/code/remry',
  setup: { version: '0.15.1', repoDir: '/code/remry' },
  app: null,
  appRunning: false,
  ...over
});

describe('planVersionCheck', () => {
  it('does nothing when setup and the app match this version', () => {
    expect(planVersionCheck(state({ app: { version: '0.15.1' }, appRunning: true }))).toEqual({ runSetup: false, restartApp: false });
  });

  it('runs setup after the clone moved to a new version, or when setup never recorded one', () => {
    expect(planVersionCheck(state({ setup: { version: '0.15.0', repoDir: '/code/remry' } })).runSetup).toBe(true);
    expect(planVersionCheck(state({ setup: null })).runSetup).toBe(true);
  });

  it('leaves setup alone for a clone other than the one set up (REMRY_HOME)', () => {
    expect(planVersionCheck(state({ setup: { version: '0.14.0', repoDir: '/code/other' } })).runSetup).toBe(false);
  });

  it('restarts only a running app this server recorded at another version', () => {
    expect(planVersionCheck(state({ app: { version: '0.15.0' }, appRunning: true })).restartApp).toBe(true);
    expect(planVersionCheck(state({ app: { version: '0.15.0' }, appRunning: false })).restartApp).toBe(false);
    // Started by hand: no record, so it's the user's.
    expect(planVersionCheck(state({ app: null, appRunning: true })).restartApp).toBe(false);
  });
});
