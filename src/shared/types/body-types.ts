// What a doc's or wiki page's body is: markdown (`doc`), a spreadsheet's JSON
// (`sheet`, see $shared/utils/sheet) or a drawing's JSON (`drawing`, see
// $shared/utils/drawing). Docs and pages take the same three.

export const BODY_TYPES = ['doc', 'sheet', 'drawing'] as const;

export type BodyType = (typeof BODY_TYPES)[number];

/** Reads a stored body_type; anything unknown is markdown. */
export const asBodyType = (value: string): BodyType => (value === 'sheet' || value === 'drawing' ? value : 'doc');

/** How a body type is named in messages: "a spreadsheet". */
export const BODY_NAMES: Readonly<Record<BodyType, string>> = { doc: 'document', sheet: 'spreadsheet', drawing: 'drawing' };

/** How a body type is labelled in the app: a badge, a menu item, a select option. */
export const BODY_LABELS: Readonly<Record<BodyType, string>> = { doc: 'Document', sheet: 'Spreadsheet', drawing: 'Drawing' };

/** A spreadsheet or a drawing: the bodies with their own editor, not markdown. */
export type GridOrDrawing = Exclude<BodyType, 'doc'>;

export const isGridOrDrawing = (bodyType: BodyType): bodyType is GridOrDrawing => bodyType !== 'doc';
