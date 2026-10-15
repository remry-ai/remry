import { describe, it, expect } from 'vitest';
import { blobUrlsIn, lostImageNote, replaceLostImages } from '../lost-images';

const DEAD = 'blob:http://127.0.0.1:7369/428e37a0-9454-4257-9ac7-8dfa264d7606';
const LIVE = 'blob:http://127.0.0.1:7369/0b1c2d3e-0000-4000-8000-000000000000';

describe('blobUrlsIn', () => {
  it('lists each blob: address once', () => {
    expect(blobUrlsIn(`![a](${DEAD}) and ![b](${DEAD}) and ![c](${LIVE})`)).toEqual([DEAD, LIVE]);
  });

  it('is empty without any', () => {
    expect(blobUrlsIn('![a](storage://pages/x/image-1.png)')).toEqual([]);
  });
});

describe('replaceLostImages', () => {
  it('turns a lost image into a note naming it', () => {
    expect(replaceLostImages(`Before\n\n![Screenshot 2026-10-05.png](${DEAD})\n\nAfter`, new Set([DEAD])))
      .toBe('Before\n\n*Image lost: Screenshot 2026-10-05.png. Paste it again.*\n\nAfter');
  });

  it('handles angle brackets, a title and no alt text', () => {
    expect(replaceLostImages(`![](<${DEAD}> "Shot")`, new Set([DEAD]))).toBe('*Image lost. Paste it again.*');
  });

  it('keeps emphasis in the name from ending the note early', () => {
    expect(replaceLostImages(`![my_shot*1](${DEAD})`, new Set([DEAD]))).toBe('*Image lost: myshot1. Paste it again.*');
  });

  it('keeps a link to a lost address as its text', () => {
    expect(replaceLostImages(`See [the shot](${DEAD}).`, new Set([DEAD]))).toBe('See the shot.');
  });

  it('leaves other blob: addresses and stored images alone', () => {
    const md = `![new](${LIVE}) ![kept](storage://pages/x/image-1.png)`;
    expect(replaceLostImages(md, new Set([DEAD]))).toBe(md);
  });

  it('leaves no address the server refuses', () => {
    const out = replaceLostImages(`![a](${DEAD}) [b](${DEAD})`, new Set([DEAD]));
    expect(out).not.toMatch(/\]\(\s*<?blob:/);
  });
});

describe('lostImageNote', () => {
  it('names the image when it has a name', () => {
    expect(lostImageNote(' shot.png ')).toBe('Image lost: shot.png. Paste it again.');
    expect(lostImageNote('')).toBe('Image lost. Paste it again.');
  });
});
