/**
 * The generated knowledge corpus. `generated/rules-context.json` is produced by
 * `bun run assistant:corpus` at the repository root from the frontend's own
 * reviewed data (currentRuleSet, RuleReference derivations, the source
 * registry, the reviewed language packs, and docs/rules.md) — never edited by
 * hand. Parity tests in the main app fail when it goes stale.
 */
import corpusJson from '../generated/rules-context.json';

/** How much standing a source has as Genius transcription policy, highest
 * first: staff > editorial > external > community. */
export type CorpusSourceAuthority = 'staff' | 'editorial' | 'external' | 'community';

/** A guidance entry's standing: a source tier, or LyricLint's own advisory —
 * a preference of the tool's that no Genius source states, whose cited
 * sources are context rather than backing. */
export type CorpusGuidanceAuthority = CorpusSourceAuthority | 'lyriclint';

export interface CorpusSource {
	id: string;
	pageTitle: string;
	sectionTitle: string;
	url: string;
	lastVerifiedAt: string;
	authority: CorpusSourceAuthority;
}

/**
 * One guidance-catalog entry: a reviewed transcription convention paraphrased
 * in LyricLint's own words. Not a rule — it has no id in the answer schema,
 * and its claims are cited through `sourceIds`.
 */
export interface CorpusGuidanceEntry {
	id: string;
	topic: string;
	topicTitle: string;
	title: string;
	statement: string;
	/** Verbatim illustrations: the form the convention wants, and the one it corrects. */
	example?: { correct?: string; incorrect?: string };
	/** The highest tier among the entry's cited sources, or LyricLint's own advisory. */
	authority: CorpusGuidanceAuthority;
	sourceIds: string[];
	/** Linter rules that check this convention, in whole or in part. */
	relatedRuleIds?: string[];
	note?: string;
}

export interface CorpusRule {
	id: string;
	slug: string;
	title: string;
	group: string;
	groupTitle: string;
	severity: 'error' | 'warning' | 'suggestion' | 'manual-review';
	message: string;
	explanation: string;
	/** How the workbench can repair it: a one-press safe fix, a previewed fix
	 * confirmed one at a time, or no automatic fix. */
	fix: 'safe' | 'preview' | 'none';
	fixLabel?: string;
	language: string;
	flaggedExample: string;
	acceptedExample: string;
	sourceIds: string[];
}

/** One replacement pair out of a table-shaped rule's lookup table. */
export interface CorpusLookupEntry {
	preferred: string[];
	instead: string[];
	/** LyricLint's own curated transcription mistakes — never reviewed guidance. */
	curatedMisspellings?: string[];
	appliesWhen?: string;
	note?: string;
	/** Absent where the entry records an accepted variant that nothing flags. */
	fix?: 'safe' | 'preview';
}

export interface CorpusLookup {
	ruleId: string;
	description: string;
	entries: CorpusLookupEntry[];
}

export interface CorpusLanguage {
	tag: string;
	displayName: string;
	policy: string;
	headerTerms: Array<{ semanticPart: string; terms: string[] }>;
}

export interface RulesCorpus {
	formatVersion: number;
	ruleSetVersion: string;
	generatedAt: string;
	/** SHA-256 over the canonical corpus content, excluding generatedAt and itself. */
	contentHash: string;
	rules: CorpusRule[];
	/**
	 * What the table-shaped rules check against, in full. A rule's own entry
	 * carries one worked example, which for these seven is not the rule.
	 */
	lookups: CorpusLookup[];
	/** The guidance catalog: conventions the linter cannot check whole. */
	guidance: CorpusGuidanceEntry[];
	sources: CorpusSource[];
	languages: CorpusLanguage[];
	harper: { ruleIds: string[]; behavior: string; limitations: string[] };
	policyNotes: string[];
}

export const corpus = corpusJson as unknown as RulesCorpus;

export const corpusRuleIds: ReadonlySet<string> = new Set(corpus.rules.map((rule) => rule.id));
export const corpusSourceIds: ReadonlySet<string> = new Set(
	corpus.sources.map((source) => source.id)
);
