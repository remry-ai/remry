// Whether each section of an entity page's left drawer (Related, Links, Reports) is open. A
// per-browser preference, so localStorage is enough; the page renders the default first and the
// remembered choice once mounted, since the server can't see it.

export type SidebarSection = 'relations' | 'links' | 'reports';

/** Related starts folded: it's often long, and the page names most of it already. */
export const SECTION_OPEN_BY_DEFAULT: Readonly<Record<SidebarSection, boolean>> = { relations: false, links: true, reports: true };

const storageKey = (section: SidebarSection): string => `wn-sidebar-${section}`;

export const storedSectionOpen = (section: SidebarSection): boolean => {
  try {
    const raw = localStorage.getItem(storageKey(section));
    return raw === null ? SECTION_OPEN_BY_DEFAULT[section] : raw === 'true';
  } catch {
    return SECTION_OPEN_BY_DEFAULT[section];
  }
};

export const storeSectionOpen = (section: SidebarSection, open: boolean): void => {
  try {
    localStorage.setItem(storageKey(section), String(open));
  } catch { /* storage unavailable: it lasts this page only */ }
};
