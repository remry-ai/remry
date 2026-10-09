import { NOTEBOOK_PARAM } from '$shared/notebooks/id';

/**
 * Opens the app in another notebook. A full page load on purpose: nothing from the
 * old notebook (ids in the URL, loaded lists, open popups) carries over.
 * The server remembers the choice in a cookie.
 */
export const switchNotebook = (id: string): void => {
  window.location.assign(`/app?${NOTEBOOK_PARAM}=${encodeURIComponent(id)}`);
};
