// What a spreadsheet's holder (an open doc's bar, a wiki page's Content heading) needs from the
// grid to show its save state, Save and Full screen beside its other actions, as a document's
// bar does: the grid (SheetEditor) keeps these up to date and hands over its save.

export class SheetControl {
  /** Changes not saved yet. */
  dirty = $state(false);
  saving = $state(false);
  /** The grid over the whole window. */
  fullScreen = $state(false);

  #save: (() => Promise<boolean>) | null = null;

  /** The grid hands over its save while it's mounted; the returned function takes it back. */
  attach(save: () => Promise<boolean>): () => void {
    this.#save = save;
    return () => {
      if (this.#save === save) this.#save = null;
    };
  }

  /** Saves any changes (an open cell's edit included); true once nothing is left unsaved. */
  save(): Promise<boolean> {
    return this.#save ? this.#save() : Promise.resolve(true);
  }
}
