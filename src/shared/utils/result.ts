// Result<T, E> - functional error handling. Avoid throwing in business logic.

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E = Error> = { readonly ok: false; readonly error: E };
export type Result<T, E = Error> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
// An Error's `message` is non-enumerable, so JSON (tRPC responses, CLI output)
// would serialize it as {}. Make it enumerable so `error.message` survives.
const serializable = <E>(error: E): E => {
  if (error instanceof Error) {
    Object.defineProperty(error, 'message', { value: error.message, enumerable: true, writable: true, configurable: true });
  }
  return error;
};

export const err = <E = Error>(error: E): Err<E> => ({ ok: false, error: serializable(error) });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;
