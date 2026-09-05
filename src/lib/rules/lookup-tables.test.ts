/**
 * The catalog's lookup tables, and the two things a flattened copy of a table
 * can quietly get wrong: going stale against the constants the rules actually
 * check, and losing the line between reviewed guidance and LyricLint's own
 * curation.
 */
import { describe, expect, it } from 'vitest';
import { contractions as englishContractions } from './catalog/contraction-apostrophe.js';
import { contractions as spanishContractions } from './catalog/grammar-spanish-contractions.js';
import { numberWords } from './catalog/numbers-spell-out.js';
import { curlyQuotes } from './catalog/quotes-typewriter.js';
import { norwegianPreferences } from './catalog/section-localized-header-preference.js';
import { replacements as commonEnglishMisspellings } from './catalog/spelling-english-common.js';
import { expansions as shorthandExpansions } from './catalog/spelling-texting-shorthand.js';
import { standardizedSpellings } from './data/spelling.js';
import { ruleLookupTables } from './lookup-tables.js';
import { enabledRules } from './registry.js';

const tables = ruleLookupTables();
const tableFor = (ruleId: string) => tables.find((table) => table.ruleId === ruleId)!;

describe('rule lookup tables', () => {
	it('names a shipped rule once each, and describes every table', () => {
		const ids = tables.map((table) => table.ruleId);
		expect(new Set(ids).size).toBe(ids.length);
		const enabled = new Set(enabledRules.map((rule) => rule.id));
		for (const table of tables) {
			expect(enabled.has(table.ruleId), `${table.ruleId} is not a shipped rule`).toBe(true);
			expect(table.description.trim().length).toBeGreaterThan(0);
			expect(table.entries.length).toBeGreaterThan(0);
		}
	});

	it('gives every entry something to prefer', () => {
		for (const table of tables) {
			for (const entry of table.entries) {
				expect(
					entry.preferred.length,
					`${table.ruleId} entry with no preferred form`
				).toBeGreaterThan(0);
				// An entry with nothing to replace is an accepted-variant record, and
				// must not claim a repair for a finding that is never raised.
				if (entry.instead.length === 0) expect(entry.fix).toBeUndefined();
			}
		}
	});

	describe('the reviewed spellings', () => {
		const table = tableFor('spelling.standardized');

		it('carries the whole table rather than the policy example', () => {
			// The bug this module exists for: the assistant could see one pair.
			expect(table.entries.length).toBe(standardizedSpellings.length);
			expect(table.entries.length).toBeGreaterThan(20);
			expect(table.entries.map((entry) => entry.preferred)).toEqual(
				standardizedSpellings.map((spelling) => [...spelling.preferred])
			);
			expect(table.entries.map((entry) => entry.instead)).toEqual(
				standardizedSpellings.map((spelling) => [...spelling.alternates])
			);
		});

		it("still carries the one pair the reference page's example is", () => {
			const imma = table.entries.find((entry) => entry.preferred.includes("I'ma"));
			expect(imma?.instead).toContain('Imma');
			expect(imma?.fix).toBe('safe');
		});

		it('reports the fix per entry, because the rule-level ceiling is preview throughout', () => {
			expect(enabledRules.find((rule) => rule.id === 'spelling.standardized')?.fixability).toBe(
				'preview'
			);
			for (const [index, spelling] of standardizedSpellings.entries()) {
				const entry = table.entries[index]!;
				if (!spelling.pattern) {
					expect(entry.fix, `${spelling.preferred[0]} is flagged by nothing`).toBeUndefined();
				} else {
					expect(entry.fix, `${spelling.preferred[0]}`).toBe(spelling.safe ? 'safe' : 'preview');
				}
			}
			// Both kinds are genuinely present, or the per-entry read is untested.
			const kinds = new Set(table.entries.map((entry) => entry.fix));
			expect(kinds).toEqual(new Set(['safe', 'preview', undefined]));
		});

		it('keeps curated transcription mistakes out of the reviewed forms', () => {
			for (const [index, spelling] of standardizedSpellings.entries()) {
				const entry = table.entries[index]!;
				const curated = spelling.commonMisspellings ?? [];
				expect(entry.curatedMisspellings ?? []).toEqual([...curated]);
				for (const mistake of curated) {
					expect(entry.instead, `${mistake} leaked into the reviewed forms`).not.toContain(mistake);
					expect(entry.preferred).not.toContain(mistake);
				}
			}
			// The distinction is only worth testing because the corpus has some.
			expect(table.entries.some((entry) => entry.curatedMisspellings?.length)).toBe(true);
		});

		it('states the gate wherever one exists, and says so once', () => {
			for (const [index, spelling] of standardizedSpellings.entries()) {
				const entry = table.entries[index]!;
				if (spelling.contextGate === 'general' && !spelling.exceptionDescription) {
					expect(entry.appliesWhen).toBeUndefined();
				} else {
					expect(entry.appliesWhen, `${spelling.preferred[0]}`).toBeTruthy();
				}
				// The rule's own wording wins where it has one.
				if (spelling.exceptionDescription) {
					expect(entry.appliesWhen).toBe(spelling.exceptionDescription);
				}
			}
		});

		it('flags typo tolerance rather than repeating a sentence about it', () => {
			for (const [index, spelling] of standardizedSpellings.entries()) {
				const entry = table.entries[index]!;
				expect(entry.fuzzy ?? false).toBe(Boolean(spelling.fuzzy));
			}
			// It was prose once, on 14 of 29 rows verbatim. The wording is the
			// table's own description now, which says it once.
			expect(table.entries.some((entry) => entry.fuzzy)).toBe(true);
			expect(table.entries.some((entry) => entry.note?.includes('one-character'))).toBe(false);
			expect(table.description).toContain('one-character typo');
		});
	});

	it('reproduces the pair tables entry for entry', () => {
		const pairs = (ruleId: string) =>
			tableFor(ruleId).entries.map((entry) => [entry.instead[0], entry.preferred] as const);

		expect(pairs('spelling.english-common')).toEqual(
			Object.entries(commonEnglishMisspellings).map(([wrong, right]) => [wrong, [right]])
		);
		expect(pairs('spelling.texting-shorthand')).toEqual(
			Object.entries(shorthandExpansions).map(([token, readings]) => [token, [...readings]])
		);
		expect(pairs('contraction.apostrophe')).toEqual(
			Object.entries(englishContractions).map(([wrong, right]) => [wrong, [right]])
		);
		expect(pairs('grammar.spanish-contractions')).toEqual(
			Object.entries(spanishContractions).map(([wrong, right]) => [wrong, [right]])
		);
		expect(pairs('numbers.spell-out')).toEqual(
			numberWords.map((word, digit) => [String(digit), [word]])
		);
		expect(pairs('quotes.typewriter')).toEqual(
			Object.entries(curlyQuotes).map(([curly, { straight }]) => [curly, [straight]])
		);
		expect(pairs('section.localized-header-preference')).toEqual(
			[...norwegianPreferences].map(([english, { replacement }]) => [english, [replacement]])
		);
	});

	it('names each curly mark, because the mark cannot be told apart at this size', () => {
		const names = tableFor('quotes.typewriter').entries.map((entry) => entry.note);
		expect(new Set(names).size).toBe(names.length);
		expect(names).toContain('The closing curly single quote.');
	});
});
