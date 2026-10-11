// Whether a drawer is showing. Pure; the stores are in stores/drawers.ts.
//
// A docked drawer sits beside the page and remembers whether it's open. A
// floating one covers the page, starts closed, and only one is open at a time
// (`activeDrawer`).

export type DrawerSide = 'left' | 'right';
export type ActiveDrawer = DrawerSide | null;

export const isDrawerOpen = (side: DrawerSide, floating: boolean, docked: boolean, active: ActiveDrawer): boolean =>
  floating ? active === side : docked;

/** The floating drawer that stays open now that `side` is toggled. */
export const toggledActive = (side: DrawerSide, active: ActiveDrawer): ActiveDrawer =>
  active === side ? null : side;

/** A floating drawer closes once its side docks, so it doesn't reopen when the window narrows again. */
export const activeAfterResize = (active: ActiveDrawer, leftFloating: boolean, rightFloating: boolean): ActiveDrawer =>
  (active === 'left' && !leftFloating) || (active === 'right' && !rightFloating) ? null : active;
