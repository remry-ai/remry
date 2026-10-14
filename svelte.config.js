import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // No .gz/.br copies: the app is served on loopback, and the release binary embeds
    // the static files, so they would only add hundreds of files to the plugin.
    adapter: adapter({ precompress: false }),
    // Content Claude imports (Linear, Notion, PDFs, the web) is rendered as markdown, and
    // marked passes raw HTML through. Scripts run only from the app's own files: an inline
    // <script>, an onerror= attribute or a javascript: link in a note never executes.
    // SvelteKit adds a nonce to its own scripts (and app.html's, via %sveltekit.nonce%).
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'blob:', 'https:'],
        'font-src': ['self', 'data:'],
        'connect-src': ['self'],
        'worker-src': ['self', 'blob:'],
        'object-src': ['none'],
        'frame-src': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
        'frame-ancestors': ['none']
      }
    },
    alias: {
      $api: 'src/api',
      '$api/*': 'src/api/*',
      $shared: 'src/shared',
      '$shared/*': 'src/shared/*'
    },
  }
};

export default config;
