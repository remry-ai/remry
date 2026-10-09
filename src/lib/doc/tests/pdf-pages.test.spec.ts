import { describe, it, expect } from 'vitest';
import { markPageBreaks, PAGE_BREAK_HTML, pdfFileName, planPageStarts } from '../pdf-pages';

describe('planPageStarts', () => {
  it('is one page when everything fits', () => {
    expect(planPageStarts([100, 400], 400, 1000)).toEqual([0]);
  });

  it('starts the next page after the last block that fits', () => {
    expect(planPageStarts([300, 700, 1100, 1500], 1500, 1000)).toEqual([0, 700]);
  });

  it('cuts a block that would leave most of the page empty', () => {
    expect(planPageStarts([200, 2500], 2500, 1000)).toEqual([0, 1000, 2000]);
  });
});

describe('planPageStarts with declared breaks', () => {
  it('starts a page at each declared break, even when the rest would fit', () => {
    expect(planPageStarts([100, 300], 400, 1000, [150])).toEqual([0, 150]);
  });

  it('carries on paging by blocks after a declared break', () => {
    expect(planPageStarts([300, 900, 1400, 1900], 1900, 1000, [300])).toEqual([0, 300, 900]);
  });

  it('ignores a break at the very end', () => {
    expect(planPageStarts([400], 400, 1000, [400])).toEqual([0]);
  });
});

describe('markPageBreaks', () => {
  it('turns a pagebreak comment line into a break element', () => {
    expect(markPageBreaks('One\n<!-- pagebreak -->\nTwo')).toBe(`One\n\n${PAGE_BREAK_HTML}\n\nTwo`);
    expect(markPageBreaks('<!--Page-Break-->')).toContain(PAGE_BREAK_HTML);
  });

  it('leaves the marker alone inside a code block and mid-line', () => {
    const fenced = '```\n<!-- pagebreak -->\n```';
    expect(markPageBreaks(fenced)).toBe(fenced);
    expect(markPageBreaks('Text <!-- pagebreak --> here')).toBe('Text <!-- pagebreak --> here');
  });
});

describe('pdfFileName', () => {
  it('drops characters file systems reject', () => {
    expect(pdfFileName('Q3: plan / review?')).toBe('Q3 plan review.pdf');
  });

  it('names an untitled doc', () => {
    expect(pdfFileName('  ')).toBe('document.pdf');
  });
});
