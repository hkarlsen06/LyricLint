/**
 * The rules-assistant knowledge corpus, derived rather than written.
 *
 * `services/rules-assistant/generated/rules-context.json` is this module's
 * output, committed so the Worker builds from a reviewed artifact and the
 * parity tests can catch it going stale. Everything in it comes from data the
 * frontend already ships or derives — `currentRuleSet`, the `RuleReference`
 * derivations, the catalog's own lookup tables, the reviewed source registry,
 * the reviewed language packs, and the policy sections of `docs/rules.md`.
 * Nothing unreviewed enters: sources are filtered to
 * `reviewStatus === 'reviewed'`, and the 64-language inventory of unreviewed
 * Genius annotations is deliberately absent.
 *
 * **A rule enters as one worked example, which for a table-shaped rule is not
 * the rule.** `ruleReferences()` derives a page by running the rule against its
 * reviewed `invalid` case, so `spelling.standardized` arrived here as the single
 * pair `Imma` → `I'ma` and the assistant, asked what the standardized spellings
 * are, could only answer with that pair. `lookups` is the rest of it: the seven
 * catalog tables in full, from `lookup-tables.ts`, derived from the same
 * constants the rules check against so an added spelling cannot go missing here.
 * A pointer to a guideline is deliberately still all a source carries — the
 * registry stores no Genius prose, and transcribing some would make this the one
 * hand-written thing in an artifact whose whole design is that it is generated.
 *
 * Server-side only, like `reference.ts` beside it: deriving the references in
 * a browser throws by design.
 */
import type { SourceReference } from '$lib/core/types.js';
import { guidanceEntries } from '$lib/guidance/entries.js';
import { guidanceTopicTitles } from '$lib/guidance/guidance.js';
import { reviewedLanguagePacks } from '$lib/languages/registry.js';
import type {
	AssistantCorpus,
	AssistantCorpusGuidanceEntry,
	AssistantCorpusSource
} from './assistant-corpus-types.js';
import { currentRuleSet } from './data/rule-set.js';
import { sourceRegistry } from './data/sources.js';
import { harperRuleIds } from './harper.js';
import { ruleLookupTables } from './lookup-tables.js';
import { ruleReferences } from './reference.js';

export type { AssistantCorpus } from './assistant-corpus-types.js';

/** 2 added `lookups`; 3 added `guidance` and source `authority`; 4 made
 * guidance examples labeled correct/incorrect pairs; 5 added the `lyriclint`
 * advisory tier to guidance authorities. */
export const CORPUS_FORMAT_VERSION = 5;

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
		lastVerifiedAt: source.lastVerifiedAt,
		authority: source.authority
	};
}

/** Everything but the stamp and the hash — deterministic for a given source tree. */
export function buildAssistantCorpusContent(
	rulesMd: string
): Omit<AssistantCorpus, 'generatedAt' | 'contentHash'> {
	// `corpusContentHash` hashes `JSON.stringify`, which writes keys in insertion
	// order — so where an optional key sits is part of the artifact, and an
	// absent one has to be absent rather than `undefined`. That is why the two
	// halves either side of `fixLabel` are named: appending it would move it.
	const rules = ruleReferences().map((reference) => {
		const head = {
			id: reference.id,
			slug: reference.slug,
			title: reference.title,
			group: reference.group,
			groupTitle: reference.groupTitle,
			severity: reference.severity,
			message: reference.message,
			explanation: reference.explanation,
			fix: reference.fix?.kind ?? ('none' as const)
		};
		const example = {
			language: reference.language,
			flaggedExample: reference.invalid,
			acceptedExample: reference.valid,
			sourceIds: reference.sources.map((source) => source.id)
		};
		return reference.fix
			? { ...head, fixLabel: reference.fix.label, ...example }
			: { ...head, ...example };
	});

	const sources = [...sourceRegistry.values()]
		.filter((source) => source.reviewStatus === 'reviewed')
		.map(corpusSource)
		.sort((a, b) => a.id.localeCompare(b.id, 'en'));

	// Same key-order rule as `rules` above: `example` sits mid-object, so it is
	// spread in place; `relatedRuleIds` and `note` already close the shape, so
	// assigning them in that order leaves the artifact byte-identical.
	const guidance = guidanceEntries.map((entry) => {
		const head = {
			id: entry.id,
			topic: entry.topic,
			topicTitle: guidanceTopicTitles[entry.topic],
			title: entry.title,
			statement: entry.statement
		};
		const attribution = { authority: entry.authority, sourceIds: [...entry.sourceIds] };
		const record: AssistantCorpusGuidanceEntry = entry.example
			? { ...head, example: { ...entry.example }, ...attribution }
			: { ...head, ...attribution };
		if (entry.relatedRuleIds) record.relatedRuleIds = [...entry.relatedRuleIds];
		if (entry.note) record.note = entry.note;
		return record;
	});

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
		lookups: ruleLookupTables(),
		guidance,
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
		lookups: content.lookups,
		guidance: content.guidance,
		sources: content.sources,
		languages: content.languages,
		harper: content.harper,
		policyNotes: content.policyNotes
	};
}
