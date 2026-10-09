// Builds a doc's PDF in the browser from its rendered print page: html2canvas-pro draws
// the page, and jsPDF cuts it into A4 pages at block edges (see pdf-pages.ts) and saves it.
// Both load only when the user exports. Nothing leaves the page.

import { A4, pdfFileName, planPageStarts } from './pdf-pages';

const SCALE = 2;

/**
 * Saves `sheet` as `<title>.pdf`. Blocks matching `blockSelector` are kept whole where they
 * fit, and each `.page-break` element starts a new page.
 */
export const downloadPdf = async (sheet: HTMLElement, blockSelector: string, title: string): Promise<void> => {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const canvas = await html2canvas(sheet, {
    scale: SCALE,
    backgroundColor: '#ffffff',
    logging: false,
    // The dashed on-screen marker for a page break keeps its space but isn't drawn.
    onclone: (clone) => {
      for (const el of clone.querySelectorAll<HTMLElement>('.page-break')) el.style.borderTopColor = 'transparent';
    }
  });

  const contentWidth = A4.width - A4.margin * 2;
  const contentHeight = A4.height - A4.margin * 2;
  const pxPerMm = canvas.width / contentWidth;
  const pageHeightPx = Math.floor(contentHeight * pxPerMm);

  const top = sheet.getBoundingClientRect().top;
  const bottoms = [...sheet.querySelectorAll<HTMLElement>(blockSelector)].map(
    (el) => Math.round((el.getBoundingClientRect().bottom - top) * SCALE)
  );
  const breaks = [...sheet.querySelectorAll<HTMLElement>('.page-break')].map(
    (el) => Math.round((el.getBoundingClientRect().top - top) * SCALE)
  );
  const starts = planPageStarts(bottoms, canvas.height, pageHeightPx, breaks);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const slice = document.createElement('canvas');
  slice.width = canvas.width;
  starts.forEach((start, i) => {
    const end = starts[i + 1] ?? canvas.height;
    slice.height = end - start;
    const ctx = slice.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, start, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    if (i > 0) pdf.addPage();
    pdf.addImage(slice, 'PNG', A4.margin, A4.margin, contentWidth, slice.height / pxPerMm);
  });
  pdf.setProperties({ title });
  pdf.save(pdfFileName(title));
};
