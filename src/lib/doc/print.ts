// "Print…" on the print pages. In a browser it's window.print(). In the desktop app's window
// that does nothing (Tauri sends it through IPC, which the page doesn't get), so the page asks
// the window instead: the shell flags its windows with `__remryDesktop` and turns a navigation
// to `remry-print:` into a print (PRINT_SCHEME in desktop/src-tauri/src/main.rs).

export const DESKTOP_PRINT_URL = 'remry-print:page';

interface PrintTarget {
  readonly __remryDesktop?: boolean;
  readonly print: () => void;
  readonly location: { href: string };
}

export const printPage = (target: PrintTarget = window as unknown as PrintTarget): void => {
  if (target.__remryDesktop) target.location.href = DESKTOP_PRINT_URL;
  else target.print();
};
