import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // No .gz/.br copies: the app is served on loopback, and the release binary embeds
    // the static files, so they would only add hundreds of files to the plugin.
    adapter: adapter({ precompress: false }),
    alias: {
      $api: 'src/api',
      '$api/*': 'src/api/*',
      $shared: 'src/shared',
      '$shared/*': 'src/shared/*'
    },
  }
};

export default config;
