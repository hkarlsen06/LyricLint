import { parseDocument } from '$lib/core/parser.js';
import { guidanceForRule } from '$lib/guidance/entries.js';
import type { RuleGuidelineLink } from '$lib/guidance/guidance.js';
import { loadStatisticalLanguageDetector } from '$lib/languages/detect.js';
import type {
	DiagnosticFix,
	PerformerRecord,
	RuleContext,
	RuleDefinition,
	Severity,
	SourceReference
} from '$lib/core/types.js';
import { policyCases, type RulePolicyCase } from './catalog/policy-cases.js';
import { lookupSearchTerms, ruleLookupTable } from './lookup-tables.js';
import { ruleSlug } from './reference-search.js';
import { currentRuleSet } from './data/rule-set.js';
import { sourceRegistry } from './data/sources.js';
import { sortDiagnostics } from './engine.js';
import { enabledRules } from './registry.js';

// Reference pages are prerendered from real rule output. Browsers load the
// statistical profiles on demand; the static builder needs them before it
// derives the language-mismatch example synchronously.
if (typeof window === 'undefined') {
	await loadStatisticalLanguageDetector();
}

/**
 * The public rule reference, derived rather than written.
 *
 * Rules carry no prose of their own — their `message` and `explanation` exist
 * only on the diagnostics `check()` emits. Hand-writing 47 page descriptions
 * would create a second copy of that text with no test tying it to the rule,
 * and it would drift within a release. So each page's content comes from
 * actually running the rule against its reviewed `invalid` policy example: the
 * lead diagnostic's message is the page title, its explanation is the body,
 * and its fix label is the fix the page names. What the reference publishes is
 * therefore exactly what the workbench shows, by construction.
 */

/** Everything a reference page states about one rule, all diagnostic-derived. */
export interface RuleReference {
	id: string;
	/**
	 * What the rule is called — the reviewed case's own `title`, and the one
	 * field here that is written rather than run. See `RulePolicyCase.title` for
	 * why this one is the exception.
	 */
	title: string;
	/** URL path segment: the rule ID with dots flattened to hyphens. */
	slug: string;
	/** The ID prefix before the first dot, which is what the index groups by. */
	group: string;
	groupTitle: string;
	/** BCP 47 language tag for the reviewed policy example. */
	language: string;
	severity: Severity;
	message: string;
	explanation: string;
	/** The lead fix of the example diagnostic, when the rule offers one. */
	fix?: { label: string; kind: DiagnosticFix['kind'] };
	/**
	 * The convention this rule is one language's copy of, straight off the
	 * policy case. See `RulePolicyCase.variant` for why eight spelling rules
	 * have one and why the index collapses them.
	 */
	variant?: { family: string; language: string };
	/** The reviewed example pair the diagnostic above was produced from. */
	invalid: string;
	valid: string;
	/** Resolved provenance for the diagnostic's `sourceIds`, in citation order. */
	sources: SourceReference[];
	/** The explanation cut to meta-description length for the page's head. */
	seoDescription: string;
	/**
	 * Every form in this rule's lookup table, for the index's search — and only
	 * the forms. The table itself is loaded by the rule's own page, because this
	 * entry travels in the section layout's data and is therefore copied into all
	 * 60 prerendered payloads: the whole table is 17.8% of that payload for
	 * content six of every seven pages never draw, and the terms are 2.5%.
	 * Absent on a rule that is a judgment rather than a table.
	 */
	lookupTerms?: string;
	/**
	 * The guideline entries whose convention this rule checks, resolved to their
	 * topic pages' own anchors. Derived from the guidance catalog's
	 * `relatedRuleIds` — the same mapping the entries' meta lines draw the other
	 * way — so the two directions cannot drift apart. Absent while no entry
	 * names the rule, which is the page drawing nothing.
	 */
	guidelines?: RuleGuidelineLink[];
}

export { ruleSlug };

// Rule IDs already contain hyphens (`sound-effect.asterisks`), so the flatten
// is not invertible by string transform. The map is; a collision between two
// IDs would silently drop an entry here, which reference.test.ts turns into a
// failure by asserting every ID round-trips.
const idBySlug = new Map(enabledRules.map((rule) => [ruleSlug(rule.id), rule.id]));

export function ruleFromSlug(slug: string): string | undefined {
	return idBySlug.get(slug);
}

/**
 * Index group names, keyed by ID prefix. The lookup throws on a prefix it does
 * not know so a rule family cannot ship with its raw prefix as a heading —
 * prerendering every page is part of the build, which makes this a build error
 * rather than a runtime one.
 *
 * It is also what `ruleName` reads, and that is a second set of callers with a
 * second set of prefixes: Harper's findings are not registry rules and have no
 * reference page, but they are diagnostics like any other, so ignoring one
 * names it in the ignored-rules footer. `style` is in this map for that reason
 * alone — `style.harper` has no page and never will, and without an entry here
 * `ruleName` fell through to its own fallback and printed the raw ID at the
 * reader.
 */
const groupTitles: Record<string, string> = {
	syntax: 'Syntax and markup',
	language: 'Language selection',
	section: 'Section headers',
	performer: 'Performer attribution',
	spelling: 'Spelling',
	quotes: 'Quotation marks',
	contraction: 'Contractions',
	grammar: 'Grammar',
	style: 'Style',
	symbols: 'Symbols and special characters',
	text: 'Text spacing and invisible characters',
	unknown: 'Unknown lyrics',
	repeat: 'Repeated sections',
	'sound-effect': 'Sound effects',
	censored: 'Censored words',
	adlib: 'Ad-libs',
	capitalization: 'Capitalization',
	punctuation: 'Punctuation',
	line: 'Line length',
	numbers: 'Numbers'
};

function groupTitle(prefix: string): string {
	const title = groupTitles[prefix];
	if (!title) {
		throw new Error(`No reference group title for rule prefix "${prefix}"`);
	}
	return title;
}

/**
 * The order the index draws its groups in, most-consulted first.
 *
 * It used to be each group's first appearance in the registry, which is an
 * ordering of the *pipeline* — rules run roughly in the order a document is
 * taken apart — and it put `language.selection-mismatch` second on the page.
 * That is one rule, and it is the one a reader only ever meets by having chosen
 * the wrong language pack; above it, and above spelling, sat nothing anybody
 * arrives here looking for. A reader's first screen was decided by an
 * implementation detail.
 *
 * This is an editorial ranking rather than a measurement, and it has to be:
 * LyricLint collects nothing — 'scribes stay in the browser, there is no
 * analytics on the site, and the deployed build phones nobody but the audio
 * source the user attached. So there is no "most accessed" to read off, and the
 * honest proxy is how often a transcriber meets that family at all. Inventing a
 * number to sort by would be the same failure as the automatic anchor stamp:
 * plausible, and wrong by an amount nobody can see.
 *
 * The shape of it: what every transcription has (headers, spellings, the markup
 * itself, the voices) leads; then the conventions that apply line by line; then
 * the narrow families a particular song runs into; and last the two that only
 * exist under a condition the reader has to have hit — a prose-dense line, and
 * the wrong pack selected.
 *
 * Order *within* a group stays registry order, which is already written
 * strongest-first inside each family — `spelling.standardized` leads the
 * spellings and the nine language-specific ones trail it — so a second hand-run
 * ranking of all 60 rules would be a lot of judgment for very little movement.
 *
 * Exhaustive, and it throws for a prefix it does not know, exactly as
 * `groupTitle` does: prerendering every page is part of the build, so a rule
 * family added without a place in this list fails the build rather than landing
 * silently at one end of the index.
 */
const groupOrder: readonly string[] = [
	'section',
	'spelling',
	'syntax',
	'performer',
	'capitalization',
	'punctuation',
	'unknown',
	'contraction',
	'quotes',
	'adlib',
	'text',
	'grammar',
	'repeat',
	'symbols',
	'numbers',
	'censored',
	'sound-effect',
	'line',
	'language'
];

function groupRank(prefix: string): number {
	const rank = groupOrder.indexOf(prefix);
	if (rank < 0) {
		throw new Error(`No reference group order for rule prefix "${prefix}"`);
	}
	return rank;
}

// Mirrors how catalog-policy.test.ts builds its roster, so the reference runs
// each rule under the same conditions its policy example is verified under.
function performerRecordsFor(names: readonly string[]): PerformerRecord[] {
	return names.map((displayName, order) => ({
		id: `p-${order}`,
		displayName,
		normalizedKey: displayName.toLocaleLowerCase('en'),
		aliases: [],
		colorId: `c-${order}`,
		order
	}));
}

/**
 * Search descriptions get cut mid-sentence by engines at around 155–160
 * characters; cutting at a word boundary ourselves keeps the visible text ours
 * rather than an engine's truncation of it.
 */
function seoDescription(explanation: string): string {
	const supplement = ' See examples, the available fix, and the reviewed Genius source.';
	if (explanation.length < 90 && explanation.length + supplement.length <= 155) {
		return `${explanation}${supplement}`;
	}
	if (explanation.length <= 155) {
		return explanation;
	}
	const cut = explanation.slice(0, 154);
	return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

function deriveReference(rule: RuleDefinition, policy: RulePolicyCase): RuleReference {
	const context: RuleContext = {
		language: policy.language ?? 'en',
		performers: performerRecordsFor(policy.performers ?? ['A']),
		sources: sourceRegistry,
		ruleSetVersion: currentRuleSet.version,
		// The reference never dispatches the fixes it reads labels from, so any
		// revision works; zero states that these edits are not for applying.
		revision: 0
	};
	// `sortDiagnostics` rather than "first emitted": the page leads with the
	// same finding the panel would, not with whatever iteration order the
	// rule's implementation happens to have.
	const [lead] = sortDiagnostics(rule.check(parseDocument(policy.invalid), context));
	if (!lead) {
		throw new Error(`Rule ${rule.id} produced no diagnostic for its invalid policy example`);
	}
	const sources = lead.sourceIds.map((sourceId) => {
		const source = sourceRegistry.get(sourceId);
		if (!source) {
			// Provenance is the entire reason these pages exist, so a citation that
			// cannot be resolved is a page that must not build.
			throw new Error(`Rule ${rule.id} cites unknown source ${sourceId}`);
		}
		return source;
	});
	const prefix = rule.id.slice(0, rule.id.indexOf('.'));
	const fix = lead.fixes?.[0];
	const lookup = ruleLookupTable(rule.id);
	const guidelines = guidanceForRule(rule.id);
	return {
		id: rule.id,
		title: policy.title,
		slug: ruleSlug(rule.id),
		group: prefix,
		groupTitle: groupTitle(prefix),
		language: policy.language ?? 'en',
		severity: lead.severity,
		message: lead.message,
		explanation: lead.explanation,
		...(fix ? { fix: { label: fix.label, kind: fix.kind } } : {}),
		...(policy.variant ? { variant: { ...policy.variant } } : {}),
		invalid: policy.invalid,
		valid: policy.valid,
		sources,
		seoDescription: seoDescription(lead.explanation),
		...(lookup ? { lookupTerms: lookupSearchTerms(lookup) } : {}),
		...(guidelines.length > 0 ? { guidelines } : {})
	};
}

let cache: RuleReference[] | undefined;

/** Every enabled rule's reference entry, in registry order. */
export function ruleReferences(): RuleReference[] {
	if (!cache) {
		const caseById = new Map(policyCases.map((policy) => [policy.id, policy]));
		cache = enabledRules.map((rule) => {
			const policy = caseById.get(rule.id);
			if (!policy) {
				// A rule without a policy case has no reviewed example to derive a
				// page from — and no page means no reference entry, so the rule
				// cannot ship until the case (and with it the test coverage) exists.
				throw new Error(`Rule ${rule.id} has no policy case to derive its reference page from`);
			}
			return deriveReference(rule, policy);
		});
	}
	return cache;
}

/**
 * What a rule is called in front of a reader. `adlib.parentheses` is a
 * developer's handle, so every surface naming a rule to a user — the
 * ignored-rules footer, the ignore and restore announcements — comes through
 * here.
 *
 * It is the index group's own title plus the rest of the ID in words, rather
 * than the rule's diagnostic message: a message is written about the occurrence
 * in front of the reader (“«definately» is a common English spelling error”),
 * and ignoring a rule silences all of them. Derived rather than hand-written so
 * a new rule cannot ship with no name, and unknown IDs fall back to themselves —
 * a label is not worth breaking a restore over.
 */
export function ruleName(id: string): string {
	const [prefix, ...rest] = id.split('.');
	const detail = rest.join(' ').replaceAll('-', ' ');
	if (!groupTitles[prefix] || !detail) return id;
	return `${groupTitles[prefix]}: ${detail}`;
}

export function ruleReferenceFromSlug(slug: string): RuleReference | undefined {
	const id = ruleFromSlug(slug);
	return id ? ruleReferences().find((reference) => reference.id === id) : undefined;
}

/** One index section: a titled, contiguous slice of the reference. */
export interface RuleReferenceGroup {
	/** The ID prefix the section is built from, and the key `groupGuidance` uses. */
	group: string;
	title: string;
	rules: RuleReference[];
}

/**
 * The reference grouped for the index, in `groupOrder` — most-consulted first.
 * Grouping by prefix pulls the spelling rules that the registry interleaves
 * with grammar back into one section; the rules inside each group keep the
 * registry's own order.
 */
export function groupedRuleReferences(): RuleReferenceGroup[] {
	const groups = new Map<string, RuleReferenceGroup>();
	for (const reference of ruleReferences()) {
		let group = groups.get(reference.group);
		if (!group) {
			group = { group: reference.group, title: reference.groupTitle, rules: [] };
			groups.set(reference.group, group);
		}
		group.rules.push(reference);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => groupRank(a) - groupRank(b))
		.map(([, group]) => group);
}
