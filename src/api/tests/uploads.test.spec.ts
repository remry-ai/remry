import { describe, it, expect } from 'vitest';
import { decodeUpload, sniffFileType } from '../_uploads';
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
