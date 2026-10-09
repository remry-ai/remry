import type { Result } from '$shared/utils/result';

export interface SubmitOk<T> {
  readonly ok: true;
  readonly value: T;
}

export interface SubmitErr {
  readonly ok: false;
  readonly error: string;
}

export type SubmitOutcome<T> = SubmitOk<T> | SubmitErr;

const isResult = (v: unknown): v is Result<unknown> =>
  typeof v === 'object' && v !== null && 'ok' in v && typeof (v as { ok: unknown }).ok === 'boolean';

const messageOf = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Something went wrong.';
};

/**
 * Unwraps a Zod issues array that tRPC serialises as the error message, so a
 * validation failure reads "Name is required" instead of a JSON blob.
 */
export const errorMessage = (e: unknown): string => {
  const raw = messageOf(e);
  if (raw.startsWith('[')) {
    try {
      const issues = JSON.parse(raw) as readonly { readonly message?: unknown }[];
      const first = issues[0]?.message;
      if (typeof first === 'string') return first;
    } catch {
      // fall through to the raw text
    }
  }
  return raw;
};

/**
 * Runs a tRPC call and normalises both conventions the API uses:
 * procedures that return a `Result` and procedures that throw.
 * Forms can then always render `outcome.error`.
 */
export const submit = async <T>(
  run: () => Promise<Result<T> | T>,
): Promise<SubmitOutcome<T>> => {
  try {
    const value = await run();
    if (isResult(value)) {
      return value.ok
        ? { ok: true, value: value.value as T }
        : { ok: false, error: errorMessage(value.error) };
    }
    return { ok: true, value };
  } catch (e: unknown) {
    return { ok: false, error: errorMessage(e) };
  }
};

/**
 * `submit()` for callers that show failures by catching them:
 * `InlinePicker.onPick` and `ConfirmButton.onConfirm`.
 */
export const submitOrThrow = async <T>(
  run: () => Promise<Result<T> | T>,
): Promise<T> => {
  const outcome = await submit(run);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.value;
};
