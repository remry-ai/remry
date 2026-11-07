// What a doc's or wiki page's body is: markdown (`doc`), a spreadsheet's JSON
// (`sheet`, see $shared/utils/sheet) or a drawing's JSON (`drawing`, see
// $shared/utils/drawing). Docs and pages take the same three.

export const BODY_TYPES = ['doc', 'sheet', 'drawing'] as const;

export type BodyType = (typeof BODY_TYPES)[number];

/** Reads a stored body_type; anything unknown is markdown. */
export const asBodyType = (value: string): BodyType => (value === 'sheet' || value === 'drawing' ? value : 'doc');

/** How a body type is named in messages: "a spreadsheet". */
export const BODY_NAMES: Readonly<Record<BodyType, string>> = { doc: 'document', sheet: 'spreadsheet', drawing: 'drawing' };
