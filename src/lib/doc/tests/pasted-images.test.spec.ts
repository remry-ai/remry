import { describe, it, expect } from 'vitest';
import { imageMarkdown, insertImages } from '../pasted-images';

const image = { url: 'blob:http://127.0.0.1/a', name: 'image.png' };

describe('pasted images', () => {
  it('writes an image, leaving out what would end its alt text', () => {
    expect(imageMarkdown({ url: 'blob:x', name: 'a [b]\nc.png' })).toBe('![a bc.png](blob:x)');
  });

  it('puts images in their own paragraphs', () => {
    expect(insertImages('', [image])).toBe('![image.png](blob:http://127.0.0.1/a)');
    expect(insertImages('Hello\n', [image, image])).toBe('Hello\n\n![image.png](blob:http://127.0.0.1/a)\n\n![image.png](blob:http://127.0.0.1/a)');
    expect(insertImages('One two', [image], 3)).toBe('One\n\n![image.png](blob:http://127.0.0.1/a)\n\ntwo');
    expect(insertImages('Same', [])).toBe('Same');
  });
});
