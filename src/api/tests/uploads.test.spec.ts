import { describe, it, expect } from 'vitest';
import { decodeSourceFile, decodeUpload, safeExtension, sniffFileType } from '../_uploads';
import { decodeImage } from '../_images';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ');

describe('sniffFileType', () => {
  it('knows PNG, JPEG, GIF, WebP and PDF by their first bytes', () => {
    expect(sniffFileType(PNG)).toBe('image/png');
    expect(sniffFileType(JPEG)).toBe('image/jpeg');
    expect(sniffFileType(Buffer.from('GIF89a'))).toBe('image/gif');
    expect(sniffFileType(WEBP)).toBe('image/webp');
    expect(sniffFileType(PDF)).toBe('application/pdf');
    expect(sniffFileType(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), PDF]))).toBe('application/pdf');
    expect(sniffFileType(Buffer.from('PK\u0003\u0004'))).toBeNull();
  });
});

describe('decodeUpload', () => {
  it('takes plain base64, a data: URL, line breaks and base64url, and goes by the bytes', () => {
    const plain = decodeImage(PNG.toString('base64'));
    expect(plain.ok && plain.value).toEqual({ bytes: PNG, contentType: 'image/png' });
    // Named JPEG, but the bytes are a PNG.
    const dataUrl = decodeImage(`data:image/jpeg;base64,${PNG.toString('base64')}`);
    expect(dataUrl.ok && dataUrl.value.contentType).toBe('image/png');
    expect(decodeImage(JPEG.toString('base64').replace(/(.{4})/g, '$1\n')).ok).toBe(true);
    expect(decodeImage(JPEG.toString('base64url')).ok).toBe(true);
    const pdf = decodeUpload(`data:application/pdf;base64,${PDF.toString('base64')}`, ['application/pdf'], 'a PDF');
    expect(pdf.ok && pdf.value.contentType).toBe('application/pdf');
  });

  it('refuses text that is not base64, or a kind of file not accepted here, saying what to do', () => {
    const notBase64 = decodeImage('this is not base64!');
    expect(!notBase64.ok && notBase64.error.message).toContain("isn't valid base64");
    const pdfAsImage = decodeImage(PDF.toString('base64'));
    expect(!pdfAsImage.ok && pdfAsImage.error.message).toContain('PNG, JPEG, GIF or WebP');
    const imageAsPdf = decodeUpload(PNG.toString('base64'), ['application/pdf'], 'a PDF');
    expect(!imageAsPdf.ok && imageAsPdf.error.message).toContain("isn't a PDF");
    expect(decodeImage('  ').ok).toBe(false);
  });
});

describe('decodeSourceFile', () => {
  const b64 = (text: string | Uint8Array) => Buffer.from(text).toString('base64');

  it('takes a PDF and an image by their bytes, whatever the name says', () => {
    const pdf = decodeSourceFile(b64('%PDF-1.7 rest'), 'notes.txt');
    expect(pdf.ok && [pdf.value.extension, pdf.value.contentType]).toEqual(['pdf', 'application/pdf']);
    const png = decodeSourceFile(b64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])), 'x.csv');
    expect(png.ok && png.value.extension).toBe('png');
  });

  it('takes any UTF-8 text under its own extension, served as plain text', () => {
    const csv = decodeSourceFile(b64('name,amount\nCafé,3\n'), 'Budget 2026.CSV');
    expect(csv.ok && [csv.value.extension, csv.value.contentType]).toEqual(['csv', 'text/plain; charset=utf-8']);
    const html = decodeSourceFile(b64('<script>alert(1)</script>'), 'page.html');
    expect(html.ok && html.value.contentType).toBe('text/plain; charset=utf-8');
    const unnamed = decodeSourceFile(b64('just text'));
    expect(unnamed.ok && unnamed.value.extension).toBe('txt');
    // Text named .pdf isn't stored as a PDF.
    const fake = decodeSourceFile(b64('not a pdf'), 'fake.pdf');
    expect(fake.ok && fake.value.extension).toBe('txt');
  });

  it('takes any other file as it is, not readable, to download', () => {
    // A .docx is a zip: "PK", then binary with NUL bytes.
    const docx = decodeSourceFile(b64(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00])), 'report.docx');
    expect(docx.ok && [docx.value.extension, docx.value.contentType, docx.value.readable]).toEqual(['docx', 'application/octet-stream', false]);
    const unnamed = decodeSourceFile(b64(new Uint8Array([0, 1, 2, 3])));
    expect(unnamed.ok && unnamed.value.extension).toBe('bin');
    // Text and PDFs are readable.
    const csv = decodeSourceFile(b64('a,b\n'), 'x.csv');
    expect(csv.ok && csv.value.readable).toBe(true);
  });
});

describe('safeExtension', () => {
  it('keeps letters and digits only', () => {
    expect(safeExtension('a.b/../x.Md')).toBe('md');
    expect(safeExtension('no-extension')).toBeNull();
    expect(safeExtension('evil.p h p')).toBeNull();
    expect(safeExtension(undefined)).toBeNull();
  });
});
