import { describe, it, expect } from 'vitest';
import { localFontSource } from '../font-sources';

const local = 'url(http://127.0.0.1:7369/excalidraw/fonts/Excalifont/Excalifont-Regular-a1.woff2) format(\'woff2\')';
const cdn = 'url(https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/fonts/Excalifont/Excalifont-Regular-a1.woff2) format(\'woff2\')';

describe('localFontSource', () => {
  it("keeps the app's copy and drops the CDN fallback", () => {
    expect(localFontSource('Excalifont', `${local}, ${cdn}`)).toBe(local);
  });

  it('uses the system font for one the app does not ship', () => {
    const xiaolai = 'url(http://127.0.0.1:7369/excalidraw/fonts/Xiaolai/Xiaolai-Regular-1.woff2) format(\'woff2\'), url(https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/fonts/Xiaolai/Xiaolai-Regular-1.woff2)';
    expect(localFontSource('Xiaolai', xiaolai)).toBe('local("Xiaolai")');
  });

  it('leaves other fonts alone', () => {
    expect(localFontSource('App', 'url(/fonts/app.woff2)')).toBe('url(/fonts/app.woff2)');
  });
});
