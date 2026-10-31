// The default assistant on this computer: `llmProvider` in <data dir>/settings.json, beside the
// default notebook and the license, so every notebook and every app session uses it. Read on
// each run, so a change in one window counts in the others straight away.

import { settings } from '../settings/server/index.server';
import { readRootSettings, updateRootSettings } from '../settings/server/root-settings.server';
import { isLlmProviderId, type LlmChoiceStatus, type LlmLookup, type LlmProviderId } from '../types/llm';
import { ok, err, type Result } from '../utils/result';
import { locateCli } from './claude-process.server';
import { choiceStatus, lookupFrom } from './llm-choice';
import { llmProvider } from './providers/registry';

/** The saved default, or null before one is picked (anything unknown stored there counts as none). */
export const savedLlm = async (): Promise<LlmProviderId | null> => {
  const value = (await readRootSettings(settings))['llmProvider'];
  return isLlmProviderId(value) ? value : null;
};

/** Every assistant, whether it's installed (looked up now) and the saved default. */
export const llmChoiceStatus = async (): Promise<LlmChoiceStatus> => choiceStatus(await savedLlm(), locateCli);

/** The default's CLI, ready to run; or that none is picked, or that it isn't installed. */
export const lookupLlm = async (): Promise<LlmLookup> => lookupFrom(await savedLlm(), locateCli);

/** Saves the default. Refuses one that isn't installed. */
export const saveLlm = async (id: LlmProviderId): Promise<Result<LlmChoiceStatus>> => {
  const provider = llmProvider(id);
  if (locateCli(id) === null) return err(new Error(`The ${provider.product} (\`${provider.binary}\`) isn't installed. ${provider.installHint}`));
  await updateRootSettings(settings, { llmProvider: id });
  return ok(await llmChoiceStatus());
};
