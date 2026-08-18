/**
 * The generated knowledge corpus. `generated/rules-context.json` is produced by
 * `bun run assistant:corpus` at the repository root from the frontend's own
 * reviewed data (currentRuleSet, RuleReference derivations, the source
 * registry, the reviewed language packs, and docs/rules.md) — never edited by
 * hand. Parity tests in the main app fail when it goes stale.
 */
import type { AssistantCorpus } from '../generated/rules-context';
import { corpus } from '../generated/rules-context-data';

export { corpus };

export type RulesCorpus = AssistantCorpus;

export const corpusRuleIds: ReadonlySet<string> = new Set(corpus.rules.map((rule) => rule.id));
export const corpusSourceIds: ReadonlySet<string> = new Set(
	corpus.sources.map((source) => source.id)
);
