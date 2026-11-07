// A stand-in for SvelteKit's `$app/state` page with reactive `data`, for components that read
// the layout's data (the license, the drawing allowance).

export const page = $state<{ url: URL; data: Record<string, unknown> }>({ url: new URL('http://localhost/app'), data: {} });

export const setData = (data: Record<string, unknown>): void => {
  page.data = data;
};
