/** The evaluation set is versioned data with coverage promises; this pins them
 * so a corpus change cannot silently orphan a case or a family. */
import { describe, expect, it } from 'vitest';
import evalSetJson from '../eval/eval-set.json';
import { corpus } from '../src/corpus';

interface EvalCase {
	id: string;
	category: string;
	language: string;
	question: string;
	expect?: { scopes?: string[]; citesAny?: string[]; mentionsAll?: string[] };
}

const evalSet = evalSetJson as unknown as { version: number; cases: EvalCase[] };

describe('the evaluation set', () => {
	it('is versioned and has unique case ids', () => {
		expect(evalSet.version).toBeGreaterThanOrEqual(1);
		const ids = evalSet.cases.map((testCase) => testCase.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('covers every rule family in the corpus', () => {
		const families = new Set(corpus.rules.map((rule) => rule.group));
		const covered = new Set(
			evalSet.cases
				.filter((testCase) => testCase.category === 'rule-family')
				.map((testCase) => testCase.id.replace(/^family-/, '').split('-')[0])
		);
		// `sound-effect` hyphenates; recover it from the raw id.
		if (evalSet.cases.some((testCase) => testCase.id === 'family-sound-effect')) {
			covered.add('sound-effect');
		}
		for (const family of families) {
			expect(covered.has(family), `no eval case for rule family "${family}"`).toBe(true);
		}
	});

	it('covers all eight reviewed languages', () => {
		const corpusTags = corpus.languages.map((language) => language.tag).sort();
		const covered = evalSet.cases
			.filter((testCase) => testCase.category === 'language')
			.map((testCase) => testCase.language)
			.sort();
		expect(covered).toEqual(corpusTags);
	});

	it('includes the adversarial categories', () => {
		const categories = new Set(evalSet.cases.map((testCase) => testCase.category));
		for (const required of [
			'policy-vs-grammar',
			'not-covered',
			'prompt-injection',
			'draft-access',
			'conflicting-language',
			'multi-rule',
			'lookup-table'
		]) {
			expect(categories.has(required), `missing category "${required}"`).toBe(true);
		}
	});

	it('asks the lookup-table cases for forms the rule’s own example does not contain', () => {
		// The gap these close is invisible to every other check: an answer that
		// knows one pair is structurally perfect and cites the right rule. So the
		// expectation has to be prose, and it has to name forms that reach the
		// model only through `lookups`.
		const cases = evalSet.cases.filter((testCase) => testCase.category === 'lookup-table');
		expect(cases.length).toBeGreaterThan(0);
		const tabled = new Set(corpus.lookups.map((lookup) => lookup.ruleId));
		for (const testCase of cases) {
			const mentions = testCase.expect?.mentionsAll ?? [];
			expect(mentions.length, `${testCase.id} asserts nothing about the answer`).toBeGreaterThan(0);
			for (const ruleId of testCase.expect?.citesAny ?? []) {
				expect(tabled.has(ruleId), `${testCase.id} expects ${ruleId}, which has no table`).toBe(
					true
				);
			}
			const rule = corpus.rules.find((entry) =>
				(testCase.expect?.citesAny ?? []).includes(entry.id)
			)!;
			const example = `${rule.flaggedExample}\n${rule.acceptedExample}\n${rule.message}`;
			for (const form of mentions) {
				expect(
					example.includes(form),
					`${testCase.id} expects "${form}", which ${rule.id}'s own example already carries`
				).toBe(false);
				expect(
					corpus.lookups
						.find((lookup) => lookup.ruleId === rule.id)!
						.entries.some((entry) => [...entry.preferred, ...entry.instead].includes(form)),
					`${testCase.id} expects "${form}", which is in no ${rule.id} entry`
				).toBe(true);
			}
		}
	});

	it('only ever expects rule ids the corpus contains', () => {
		const known = new Set(corpus.rules.map((rule) => rule.id));
		for (const testCase of evalSet.cases) {
			for (const ruleId of testCase.expect?.citesAny ?? []) {
				expect(known.has(ruleId), `${testCase.id} expects unknown rule ${ruleId}`).toBe(true);
			}
		}
	});
});
