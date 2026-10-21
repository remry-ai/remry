import { describe, it, expect, vi } from 'vitest';
import { DESKTOP_PRINT_URL, printPage } from '../print';

describe('printPage', () => {
  it('prints in a browser', () => {
    const print = vi.fn();
    const location = { href: 'http://127.0.0.1:5173/app/docs/x/print' };
    printPage({ print, location });
    expect(print).toHaveBeenCalledOnce();
    expect(location.href).toBe('http://127.0.0.1:5173/app/docs/x/print');
  });

  it('asks the desktop window to print, since window.print() does nothing there', () => {
    const print = vi.fn();
    const location = { href: 'http://127.0.0.1:7369/app/docs/x/print' };
    printPage({ __remryDesktop: true, print, location });
    expect(print).not.toHaveBeenCalled();
    expect(location.href).toBe(DESKTOP_PRINT_URL);
  });
});
