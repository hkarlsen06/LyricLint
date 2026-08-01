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
	expect?: { scopes?: string[]; citesAny?: string[] };
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
			'multi-rule'
		]) {
			expect(categories.has(required), `missing category "${required}"`).toBe(true);
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
