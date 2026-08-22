/**
 * The catalog's lookup tables, flattened into replacement pairs.
 *
 * Seven rules are a table rather than a predicate — the reviewed spellings, the
 * common English misspellings, the texting-shorthand expansions, the two
 * contraction maps, the digits, the curly quotes, and the Norwegian header
 * preferences. What the rule reference publishes about each of them is *one*
 * worked example, because a reference page is derived by running the rule
 * against its reviewed `invalid` case and a page is written about the
 * occurrence in front of the reader. The table itself has never left the
 * frontend bundle.
 *
 * That is a hole the moment anything but the workbench has to answer for the
 * catalog, and the rules assistant is that thing. Asked "what are the
 * standardized spellings?" it could see exactly one pair — `Imma` → `I'ma`, the
 * `spelling.standardized` policy example — so it answered with one pair:
 * correctly, and uselessly. This module is the whole table, derived from the
 * same constants the rules check against, so a spelling added to
 * `data/spelling.ts` reaches the assistant's corpus without anybody remembering
 * to copy it across.
 *
 * Three distinctions it has to carry, because the corpus is the material the
 * assistant is told it may present as reviewed Genius policy:
 *
 * - **`curatedMisspellings` are LyricLint's own.** `preferred` and `instead`
 *   come from the reviewed guidance; `coz`, `couse` and `tryina` are curated
 *   transcription mistakes no guideline names, and `StandardizedSpelling` says
 *   so in the field's own doc comment. Flattened into one list with no label
 *   they would read as reviewed policy, which is the single thing the
 *   assistant's instructions forbid.
 * - **`fix` is per entry, not per rule.** `spelling.standardized` declares
 *   `fixability: 'preview'` as a *ceiling*, and each entry's own `safe` flag is
 *   what decides whether the workbench offers a one-press fix or a previewed
 *   one. A table reporting the rule's ceiling would tell the visitor every
 *   reviewed spelling needs confirming, when most of them do not.
 * - **An entry with no `pattern` is flagged by nothing**, and omits `fix`
 *   entirely rather than claiming a repair. `shawty`/`shorty` and
 *   `alright`/`all right` are there to record that both forms are accepted —
 *   and to seed Harper — not because anything reports them.
 *
 * Pure data, no CodeMirror and no rule execution, so unlike `reference.ts` it
 * runs anywhere. `assistant-corpus.ts` is its one consumer today.
 */
import { contractions as englishContractions } from './catalog/contraction-apostrophe.js';
import { contractions as spanishContractions } from './catalog/grammar-spanish-contractions.js';
import { numberWords } from './catalog/numbers-spell-out.js';
import { curlyQuotes } from './catalog/quotes-typewriter.js';
import { norwegianPreferences } from './catalog/section-localized-header-preference.js';
import { replacements as commonEnglishMisspellings } from './catalog/spelling-english-common.js';
import { expansions as shorthandExpansions } from './catalog/spelling-texting-shorthand.js';
import { standardizedSpellings, type SpellingContextGate } from './data/spelling.js';

/** One replacement pair out of a rule's lookup table. */
interface RuleLookupEntry {
	/** What the reviewed guidance prefers. More than one where both are accepted. */
	preferred: string[];
	/** What it is preferred over, as the reviewed guidance names it. */
	instead: string[];
	/**
	 * Transcription mistakes LyricLint curates itself. Detected like an
	 * alternate, but named by no reviewed guideline — never present these as
	 * Genius policy.
	 */
	curatedMisspellings?: string[];
	/**
	 * Whether a one-character typo of the preferred form is caught as well, which
	 * is opt-in per entry and always a previewed fix even where the entry's own
	 * listed forms are safe.
	 *
	 * A flag rather than the sentence it used to be. Carried as prose it was the
	 * same sentence on 14 of the 29 reviewed spellings — the most repeated string
	 * on the rule's page, saying the least important thing on each row, which is
	 * the repetition that made the diagnostic card drop its severity word. The
	 * wording belongs to the table's `description`, which says it once.
	 */
	fuzzy?: boolean;
	/** The condition on the replacement, where the entry is gated on one. */
	appliesWhen?: string;
	/** Anything else true of this pair that the pair itself does not say. */
	note?: string;
	/** How the workbench repairs it. Absent where nothing is flagged at all. */
	fix?: 'safe' | 'preview';
}

/** Everything one table-shaped rule checks against. */
export interface RuleLookupTable {
	ruleId: string;
	/** What the table is, and what the pairs in it do not say for themselves. */
	description: string;
	entries: RuleLookupEntry[];
}

/**
 * The gate in words. `exceptionDescription` says the same thing more precisely
 * wherever a spelling carries one, so this is the fallback rather than the
 * first answer — printing both puts one sentence on the row twice.
 */
const GATE_CONDITIONS = {
	general: undefined,
	'american-english': 'American English only.',
	'cousin-meaning': 'Not where the word means cousin.',
	'tool-meaning': 'Not where the word means the garden tool.',
	'you-or-your-meaning': 'Only where the word means you or your.',
	'percocet-meaning': 'Only where the word refers to Percocet.',
	pronunciation:
		'Depends on the recording: Genius also allows a distinct or deliberate pronunciation to be written as heard, so compare the audio before replacing it.',
	'line-position': 'Which preferred form applies follows the position in the line.',
	'money-meaning': 'Only where the word refers to money.',
	'accepted-variant': 'Both forms are accepted.'
} satisfies Record<SpellingContextGate, string | undefined>;

const UNFLAGGED_NOTE =
	'LyricLint reports neither form; the entry records the accepted variants and seeds Harper.';

// Optional keys are assigned only where they are present, never set to
// `undefined`, because the corpus is hashed as JSON: `{ note: undefined }` and
// `{}` serialize alike but compare differently, so an absent note would fail
// the determinism test's structural half while passing its hash half. They are
// also assigned in declaration order, because `JSON.stringify` writes keys in
// insertion order and that order is part of what the hash covers.

function spellingTable(): RuleLookupTable {
	return {
		ruleId: 'spelling.standardized',
		description:
			"The reviewed Genius spelling guide's preferred lyric forms. Case is preserved from " +
			'the text being corrected, so a line-initial occurrence keeps its capital. Where an ' +
			'entry is marked fuzzy, any one-character typo of the preferred form is caught as ' +
			'well — always as a previewed fix, even where the entry’s own listed forms are safe.',
		entries: standardizedSpellings.map((spelling) => {
			const appliesWhen = spelling.exceptionDescription ?? GATE_CONDITIONS[spelling.contextGate];
			const entry: RuleLookupEntry = {
				preferred: [...spelling.preferred],
				instead: [...spelling.alternates]
			};
			if (spelling.commonMisspellings?.length) {
				entry.curatedMisspellings = [...spelling.commonMisspellings];
			}
			if (spelling.fuzzy) entry.fuzzy = true;
			if (appliesWhen) entry.appliesWhen = appliesWhen;
			if (spelling.pattern) entry.fix = spelling.safe ? 'safe' : 'preview';
			else entry.note = UNFLAGGED_NOTE;
			return entry;
		})
	};
}

/** Whether a table's value side is the single wording rather than a list of them. */
function isOneWording(preferred: string | readonly string[]): preferred is string {
	return typeof preferred === 'string';
}

/** A table that is one wording per token, with one fix behavior throughout. */
function pairTable(
	ruleId: string,
	description: string,
	fix: 'safe' | 'preview',
	pairs: Iterable<readonly [string, string | readonly string[]]>
): RuleLookupTable {
	return {
		ruleId,
		description,
		entries: [...pairs].map(([instead, preferred]) => ({
			preferred: isOneWording(preferred) ? [preferred] : [...preferred],
			instead: [instead],
			fix
		}))
	};
}

/**
 * Everything a table's page *says*, as one string for the reference's search
 * haystack: what the table is, every condition written on a row, and every form
 * in it.
 *
 * The whole table is far too much to put in the index's payload — it is served
 * by a layout, so it would be copied into all 60 prerendered pages for content
 * six of every seven of them never draw. This is 6.0% of that payload against
 * 16.2%, and it is all a search needs: a reader who types `tryna` wants the row
 * that has it, not the table.
 *
 * The forms alone were the first version of this and they left a hole of
 * exactly the shape this function exists to close. For these eight rules the
 * table *is* the page, so its prose is most of what the reader is looking at —
 * `Not where the word means cousin`, `American English only`, `The right single
 * quotation mark` — and none of it was reachable by typing the words in it. A
 * search that answers for a page's headings and not for its body is a search
 * the reader learns to distrust.
 *
 * The conditions are deduped, which is what keeps the addition cheap: a gate is
 * written once and repeated down the table, so the 29 reviewed spellings carry
 * 12 distinct sentences between them and a haystack has no use for the other
 * 17 copies of them.
 */
export function lookupSearchTerms(table: RuleLookupTable): string {
	const conditions = new Set<string>();
	for (const entry of table.entries) {
		if (entry.appliesWhen) conditions.add(entry.appliesWhen);
		if (entry.note) conditions.add(entry.note);
	}
	return [
		table.description,
		...conditions,
		...table.entries.flatMap((entry) => [
			...entry.preferred,
			...entry.instead,
			...(entry.curatedMisspellings ?? [])
		])
	].join(' ');
}

export function ruleLookupTables(): RuleLookupTable[] {
	return [
		spellingTable(),
		pairTable(
			'spelling.english-common',
			"High-frequency English misspellings and the correct word. English 'scribes only.",
			'preview',
			Object.entries(commonEnglishMisspellings)
		),
		pairTable(
			'spelling.texting-shorthand',
			'Written-only shorthand and the words it stands in for. An entry carries more than ' +
				'one wording where the shorthand genuinely reads more than one way. The expansion ' +
				'is never shouted to match an initialism-cased token: only a leading capital survives.',
			'preview',
			Object.entries(shorthandExpansions)
		),
		pairTable(
			'contraction.apostrophe',
			"English contractions written without their apostrophe. English 'scribes only.",
			'preview',
			Object.entries(englishContractions)
		),
		pairTable(
			'grammar.spanish-contractions',
			"Obligatory Spanish contractions. Spanish 'scribes only.",
			'preview',
			Object.entries(spanishContractions)
		),
		pairTable(
			'numbers.spell-out',
			'Digits a lyric spells out. Numbers reading as data rather than as words — times, ' +
				'money, percentages, and anything joined by a separator — are exempt, as is a ' +
				'digit inside a written-out song part label.',
			'preview',
			numberWords.map((word, digit) => [String(digit), word] as const)
		),
		{
			ruleId: 'quotes.typewriter',
			description:
				'Curly quotation marks and the typewriter mark each becomes. A closing curly ' +
				'single quote between two letters is named as an apostrophe rather than as the ' +
				'closing half of a pair, which is most of what this rule points at in real lyrics.',
			entries: Object.entries(curlyQuotes).map(([curly, { straight, name }]) => ({
				preferred: [straight],
				instead: [curly],
				note: `The ${name}.`,
				fix: 'safe' as const
			}))
		},
		{
			ruleId: 'section.localized-header-preference',
			description:
				'Song parts whose reviewed Norwegian pack prefers a Norwegian header over the ' +
				'English one. Matched without regard to case or diacritics, and a single ' +
				'adjacent transposition of the preferred spelling is caught too.',
			entries: [...norwegianPreferences].map(([english, preference]) => ({
				preferred: [preference.replacement],
				instead: [english],
				appliesWhen: `${preference.languageName} 'scribes only.`,
				fix: 'safe' as const
			}))
		}
	];
}

const byRuleId = new Map(ruleLookupTables().map((table) => [table.ruleId, table]));

/** The table a rule checks against, where it is one of the seven that has one. */
export function ruleLookupTable(ruleId: string): RuleLookupTable | undefined {
	return byRuleId.get(ruleId);
}
