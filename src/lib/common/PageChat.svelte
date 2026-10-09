<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { trpc } from '$shared/trpc/client';
  import type { ChatMessage } from '$shared/types/page-chat';
  import type { RightPanelPage } from '$lib/stores/right-panel';
  import MarkdownRenderer from '$lib/common/MarkdownRenderer.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { errorMessage, submitOrThrow } from '$lib/ui/submit';
  import { askAboutPage, waitForReply } from '$lib/common/use-page-chat';

  interface Props {
    readonly page: RightPanelPage;
  }

  const { page }: Props = $props();

  // RightPanel remounts this when the page changes. The conversation is saved
  // on the server per entity, so it's loaded on mount and resumes after a
  // reload; Clear deletes it.
  let loaded = $state(false);
  let messages = $state<readonly ChatMessage[]>([]);
  let draft = $state('');
  let waiting = $state(false);
  let notice = $state<{ readonly tone: 'warning' | 'error'; readonly message: string } | null>(null);
  let listEl: HTMLDivElement | undefined = $state();
  const closed = new AbortController();
  onDestroy(() => closed.abort());

  const entity = () => ({ entityType: page.entityType, entityId: page.entityId });

  $effect(() => {
    void messages.length;
    void waiting;
    listEl?.scrollTo({ top: listEl.scrollHeight });
  });

  /** Reads the saved conversation; returns the chat to wait on when Claude is still replying. */
  const load = async (): Promise<string | null> => {
    try {
      const saved = await submitOrThrow(() => trpc().chat.get.query(entity()));
      messages = saved.messages;
      return saved.replying ? saved.chatId : null;
    } catch (e: unknown) {
      notice = { tone: 'error', message: errorMessage(e) };
      return null;
    } finally {
      loaded = true;
    }
  };

  const showReply = async (reply: string | null) => {
    if (closed.signal.aborted) return;
    if (reply === null) await load();
    else messages = [...messages, { role: 'assistant', content: reply }];
  };

  onMount(async () => {
    const replying = await load();
    if (!replying) return;
    waiting = true;
    try {
      await showReply(await waitForReply(trpc().chat, replying, { signal: closed.signal }));
    } catch (e: unknown) {
      notice = { tone: 'error', message: errorMessage(e) };
    } finally {
      waiting = false;
    }
  });

  const send = async () => {
    const content = draft.trim();
    if (!content || waiting || !loaded) return;
    messages = [...messages, { role: 'user', content }];
    draft = '';
    notice = null;
    waiting = true;
    try {
      const reply = await askAboutPage(
        trpc().chat,
        { ...entity(), entityName: page.entityName, pageText: page.getPageText(), content },
        { signal: closed.signal }
      );
      if (reply.kind === 'reply') await showReply(reply.content);
      else {
        // Nothing was sent or saved: put the message back to send again.
        messages = messages.slice(0, -1);
        draft = content;
        notice = { tone: 'warning', message: reply.message };
      }
    } catch (e: unknown) {
      notice = { tone: 'error', message: errorMessage(e) };
    } finally {
      waiting = false;
    }
  };

  const clear = async () => {
    try {
      await submitOrThrow(() => trpc().chat.clear.mutate(entity()));
      messages = [];
      notice = null;
    } catch (e: unknown) {
      notice = { tone: 'error', message: errorMessage(e) };
    }
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send();
    }
  };
</script>

<div class="page-chat">
  <div class="messages" bind:this={listEl}>
    {#if loaded && messages.length === 0}
      <EmptyState small message="Ask Claude about {page.entityName}. It reads what's on this page and doesn't change anything." />
    {/if}
    {#each messages as message, i (i)}
      <div class="message" class:user={message.role === 'user'}>
        {#if message.role === 'user'}
          <p class="user-text">{message.content}</p>
        {:else}
          <MarkdownRenderer content={message.content} />
        {/if}
      </div>
    {/each}
    {#if waiting}
      <p class="thinking" aria-busy="true">Claude is thinking…</p>
    {/if}
    {#if notice}
      <p class={notice.tone === 'error' ? 'inline-error' : 'chat-warning'}>{notice.message}</p>
    {/if}
  </div>

  <form class="composer" onsubmit={(e) => { e.preventDefault(); void send(); }}>
    <textarea
      rows="3"
      bind:value={draft}
      onkeydown={onKeydown}
      placeholder="Ask about this page…"
      aria-label="Message Claude about this page"
    ></textarea>
    <div class="composer-actions">
      {#if messages.length > 0}
        <button type="button" class="btn ghost sm" onclick={() => void clear()} disabled={waiting}>Clear</button>
      {/if}
      <button type="submit" class="btn primary sm" disabled={waiting || !loaded || !draft.trim()} aria-busy={waiting}>
        {waiting ? 'Waiting…' : 'Send'}
      </button>
    </div>
  </form>
</div>

<style lang="scss">
  .page-chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .messages {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
  }
  .message {
    font-size: var(--fs-md);
    &.user {
      align-self: flex-end;
      max-width: 90%;
      padding: var(--sp-2) var(--sp-3);
      border-radius: var(--r-md);
      background: var(--surface-2);
    }
  }
  .user-text { margin: 0; white-space: pre-wrap; }
  .thinking { margin: 0; font-size: var(--fs-sm); color: var(--text-3); }
  .chat-warning { margin: 0; font-size: var(--fs-sm); color: var(--warning); }
  .composer {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    border-top: 1px solid var(--border);
    textarea { width: 100%; resize: vertical; }
  }
  .composer-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
  }
</style>
