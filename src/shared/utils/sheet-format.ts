// How a spreadsheet shows numbers: a column's format (number, currency or
// percent, with its decimals) and the format codes TEXT takes ("$#,##0.00").
// Both go through one formatter. Formatting is only what a cell shows: formulas
// read what was typed, so $1,200.00 and 1200 add up the same. Always US style
// (1,234.56), so the server and the browser show the same text. Pure.

export const CURRENCY_SYMBOLS = ['$', '€', '£', '¥'] as const;
export type CurrencySymbol = (typeof CURRENCY_SYMBOLS)[number];

export const SHEET_FORMAT_TYPES = ['number', 'currency', 'percent'] as const;
export type SheetFormatType = (typeof SHEET_FORMAT_TYPES)[number];

export const MAX_DECIMALS = 6;

/** A column's number format. A cell that isn't a number shows as typed. */
export interface SheetFormat {
  readonly type: SheetFormatType;
  /** Digits after the point, always shown: 2 shows 3 as 3.00. */
  readonly decimals: number;
  /** A currency's symbol, before the number; $ when left out. */
  readonly symbol?: CurrencySymbol;
}

/** A number's look: what goes around it, its digits and grouping. */
interface NumberPattern {
  readonly prefix: string;
  readonly suffix: string;
  /** Digits shown before the point at least (0 drops a lone 0: .5). */
  readonly minInt: number;
  readonly minDecimals: number;
  readonly maxDecimals: number;
  /** Thousands separated by commas. */
  readonly grouping: boolean;
  /** Times 100, for a % in the code. */
  readonly percent: boolean;
  /** False for a code with no digit placeholders: it shows only its text. */
  readonly digits: boolean;
}

// Rounds half away from zero in decimal, so 1.005 to 2 places is 1.01 (toFixed gives 1.00).
const roundTo = (n: number, places: number): number => {
  const shifted = Math.round(Number(`${Math.abs(n)}e${places}`));
  return Math.sign(n) * Number(`${shifted}e-${places}`);
};

const groupThousands = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const formatWith = (n: number, p: NumberPattern): string => {
  const scaled = p.percent ? n * 100 : n;
  if (!Number.isFinite(scaled) || Math.abs(scaled) >= 1e15) return `${p.prefix}${String(scaled)}${p.suffix}`;
  const rounded = roundTo(scaled, p.maxDecimals);
  let [int = '0', frac = ''] = Math.abs(rounded).toFixed(p.maxDecimals).split('.');
  while (frac.length > p.minDecimals && frac.endsWith('0')) frac = frac.slice(0, -1);
  if (p.minInt === 0 && int === '0') int = '';
  int = int.padStart(p.minInt, '0');
  if (p.grouping) int = groupThousands(int);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${p.prefix}${int}${frac ? `.${frac}` : ''}${p.suffix}`;
};

const clampDecimals = (d: number): number => Math.min(MAX_DECIMALS, Math.max(0, Math.trunc(d)));

/** A number in a column's format: 1234.5 as $1,234.50, 0.125 as 12.5%. */
export const applyFormat = (n: number, format: SheetFormat): string => {
  const decimals = clampDecimals(format.decimals);
  return formatWith(n, {
    prefix: format.type === 'currency' ? format.symbol ?? '$' : '',
    suffix: format.type === 'percent' ? '%' : '',
    minInt: 1,
    minDecimals: decimals,
    maxDecimals: decimals,
    grouping: true,
    percent: format.type === 'percent',
    digits: true
  });
};

/** A format's name with an example, for the menu: "Dollars ($1,234.50)". */
export const formatExample = (format: SheetFormat): string => applyFormat(format.type === 'percent' ? 0.125 : 1234.5, format);

/**
 * Reads a spreadsheet number format code, as TEXT takes it: 0 is a digit always
 * shown, # one shown when needed, a comma between them groups thousands, a point
 * starts the decimals, and % multiplies by 100. Anything before or after the
 * digits is shown as it is: symbols, spaces, "quoted text" and \escaped
 * characters. Only the first section counts (a code's ;negative section isn't
 * read). Letters outside quotes (dates: yyyy-mm-dd) aren't supported: an error,
 * as a string.
 */
export const parseFormatCode = (code: string): NumberPattern | { readonly error: string } => {
  const section = splitSections(code)[0] ?? '';
  // Each piece is literal text, or a placeholder character of the number.
  const pieces: { readonly literal: boolean; readonly text: string }[] = [];
  for (let i = 0; i < section.length; i++) {
    const ch = section[i]!;
    if (ch === '"') {
      const end = section.indexOf('"', i + 1);
      pieces.push({ literal: true, text: section.slice(i + 1, end < 0 ? undefined : end) });
      i = end < 0 ? section.length : end;
    } else if (ch === '\\') {
      pieces.push({ literal: true, text: section[i + 1] ?? '' });
      i++;
    } else if ('0#?.,'.includes(ch)) {
      pieces.push({ literal: false, text: ch });
    } else if (/[A-Za-z]/.test(ch)) {
      return { error: `TEXT formats numbers, with codes like "$#,##0.00" or "0.0%" (put words in quotes): "${ch}" can't be read.` };
    } else {
      pieces.push({ literal: true, text: ch });
    }
  }
  const digitAt = pieces.map((p) => !p.literal && '0#?'.includes(p.text));
  const first = digitAt.indexOf(true);
  const last = digitAt.lastIndexOf(true);
  const textOf = (from: number, to: number) => pieces.slice(from, to).map((p) => p.text).join('');
  const percent = pieces.some((p) => p.literal && p.text === '%');
  if (first < 0) {
    // No digits: just the text.
    return { prefix: textOf(0, pieces.length), suffix: '', minInt: 0, minDecimals: 0, maxDecimals: 0, grouping: false, percent, digits: false };
  }
  // A point right after the last digit (0.) still starts the decimals.
  const end = pieces[last + 1]?.text === '.' && !pieces[last + 1]!.literal ? last + 2 : last + 1;
  const number = pieces.slice(first, end).filter((p) => !p.literal).map((p) => p.text).join('');
  const [intPart = '', fracPart = ''] = number.split('.');
  return {
    prefix: textOf(0, first),
    suffix: textOf(end, pieces.length),
    minInt: (intPart.match(/0/g) ?? []).length,
    minDecimals: (fracPart.match(/0/g) ?? []).length,
    maxDecimals: (fracPart.match(/[0#?]/g) ?? []).length,
    grouping: /[0#?],+[0#?]/.test(intPart),
    percent,
    digits: true
  };
};

const splitSections = (code: string): string[] => {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;
    if (ch === '"') quoted = !quoted;
    if (ch === '\\' && !quoted) { current += ch + (code[i + 1] ?? ''); i++; continue; }
    if (ch === ';' && !quoted) { out.push(current); current = ''; continue; }
    current += ch;
  }
  out.push(current);
  return out;
};

/** A number in a TEXT format code: TEXT(1234.5, "$#,##0.00") is $1,234.50. */
export const formatWithCode = (n: number, code: string): string | { readonly error: string } => {
  const pattern = parseFormatCode(code);
  if ('error' in pattern) return pattern;
  return pattern.digits ? formatWith(n, pattern) : pattern.prefix;
};
