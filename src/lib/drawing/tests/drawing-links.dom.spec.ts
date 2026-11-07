import { describe, it, expect } from 'vitest';
import { linkDrawingBlocks } from '../drawing-links';

describe('linkDrawingBlocks', () => {
  it('turns an old drawing block into a link to its page, and leaves other code alone', () => {
    const container = document.createElement('div');
    container.innerHTML = [
      '<pre><code class="language-drawing">/app/wiki/cm1abcdefgh\n</code></pre>',
      '<pre><code class="language-drawing">not a page</code></pre>',
      '<pre><code class="language-js">/app/wiki/cm1abcdefgh</code></pre>'
    ].join('');
    linkDrawingBlocks(container);
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/app/wiki/cm1abcdefgh']);
    expect(links[0]?.textContent).toBe('Drawing ↗');
    expect(container.querySelectorAll('pre')).toHaveLength(2);
  });
});
