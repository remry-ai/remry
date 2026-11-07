// How the create menus show the drawing allowance: the free ones used so far, and the Pro icon
// once they're gone. Pure; the /app layout loads the allowance as `drawingAllowance`.

export interface DrawingAllowanceView {
  readonly used: number;
  readonly free: number;
  /** Whether another can be made now: with Pro, or while under the free ones. */
  readonly canAdd: boolean;
  readonly pro: boolean;
}

export interface DrawingMarks {
  /** "1 of 3 free", or nothing with Pro. */
  readonly hint?: string;
  /** Show the Pro icon: the free ones are used up. */
  readonly pro: boolean;
}

export const drawingMenuMarks = (allowance: DrawingAllowanceView): DrawingMarks =>
  allowance.pro
    ? { pro: false }
    : { hint: `${Math.min(allowance.used, allowance.free)} of ${allowance.free} free`, pro: !allowance.canAdd };

/** A line for a form: how many free drawings this notebook has used, or what to do once they're gone. */
export const drawingAllowanceNote = (allowance: DrawingAllowanceView): string | null => {
  if (allowance.pro) return null;
  if (!allowance.canAdd) return `This notebook has used its ${allowance.free} free drawings. More are part of Remry Pro; its drawings stay editable either way.`;
  return `${allowance.used} of ${allowance.free} free drawings used in this notebook.`;
};
