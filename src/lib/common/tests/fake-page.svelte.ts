// A stand-in for SvelteKit's `$app/state` page in component tests: its `url` is reactive, so
// a test changes the URL the way a navigation does.

export const page = $state({ url: new URL('http://localhost/app/projects/p0') });

export const setUrl = (href: string): void => {
  page.url = new URL(href, 'http://localhost');
};
