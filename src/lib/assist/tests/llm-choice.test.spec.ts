import { describe, it, expect, vi } from 'vitest';
import { llmChoicePending, settleLlmChoice, withLlmChoice } from '../llm-choice';

const needsChoice = { started: false, warning: 'Choose first', needsChoice: true } as const;
const started = { started: true } as const;

describe('withLlmChoice', () => {
  it('runs once without asking when an assistant is picked', async () => {
    const open = vi.fn();
    expect(await withLlmChoice(async () => started, open)).toEqual(started);
    expect(open).not.toHaveBeenCalled();
  });

  it('asks, then starts again once a default is saved', async () => {
    const start = vi.fn().mockResolvedValueOnce(needsChoice).mockResolvedValueOnce(started);
    const open = vi.fn(() => { setTimeout(() => settleLlmChoice(true), 0); });
    expect(await withLlmChoice(start, open)).toEqual(started);
    expect(open).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledTimes(2);
    expect(llmChoicePending()).toBe(false);
  });

  it('returns the "choose first" warning when the popup closes without a choice', async () => {
    const start = vi.fn().mockResolvedValue(needsChoice);
    const open = vi.fn(() => { setTimeout(() => settleLlmChoice(false), 0); });
    expect(await withLlmChoice(start, open)).toEqual(needsChoice);
    expect(start).toHaveBeenCalledOnce();
  });

  it('leaves a not-installed warning alone', async () => {
    const open = vi.fn();
    const missing = { started: false, warning: 'Install Copilot' } as const;
    expect(await withLlmChoice(async () => missing, open)).toEqual(missing);
    expect(open).not.toHaveBeenCalled();
  });
});
