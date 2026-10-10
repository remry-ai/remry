import { describe, it, expect } from 'vitest';
import { NO_BRANDING, printUrl, resolvePrintOptions, wikiPrintUrl, withoutLeadingTitle } from '../print-options';

const brandings = [
  { id: 'brand_acme', isDefault: true },
  { id: 'brand_side', isDefault: false }
];

const resolve = (query: string, list = brandings) => resolvePrintOptions(new URLSearchParams(query), list);

describe('resolvePrintOptions', () => {
  it('uses the default branding without a header when nothing is chosen', () => {
    expect(resolve('')).toEqual({ choice: '', brandingId: 'brand_acme', header: false });
  });

  it('has no branding when there is no default', () => {
    expect(resolve('', [{ id: 'brand_side', isDefault: false }]).brandingId).toBeNull();
  });

  it('turns branding off with none', () => {
    expect(resolve('branding=none')).toEqual({ choice: NO_BRANDING, brandingId: null, header: false });
  });

  it('uses a chosen branding', () => {
    expect(resolve('branding=brand_side').brandingId).toBe('brand_side');
  });

  it('falls back to the default for an unknown branding', () => {
    expect(resolve('branding=brand_gone')).toEqual({ choice: '', brandingId: 'brand_acme', header: false });
  });

  it('adds the header only with header=1', () => {
    expect(resolve('header=1').header).toBe(true);
    expect(resolve('header=0').header).toBe(false);
  });
});

describe('printUrl', () => {
  it('leaves defaults out of the URL', () => {
    expect(printUrl('doc_1')).toBe('/app/docs/doc_1/print');
  });

  it('round-trips the choices', () => {
    const url = new URL(printUrl('doc_1', 'brand_side', true), 'http://127.0.0.1');
    expect(resolve(url.searchParams.toString())).toEqual({ choice: 'brand_side', brandingId: 'brand_side', header: true });
  });
});

describe('wikiPrintUrl', () => {
  it('points at the wiki page with the same options', () => {
    expect(wikiPrintUrl('page_1')).toBe('/app/wiki/page_1/print');
    expect(wikiPrintUrl('page_1', 'none', true)).toBe('/app/wiki/page_1/print?branding=none&header=1');
  });
});

describe('withoutLeadingTitle', () => {
  it('drops a first heading that repeats the title', () => {
    expect(withoutLeadingTitle('\n# Paperwall Overview\n\nBody', 'Paperwall overview')).toBe('\nBody');
  });

  it('keeps a different first heading, and headings further down', () => {
    expect(withoutLeadingTitle('# Summary\nBody', 'Plan')).toBe('# Summary\nBody');
    expect(withoutLeadingTitle('Intro\n# Plan', 'Plan')).toBe('Intro\n# Plan');
  });
});
