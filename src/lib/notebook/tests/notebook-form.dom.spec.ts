// The New notebook form sends the profile picked in it to notebook.create.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';

const create = vi.fn((input: { readonly name: string; readonly profile: string }) =>
  Promise.resolve({ ok: true, value: { id: 'family', name: input.name, profile: input.profile, createdAt: '2026-11-23T00:00:00.000Z' } }));

vi.mock('$shared/trpc/client', () => ({ trpc: () => ({ notebook: { create: { mutate: create } } }) }));

const { default: NotebookForm } = await import('../components/NotebookForm.svelte');

describe('NotebookForm', () => {
  let form: ReturnType<typeof mount> | null = null;

  afterEach(() => {
    if (form) unmount(form);
    form = null;
    document.body.innerHTML = '';
    create.mockClear();
  });

  const fill = (selector: string, value: string, event: string): void => {
    const field = document.body.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
    if (!field) throw new Error(`No ${selector}`);
    field.value = value;
    field.dispatchEvent(new Event(event, { bubbles: true }));
    flushSync();
  };

  const createNotebook = async (profile?: string): Promise<void> => {
    const onSuccess = vi.fn();
    form = mount(NotebookForm, { target: document.body, props: { onSuccess } });
    fill('input[type="text"]', 'Family', 'input');
    if (profile) fill('select', profile, 'change');
    document.body.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 5; i++) await tick();
    expect(onSuccess).toHaveBeenCalledOnce();
  };

  it('creates a work notebook unless another profile is picked', async () => {
    await createNotebook();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Family', profile: 'work' }));
  });

  it('creates a home notebook when Home is picked, and says what it adds', async () => {
    await createNotebook('home');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Family', profile: 'home' }));
    expect(document.body.textContent).toMatch(/Birthdays/);
  });

  it('leaves the profile out when renaming', () => {
    form = mount(NotebookForm, { target: document.body, props: { initial: { id: 'work', name: 'Work' }, onSuccess: vi.fn() } });
    flushSync();
    expect(document.body.querySelector('select')).toBeNull();
  });
});
