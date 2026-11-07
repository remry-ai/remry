// Spreadsheet formulas, evaluated without eval: Jspreadsheet's own engine runs
// formulas through eval, which the app's Content Security Policy refuses (and
// must keep refusing), so every formula showed #ERROR. This one parses the
// formula itself. It's shared, so the server fills a sheet's `values` when it's
// saved (a formula Claude writes has its result at once) and the grid shows
// the same results, and each error carries a reason the sheet can show.
//
// A formula starts with "=": numbers, "text", TRUE/FALSE, cells (B2) and
// ranges (B2:B9), + - * / ^ (power), & (joins text), % (a percent), the
// comparisons = <> < > <= >=, brackets, and the functions in FORMULA_FUNCTIONS.
// An empty cell counts as 0 in arithmetic and is skipped by SUM and the like.
// A cell past the sheet's edge is empty, as in Excel. Pure.

import { columnLetter, type SheetRows } from './sheet';
import { applyFormat, formatWithCode, type SheetFormat } from './sheet-format';

export const FORMULA_ERRORS = {
  syntax: '#ERROR!',
  name: '#NAME?',
  value: '#VALUE!',
  div0: '#DIV/0!',
  cycle: '#CYCLE!'
} as const;

export type FormulaErrorCode = (typeof FORMULA_ERRORS)[keyof typeof FORMULA_ERRORS];

class FormulaError {
  constructor(readonly code: FormulaErrorCode, readonly message: string) {}
}

interface CellRange {
  readonly kind: 'range';
  /** Each cell's value, row by row; null for an empty cell. */
  readonly cells: readonly (Scalar | null)[];
}

type Scalar = number | string | boolean;
type Value = Scalar | FormulaError | CellRange;

/** A cell's address, as the sheet names it: B2. */
export const cellName = (x: number, y: number): string => `${columnLetter(x)}${y + 1}`;

const parseAddress = (ref: string): { readonly x: number; readonly y: number } | null => {
  const match = /^\$?([A-Z]{1,3})\$?(\d{1,6})$/.exec(ref);
  if (!match) return null;
  let x = 0;
  for (const ch of match[1]!) x = x * 26 + (ch.charCodeAt(0) - 64);
  const y = Number(match[2]) - 1;
  return y < 0 ? null : { x: x - 1, y };
};

/**
 * A cell's text as a number, as people type them: 1200, 1,200, $15.49, -3.5,
 * 12% (0.12), 1e3. Anything else (text, an empty cell) is null.
 */
export const parseCellNumber = (raw: string): number | null => {
  const text = raw.trim().replace(/[$€£¥,\s]/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i.test(text)) return null;
  const percent = text.endsWith('%');
  const n = Number(percent ? text.slice(0, -1) : text);
  return Number.isFinite(n) ? (percent ? n / 100 : n) : null;
};

// ----- Tokens -----

type Token =
  | { readonly t: 'num'; readonly v: number }
  | { readonly t: 'str'; readonly v: string }
  | { readonly t: 'ref'; readonly v: string }
  | { readonly t: 'name'; readonly v: string }
  | { readonly t: 'op'; readonly v: string };

const tokenize = (src: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      let j = i + 1;
      let text = '';
      while (j < src.length) {
        if (src[j] === '"' && src[j + 1] === '"') { text += '"'; j += 2; continue; }
        if (src[j] === '"') break;
        text += src[j++];
      }
      if (j >= src.length) throw new FormulaError(FORMULA_ERRORS.syntax, 'A "quoted text" isn\'t closed.');
      tokens.push({ t: 'str', v: text });
      i = j + 1;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(src.slice(i));
    if (num) {
      tokens.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const word = /^\$?[A-Za-z_][A-Za-z0-9_.]*\$?\d*/.exec(src.slice(i));
    if (word) {
      const v = word[0].toUpperCase();
      tokens.push(parseAddress(v) ? { t: 'ref', v } : { t: 'name', v: v.replace(/\$/g, '') });
      i += word[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/^&%=<>(),:;'.includes(ch)) { tokens.push({ t: 'op', v: ch === ';' ? ',' : ch }); i++; continue; }
    throw new FormulaError(FORMULA_ERRORS.syntax, `"${ch}" can't be read in a formula.`);
  }
  return tokens;
};

// ----- Evaluation -----

interface Context {
  /** A cell's value (its formula worked out), or null when it's empty. */
  readonly cell: (x: number, y: number) => Scalar | FormulaError | null;
}

const isError = (v: unknown): v is FormulaError => v instanceof FormulaError;

const scalarOf = (v: Value): Scalar | FormulaError => {
  if (isError(v) || typeof v !== 'object') return v;
  if (v.cells.length === 1) return v.cells[0] ?? 0;
  return new FormulaError(FORMULA_ERRORS.value, 'A range (like B2:B9) can only go in a function such as SUM.');
};

const toNumber = (v: Value): number | FormulaError => {
  const s = scalarOf(v);
  if (isError(s)) return s;
  if (typeof s === 'number') return s;
  if (typeof s === 'boolean') return s ? 1 : 0;
  if (s === '') return 0;
  const n = parseCellNumber(s);
  return n ?? new FormulaError(FORMULA_ERRORS.value, `"${s}" isn't a number.`);
};

const toText = (v: Value): string | FormulaError => {
  const s = scalarOf(v);
  return isError(s) ? s : formatValue(s);
};

const toBool = (v: Value): boolean | FormulaError => {
  const s = scalarOf(v);
  if (isError(s)) return s;
  if (typeof s === 'boolean') return s;
  if (typeof s === 'number') return s !== 0;
  if (s.toUpperCase() === 'TRUE') return true;
  if (s.toUpperCase() === 'FALSE' || s === '') return false;
  const n = parseCellNumber(s);
  return n === null ? new FormulaError(FORMULA_ERRORS.value, `"${s}" isn't TRUE or FALSE.`) : n !== 0;
};

/** The numbers among a function's arguments: from ranges, only cells holding numbers; given directly, anything that reads as one. */
const numbersIn = (args: readonly Value[]): number[] | FormulaError => {
  const out: number[] = [];
  for (const arg of args) {
    if (isError(arg)) return arg;
    if (typeof arg === 'object') {
      for (const cell of arg.cells) {
        if (isError(cell)) return cell;
        if (typeof cell === 'number') out.push(cell);
        else if (typeof cell === 'string') {
          const n = parseCellNumber(cell);
          if (n !== null) out.push(n);
        }
      }
      continue;
    }
    const n = toNumber(arg);
    if (isError(n)) return n;
    out.push(n);
  }
  return out;
};

const valuesIn = (args: readonly Value[]): (Scalar | FormulaError | null)[] =>
  args.flatMap((arg): (Scalar | FormulaError | null)[] => (typeof arg === 'object' && !isError(arg) ? [...arg.cells] : [arg]));

const firstError = (args: readonly Value[]): FormulaError | null => {
  for (const v of valuesIn(args)) if (isError(v)) return v;
  return null;
};

const needArgs = (name: string, args: readonly Value[], min: number, max = Infinity): FormulaError | null =>
  args.length < min || args.length > max
    ? new FormulaError(FORMULA_ERRORS.value, `${name} takes ${min === max ? min : max === Infinity ? `at least ${min}` : `${min} to ${max}`} value${max === 1 ? '' : 's'}.`)
    : null;

type Fn = (args: readonly Value[]) => Value;

const reduceNumbers = (name: string, combine: (ns: number[]) => number | FormulaError): Fn => (args) => {
  const wrong = needArgs(name, args, 1);
  if (wrong) return wrong;
  const ns = numbersIn(args);
  return isError(ns) ? ns : combine(ns);
};

const FUNCTIONS: Readonly<Record<string, Fn>> = {
  SUM: reduceNumbers('SUM', (ns) => ns.reduce((a, b) => a + b, 0)),
  AVERAGE: reduceNumbers('AVERAGE', (ns) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : new FormulaError(FORMULA_ERRORS.div0, 'AVERAGE has no numbers to average.'))),
  MIN: reduceNumbers('MIN', (ns) => (ns.length ? Math.min(...ns) : 0)),
  MAX: reduceNumbers('MAX', (ns) => (ns.length ? Math.max(...ns) : 0)),
  PRODUCT: reduceNumbers('PRODUCT', (ns) => ns.reduce((a, b) => a * b, 1)),
  COUNT: (args) => {
    const error = firstError(args);
    if (error) return error;
    return valuesIn(args).filter((v) => typeof v === 'number' || (typeof v === 'string' && parseCellNumber(v) !== null)).length;
  },
  COUNTA: (args) => valuesIn(args).filter((v) => v !== null && v !== '').length,
  ROUND: (args) => {
    const wrong = needArgs('ROUND', args, 1, 2);
    if (wrong) return wrong;
    const n = toNumber(args[0]!);
    const d = args[1] === undefined ? 0 : toNumber(args[1]);
    if (isError(n)) return n;
    if (isError(d)) return d;
    const f = 10 ** Math.trunc(d);
    return Math.round(n * f) / f;
  },
  ABS: (args) => {
    const wrong = needArgs('ABS', args, 1, 1);
    if (wrong) return wrong;
    const n = toNumber(args[0]!);
    return isError(n) ? n : Math.abs(n);
  },
  IF: (args) => {
    const wrong = needArgs('IF', args, 2, 3);
    if (wrong) return wrong;
    const c = toBool(args[0]!);
    if (isError(c)) return c;
    return scalarOf(c ? args[1]! : args[2] ?? false);
  },
  IFERROR: (args) => {
    const wrong = needArgs('IFERROR', args, 2, 2);
    if (wrong) return wrong;
    const v = scalarOf(args[0]!);
    return isError(v) ? scalarOf(args[1]!) : v;
  },
  AND: (args) => {
    const error = firstError(args);
    if (error) return error;
    for (const v of valuesIn(args)) if (v !== null && v !== '' && !toBool(v as Scalar)) return false;
    return true;
  },
  OR: (args) => {
    const error = firstError(args);
    if (error) return error;
    return valuesIn(args).some((v) => v !== null && v !== '' && toBool(v as Scalar) === true);
  },
  NOT: (args) => {
    const wrong = needArgs('NOT', args, 1, 1);
    if (wrong) return wrong;
    const b = toBool(args[0]!);
    return isError(b) ? b : !b;
  },
  CONCAT: (args) => {
    let out = '';
    for (const v of valuesIn(args)) {
      if (isError(v)) return v;
      out += v === null ? '' : formatValue(v);
    }
    return out;
  },
  LEN: (args) => {
    const wrong = needArgs('LEN', args, 1, 1);
    if (wrong) return wrong;
    const t = toText(args[0]!);
    return isError(t) ? t : t.length;
  },
  UPPER: (args) => { const t = needArgs('UPPER', args, 1, 1) ?? toText(args[0]!); return isError(t) ? t : t.toUpperCase(); },
  LOWER: (args) => { const t = needArgs('LOWER', args, 1, 1) ?? toText(args[0]!); return isError(t) ? t : t.toLowerCase(); },
  TRIM: (args) => { const t = needArgs('TRIM', args, 1, 1) ?? toText(args[0]!); return isError(t) ? t : t.trim().replace(/\s+/g, ' '); },
  // TEXT(B2, "$#,##0.00"): a number in a format code (./sheet-format). Text that isn't a number comes back as it is.
  TEXT: (args) => {
    const wrong = needArgs('TEXT', args, 2, 2);
    if (wrong) return wrong;
    const v = scalarOf(args[0]!);
    if (isError(v)) return v;
    const code = toText(args[1]!);
    if (isError(code)) return code;
    const n = typeof v === 'number' ? v : typeof v === 'boolean' ? null : v === '' ? 0 : parseCellNumber(v);
    if (n === null) return formatValue(v);
    const out = formatWithCode(n, code);
    return typeof out === 'string' ? out : new FormulaError(FORMULA_ERRORS.value, out.error);
  }
};

const ALIASES: Readonly<Record<string, string>> = { AVG: 'AVERAGE', CONCATENATE: 'CONCAT' };

/** The functions a formula can use, for the sheet's help line and the skill. */
export const FORMULA_FUNCTIONS: readonly string[] = Object.keys(FUNCTIONS);

const compare = (op: string, a: Value, b: Value): Value => {
  const l = scalarOf(a), r = scalarOf(b);
  if (isError(l)) return l;
  if (isError(r)) return r;
  const ln = typeof l === 'number' ? l : typeof l === 'string' ? parseCellNumber(l) : null;
  const rn = typeof r === 'number' ? r : typeof r === 'string' ? parseCellNumber(r) : null;
  const [x, y] = ln !== null && rn !== null ? [ln, rn] : [formatValue(l).toLowerCase(), formatValue(r).toLowerCase()];
  switch (op) {
    case '=': return x === y;
    case '<>': return x !== y;
    case '<': return x < y;
    case '>': return x > y;
    case '<=': return x <= y;
    default: return x >= y;
  }
};

const arithmetic = (op: string, a: Value, b: Value): Value => {
  const l = toNumber(a), r = toNumber(b);
  if (isError(l)) return l;
  if (isError(r)) return r;
  switch (op) {
    case '+': return l + r;
    case '-': return l - r;
    case '*': return l * r;
    case '/': return r === 0 ? new FormulaError(FORMULA_ERRORS.div0, 'Divides by zero (or by an empty cell).') : l / r;
    default: return l ** r;
  }
};

/** Parses and works out one formula's expression (the text after "="). */
const evaluateExpression = (src: string, ctx: Context): Value => {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const isOp = (v: string): boolean => peek()?.t === 'op' && peek()!.v === v;
  const expect = (v: string, after: string) => {
    if (!isOp(v)) throw new FormulaError(FORMULA_ERRORS.syntax, `Expected "${v}" ${after}.`);
    pos++;
  };

  const range = (from: string, to: string): Value => {
    const a = parseAddress(from)!, b = parseAddress(to)!;
    const cells: (Scalar | null)[] = [];
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
        const v = ctx.cell(x, y);
        if (isError(v)) return v;
        cells.push(v);
      }
    }
    return { kind: 'range', cells };
  };

  const primary = (): Value => {
    const tok = peek();
    if (!tok) throw new FormulaError(FORMULA_ERRORS.syntax, 'The formula stops before it\'s finished.');
    pos++;
    if (tok.t === 'num' || tok.t === 'str') return tok.v;
    if (tok.t === 'ref') {
      if (isOp(':')) {
        pos++;
        const end = peek();
        if (end?.t !== 'ref') throw new FormulaError(FORMULA_ERRORS.syntax, `A range needs a cell after "${tok.v}:", like ${tok.v}:B9.`);
        pos++;
        return range(tok.v, end.v);
      }
      const { x, y } = parseAddress(tok.v)!;
      return ctx.cell(x, y) ?? 0;
    }
    if (tok.t === 'name') {
      if (tok.v === 'TRUE' && !isOp('(')) return true;
      if (tok.v === 'FALSE' && !isOp('(')) return false;
      if (!isOp('(')) throw new FormulaError(FORMULA_ERRORS.name, `"${tok.v}" isn't a cell or a function.`);
      pos++;
      const args: Value[] = [];
      if (!isOp(')')) {
        do { args.push(comparison()); } while (isOp(',') && ++pos);
      }
      expect(')', `to close ${tok.v}(`);
      const fn = FUNCTIONS[ALIASES[tok.v] ?? tok.v];
      if (!fn) throw new FormulaError(FORMULA_ERRORS.name, `There's no function ${tok.v}.`);
      return fn(args);
    }
    if (tok.v === '(') {
      const v = comparison();
      expect(')', 'to close a bracket');
      return v;
    }
    if (tok.v === '-' || tok.v === '+') {
      const v = power();
      if (tok.v === '+') return v;
      const n = toNumber(v);
      return isError(n) ? n : -n;
    }
    throw new FormulaError(FORMULA_ERRORS.syntax, `"${tok.v}" is out of place.`);
  };

  const percent = (): Value => {
    let v = primary();
    while (isOp('%')) {
      pos++;
      const n = toNumber(v);
      v = isError(n) ? n : n / 100;
    }
    return v;
  };
  const power = (): Value => {
    const base = percent();
    if (!isOp('^')) return base;
    pos++;
    return arithmetic('^', base, power());
  };
  const term = (): Value => {
    let v = power();
    while (isOp('*') || isOp('/')) { const op = tokens[pos++]!.v as string; v = arithmetic(op, v, power()); }
    return v;
  };
  const additive = (): Value => {
    let v = term();
    while (isOp('+') || isOp('-')) { const op = tokens[pos++]!.v as string; v = arithmetic(op, v, term()); }
    return v;
  };
  const concat = (): Value => {
    let v = additive();
    while (isOp('&')) {
      pos++;
      const l = toText(v), r = toText(additive());
      v = isError(l) ? l : isError(r) ? r : l + r;
    }
    return v;
  };
  const comparison = (): Value => {
    let v = concat();
    while (['=', '<>', '<', '>', '<=', '>='].some(isOp)) { const op = tokens[pos++]!.v as string; v = compare(op, v, concat()); }
    return v;
  };

  if (tokens.length === 0) throw new FormulaError(FORMULA_ERRORS.syntax, 'The formula is empty after "=".');
  const result = comparison();
  if (pos < tokens.length) throw new FormulaError(FORMULA_ERRORS.syntax, `"${(tokens[pos] as Token).v}" is out of place.`);
  return result;
};

/** A result as a cell shows it: numbers without float noise (0.1 + 0.2 is 0.3), TRUE/FALSE. */
export const formatValue = (v: Scalar): string => {
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Number(v.toPrecision(12))) : '#NUM!';
  return v;
};

export interface FormulaProblem {
  /** The cell with the formula: B7. */
  readonly cell: string;
  readonly x: number;
  readonly y: number;
  readonly code: FormulaErrorCode;
  /** Why, in words: "There's no function SUMM." */
  readonly message: string;
}

export interface EvaluatedSheet {
  /** What each cell shows: its text, or its formula's result (an error code when it fails). */
  readonly values: string[][];
  /** Every formula that failed, top to bottom, with why. */
  readonly problems: readonly FormulaProblem[];
}

/**
 * Works out every formula in a sheet's cells, each once, following references between them.
 * With `formats` (each column's, by index), a number shows in its column's format: typed
 * (1200 as $1,200.00) or a formula's result. Text, and a TEXT result, shows as it is.
 */
export const evaluateSheet = (data: SheetRows, formats: readonly (SheetFormat | undefined)[] = []): EvaluatedSheet => {
  const results = new Map<string, Scalar | FormulaError | null>();
  const inProgress = new Set<string>();

  const cell = (x: number, y: number): Scalar | FormulaError | null => {
    const raw = data[y]?.[x] ?? '';
    if (!raw.startsWith('=')) {
      if (raw.trim() === '') return null;
      return parseCellNumber(raw) ?? raw;
    }
    const key = cellName(x, y);
    if (results.has(key)) return results.get(key)!;
    if (inProgress.has(key)) return new FormulaError(FORMULA_ERRORS.cycle, `${key} refers back to itself, directly or through other cells.`);
    inProgress.add(key);
    let result: Scalar | FormulaError;
    try {
      result = scalarOf(evaluateExpression(raw.slice(1), { cell }));
    } catch (e) {
      result = isError(e) ? e : new FormulaError(FORMULA_ERRORS.syntax, String(e));
    }
    inProgress.delete(key);
    results.set(key, result);
    return result;
  };

  const problems: FormulaProblem[] = [];
  const values = data.map((row, y) => row.map((raw, x) => {
    const format = formats[x];
    if (!raw.startsWith('=')) {
      const n = format ? parseCellNumber(raw) : null;
      return n === null || !format ? raw : applyFormat(n, format);
    }
    const v = cell(x, y);
    if (isError(v)) {
      problems.push({ cell: cellName(x, y), x, y, code: v.code, message: v.message });
      return v.code;
    }
    if (v === null) return '';
    return typeof v === 'number' && format ? applyFormat(v, format) : formatValue(v);
  }));
  return { values, problems };
};
