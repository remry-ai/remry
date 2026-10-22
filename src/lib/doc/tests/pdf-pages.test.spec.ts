import { describe, it, expect } from 'vitest';
import { markPageBreaks, PAGE_BREAK_HTML, pdfFileName, separateBreakLines } from '../pdf-pages';

describe('markPageBreaks', () => {
  it('turns a pagebreak comment line into a break element', () => {
    expect(markPageBreaks('One\n<!-- pagebreak -->\nTwo')).toBe(`One\n\n${PAGE_BREAK_HTML}\n\nTwo`);
    expect(markPageBreaks('<!--Page-Break-->')).toContain(PAGE_BREAK_HTML);
  });

  it('also takes one the editor saved escaped', () => {
    expect(markPageBreaks('One\n\n\\<!-- pagebreak -->\n\nTwo')).toContain(PAGE_BREAK_HTML);
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

describe('separateBreakLines', () => {
  it('puts blank lines around a line of only <br>s, so the markdown after it still renders', () => {
    expect(separateBreakLines('<br>\n**Owner:** Dana')).toBe('\n<br>\n\n**Owner:** Dana');
    expect(separateBreakLines('Intro\n<br /><br/>\n- item')).toBe('Intro\n\n<br /><br/>\n\n- item');
  });

  it('leaves a <br> inside a line, and code blocks, alone', () => {
    expect(separateBreakLines('Line one<br>line two')).toBe('Line one<br>line two');
    const fenced = '```\n<br>\n```';
    expect(separateBreakLines(fenced)).toBe(fenced);
  });
});
