/**
 * The rules-assistant knowledge corpus, derived rather than written.
 *
 * `services/rules-assistant/generated/rules-context.json` is this module's
 * output, committed so the Worker builds from a reviewed artifact and the
 * parity tests can catch it going stale. Everything in it comes from data the
 * frontend already ships or derives — `currentRuleSet`, the `RuleReference`
 * derivations, the reviewed source registry, the reviewed language packs, and
 * the policy sections of `docs/rules.md`. Nothing unreviewed enters: sources
 * are filtered to `reviewStatus === 'reviewed'`, and the 64-language inventory
 * of unreviewed Genius annotations is deliberately absent.
 *
 * Server-side only, like `reference.ts` beside it: deriving the references in
 * a browser throws by design.
 */
import type { SourceReference } from '$lib/core/types.js';
import { reviewedLanguagePacks } from '$lib/languages/registry.js';
import { currentRuleSet } from './data/rule-set.js';
import { sourceRegistry } from './data/sources.js';
import { harperRuleIds } from './harper.js';
import { ruleReferences } from './reference.js';

export const CORPUS_FORMAT_VERSION = 1;

export interface AssistantCorpusRule {
	id: string;
	slug: string;
	title: string;
	group: string;
	groupTitle: string;
	severity: string;
	message: string;
	explanation: string;
	fix: 'safe' | 'preview' | 'none';
	fixLabel?: string;
	language: string;
	flaggedExample: string;
	acceptedExample: string;
	sourceIds: string[];
}

export interface AssistantCorpusSource {
	id: string;
	pageTitle: string;
	sectionTitle: string;
	url: string;
	lastVerifiedAt: string;
}

export interface AssistantCorpusLanguage {
	tag: string;
	displayName: string;
	policy: string;
	headerTerms: Array<{ semanticPart: string; terms: string[] }>;
}

export interface AssistantCorpus {
	formatVersion: number;
	ruleSetVersion: string;
	generatedAt: string;
	contentHash: string;
	rules: AssistantCorpusRule[];
	sources: AssistantCorpusSource[];
	languages: AssistantCorpusLanguage[];
	harper: { ruleIds: string[]; behavior: string; limitations: string[] };
	policyNotes: string[];
}

const HARPER_BEHAVIOR =
	'Alongside the reviewed Genius rules, LyricLint runs Harper, a local English proofreader, ' +
	'in the browser. Its findings arrive as spelling.harper, grammar.harper, and style.harper — ' +
	'always suggestions, always citing Harper itself (T-HARPER) rather than a Genius guideline, ' +
	'and a native reviewed rule always wins where the two overlap.';

const HARPER_LIMITATIONS = [
	'English only; it does not run for the other reviewed languages.',
	'Its suggestions are general proofreading, not reviewed Genius policy, and have no reference pages.',
	'Prose-assuming readability measures are filtered out, because lyrics use deliberate fragments, dialect, repetition, and nonstandard spelling.',
	"It is seeded with the reviewed preferred spellings and the 'scribe’s performer names so it does not fight the Genius-specific rules."
];

/** Sections of docs/rules.md that bear on rule interpretation. The catalog
 * table and data sections are already represented by the rules themselves. */
const POLICY_SECTION_HEADINGS = ['Policy', 'Reviewed guidance without a text-only diagnostic'];

export function policyNotesFromRulesDoc(rulesMd: string): string[] {
	const notes: string[] = [];
	const sections = rulesMd.split(/^## /m);
	for (const section of sections) {
		const newline = section.indexOf('\n');
		if (newline === -1) continue;
		const heading = section.slice(0, newline).trim();
		if (POLICY_SECTION_HEADINGS.includes(heading)) {
			notes.push(`${heading}\n${section.slice(newline + 1).trim()}`);
		}
	}
	if (notes.length !== POLICY_SECTION_HEADINGS.length) {
		throw new Error('docs/rules.md is missing a policy section the corpus expects');
	}
	return notes;
}

function corpusSource(source: SourceReference): AssistantCorpusSource {
	return {
		id: source.id,
		pageTitle: source.pageTitle,
		sectionTitle: source.sectionTitle,
		url: source.url,
		lastVerifiedAt: source.lastVerifiedAt
	};
}

/** Everything but the stamp and the hash — deterministic for a given source tree. */
export function buildAssistantCorpusContent(
	rulesMd: string
): Omit<AssistantCorpus, 'generatedAt' | 'contentHash'> {
	const rules = ruleReferences().map((reference) => ({
		id: reference.id,
		slug: reference.slug,
		title: reference.title,
		group: reference.group,
		groupTitle: reference.groupTitle,
		severity: reference.severity,
		message: reference.message,
		explanation: reference.explanation,
		fix: reference.fix?.kind ?? ('none' as const),
		...(reference.fix ? { fixLabel: reference.fix.label } : {}),
		language: reference.language,
		flaggedExample: reference.invalid,
		acceptedExample: reference.valid,
		sourceIds: reference.sources.map((source) => source.id)
	}));

	const sources = [...sourceRegistry.values()]
		.filter((source) => source.reviewStatus === 'reviewed')
		.map(corpusSource)
		.sort((a, b) => a.id.localeCompare(b.id, 'en'));

	const languages = reviewedLanguagePacks.map((pack) => ({
		tag: pack.tag,
		displayName: pack.displayName,
		policy: pack.policy,
		headerTerms: pack.headers.map((header) => ({
			semanticPart: header.semanticPart,
			terms: [...header.terms]
		}))
	}));

	return {
		formatVersion: CORPUS_FORMAT_VERSION,
		ruleSetVersion: currentRuleSet.version,
		rules,
		sources,
		languages,
		harper: {
			ruleIds: [...harperRuleIds],
			behavior: HARPER_BEHAVIOR,
			limitations: HARPER_LIMITATIONS
		},
		policyNotes: policyNotesFromRulesDoc(rulesMd)
	};
}

export async function corpusContentHash(
	content: Omit<AssistantCorpus, 'generatedAt' | 'contentHash'>
): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(content));
	const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildAssistantCorpus(
	rulesMd: string,
	generatedAt: string
): Promise<AssistantCorpus> {
	const content = buildAssistantCorpusContent(rulesMd);
	const contentHash = await corpusContentHash(content);
	// Key order matters only for human diffs; hashing covers `content` alone, so
	// regenerating never dirties the artifact unless the reviewed data moved.
	return {
		formatVersion: content.formatVersion,
		ruleSetVersion: content.ruleSetVersion,
		generatedAt,
		contentHash,
		rules: content.rules,
		sources: content.sources,
		languages: content.languages,
		harper: content.harper,
		policyNotes: content.policyNotes
	};
}
