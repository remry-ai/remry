// Turns `--key value` arguments into a procedure input. Values are coerced by
// the procedure's JSON Schema, so they reach Zod with the types it expects.
//   --key value | --key=value   one input field
//   --flag                      boolean true
//   --key null                  null, for nullable fields
//   --<key>-file <path>         read the field's value from a file (long markdown)
//   --input '<json>'            the whole input as JSON (or --input-file <path>)

import { ok, err, type Result } from '$shared/utils/result';

export interface JsonSchema {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly anyOf?: readonly JsonSchema[];
  readonly enum?: readonly unknown[];
  readonly format?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly maxLength?: number;
}

export type FileReader = (path: string) => string;

export interface GlobalArgs {
  /** `--notebook <id or name>`: the notebook to call against. */
  readonly notebook?: string;
  /** Every other argument, in order. */
  readonly rest: readonly string[];
}

/** Takes the options every command accepts (`--notebook`) out of argv, wherever they appear. */
export const splitGlobalArgs = (argv: readonly string[]): Result<GlobalArgs> => {
  const rest: string[] = [];
  let notebook: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    let value: string | undefined;
    if (arg === '--notebook') {
      value = argv[i + 1];
      i++;
    } else if (arg.startsWith('--notebook=')) {
      value = arg.slice('--notebook='.length);
    } else {
      rest.push(arg);
      continue;
    }
    if (!value || value.startsWith('--')) return err(new Error('--notebook needs a notebook id or name'));
    notebook = value;
  }
  return ok(notebook === undefined ? { rest } : { notebook, rest });
};

/** Every JSON type a schema accepts, including through anyOf and enum. */
export const typesOf = (schema: JsonSchema | undefined): ReadonlySet<string> => {
  if (!schema) return new Set();
  const own = schema.type === undefined ? [] : typeof schema.type === 'string' ? [schema.type] : [...schema.type];
  const nested = (schema.anyOf ?? []).flatMap((s) => [...typesOf(s)]);
  const fromEnum = (schema.enum ?? []).map((v) => (v === null ? 'null' : typeof v));
  return new Set([...own, ...nested, ...fromEnum]);
};

const coerce = (key: string, raw: string | true, prop: JsonSchema | undefined): Result<unknown> => {
  if (!prop) return err(new Error(`Unknown option --${key}`));
  const types = typesOf(prop);

  if (raw === true) return types.has('boolean') ? ok(true) : err(new Error(`--${key} needs a value`));
  if (raw === 'null' && types.has('null')) return ok(null);
  if (types.has('string') || types.size === 0) return ok(raw);
  if (types.has('number') || types.has('integer')) {
    const n = Number(raw);
    return raw.trim() !== '' && Number.isFinite(n) ? ok(n) : err(new Error(`--${key} must be a number (got "${raw}")`));
  }
  if (types.has('boolean')) {
    if (raw === 'true') return ok(true);
    if (raw === 'false') return ok(false);
    return err(new Error(`--${key} must be true or false (got "${raw}")`));
  }
  if (types.has('array') || types.has('object')) {
    try {
      return ok(JSON.parse(raw));
    } catch {
      return err(new Error(`--${key} must be JSON`));
    }
  }
  return ok(raw);
};

const read = (key: string, path: string | true, readFile: FileReader): Result<string> => {
  if (path === true) return err(new Error(`--${key} needs a file path`));
  try {
    return ok(readFile(path));
  } catch (e) {
    return err(new Error(`Could not read ${path} for --${key}: ${e instanceof Error ? e.message : String(e)}`));
  }
};

export const coerceArgs = (
  argv: readonly string[],
  schema: unknown,
  readFile: FileReader
): Result<Record<string, unknown> | undefined> => {
  const props = ((schema ?? {}) as JsonSchema).properties ?? {};
  const fields: Record<string, unknown> = {};
  let whole: unknown;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--') || arg === '--') {
      return err(new Error(`Unexpected argument "${arg}" (options look like --name value)`));
    }

    let key: string;
    let value: string | true;
    const eq = arg.indexOf('=');
    if (eq > -1) {
      key = arg.slice(2, eq);
      value = arg.slice(eq + 1);
    } else {
      key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) value = true;
      else {
        value = next;
        i++;
      }
    }

    if (key === 'input' || key === 'input-file') {
      const text = key === 'input' ? (value === true ? err(new Error('--input needs JSON')) : ok(value)) : read(key, value, readFile);
      if (!text.ok) return text;
      try {
        whole = JSON.parse(text.value);
      } catch {
        return err(new Error(`--${key} is not valid JSON`));
      }
      continue;
    }

    let name = key;
    if (key.endsWith('-file') && !(key in props)) {
      name = key.slice(0, -'-file'.length);
      const text = read(key, value, readFile);
      if (!text.ok) return text;
      value = text.value;
    }

    const coerced = coerce(name, value, props[name]);
    if (!coerced.ok) return coerced;
    fields[name] = coerced.value;
  }

  if (whole !== undefined) {
    return Object.keys(fields).length > 0
      ? err(new Error('Use either --input or individual options, not both'))
      : ok(whole as Record<string, unknown>);
  }
  return ok(Object.keys(fields).length > 0 ? fields : undefined);
};
