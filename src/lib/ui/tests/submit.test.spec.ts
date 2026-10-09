import { describe, expect, it } from 'vitest';
import { errorMessage, submit, submitOrThrow } from '../submit';
import { err, ok } from '$shared/utils/result';

describe('submit', () => {
  it('passes through an ok Result', async () => {
    const outcome = await submit(async () => ok({ id: 'p1' }));
    expect(outcome).toEqual({ ok: true, value: { id: 'p1' } });
  });

  it('maps an err Result to its message', async () => {
    const outcome = await submit(async () => err(new Error('A person named Alice already exists')));
    expect(outcome).toEqual({ ok: false, error: 'A person named Alice already exists' });
  });

  it('wraps a plain value from a throwing-style procedure', async () => {
    const outcome = await submit(async () => ({ id: 't1' }));
    expect(outcome).toEqual({ ok: true, value: { id: 't1' } });
  });

  it('catches a thrown error', async () => {
    const outcome = await submit(async () => {
      throw new Error('Todo not found');
    });
    expect(outcome).toEqual({ ok: false, error: 'Todo not found' });
  });

  it('unwraps a Zod issues array to the first message', () => {
    const zod = JSON.stringify([{ code: 'too_small', message: 'Name is required', path: ['name'] }]);
    expect(errorMessage(new Error(zod))).toBe('Name is required');
    expect(errorMessage('plain text')).toBe('plain text');
    expect(errorMessage(undefined)).toBe('Something went wrong.');
  });
});

describe('submitOrThrow', () => {
  it('returns the value of an ok Result', async () => {
    await expect(submitOrThrow(async () => ok({ id: 'p1' }))).resolves.toEqual({ id: 'p1' });
  });

  it('throws the message of an err Result', async () => {
    await expect(submitOrThrow(async () => err(new Error('Team not found')))).rejects.toThrow('Team not found');
  });
});
