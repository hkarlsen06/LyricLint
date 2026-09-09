/** The evaluation set is versioned data with coverage promises; this pins them
 * so a corpus change cannot silently orphan a case or a family. */
import { describe, expect, it } from 'vitest';
import evalSetJson from '../eval/eval-set.json';
import { answersInNorwegian, toolNotesInNorwegian } from '../eval/assertions.mjs';
import { corpus } from '../src/corpus';
import type { AnswerProvider, ProviderResult } from '../src/provider';
import { evaluateToolLanguage, toolNotes } from '../eval/tool-language';

interface EvalCase {
	id: string;
	category: string;
	language: string;
	question: string;
	expect?: {
		scopes?: string[];
		citesAny?: string[];
		citesNone?: boolean;
		mentionsAll?: string[];
		answerLanguage?: string;
	};
}

interface EvalSet {
	version: number;
	cases: EvalCase[];
}

const evalSet = evalSetJson as EvalSet;

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

	it('pins Norwegian answer language against the observed German switch', () => {
		const norwegianCases = evalSet.cases.filter(
			(testCase) => testCase.expect?.answerLanguage === 'no'
		);
		expect(norwegianCases.length).toBeGreaterThan(0);
		expect(
			answersInNorwegian(
				'Bruk [Refreng] i en norsk sang, og behold den engelske teksten bare hvis den synges.'
			).ok
		).toBe(true);
		expect(
			answersInNorwegian(
				'Die Anführungszeichen wurden korrigiert. Prüfe die hörbare Pause in der Aufnahme.'
			).ok
		).toBe(false);
	});

	it('checks tool notes independently of Norwegian answers and quoted lyrics', () => {
		const notes = toolNotes({
			callId: 'reference',
			name: 'show_lyrics',
			input: {
				references: [
					{
						id: 'one',
						anchor: { exact: 'Die Nacht ist still', before: '', after: '', line: 1 },
						note: 'Behold teksten som den er.'
					},
					{
						id: 'two',
						anchor: { exact: 'Jeg venter på deg', before: '', after: '', line: 2 },
						note: 'Bitte mit der Aufnahme abgleichen.'
					}
				]
			}
		});
		expect(notes.map((note) => answersInNorwegian(note).ok)).toEqual([true, false]);
	});

	it('requires annotations but permits short Norwegian notes and catches one German note', () => {
		expect(toolNotesInNorwegian([]).ok).toBe(false);
		expect(toolNotesInNorwegian(['Første refreng', 'Behold teksten som den er.']).ok).toBe(true);
		expect(toolNotesInNorwegian(['Første refreng']).ok).toBe(true);
		expect(
			toolNotesInNorwegian(['Første refreng', 'Bitte mit der Aufnahme abgleichen.'])
		).toMatchObject({ ok: false, germanNoteIndexes: [1] });
	});

	it('fails German annotations between a shared read and a Norwegian final answer', async () => {
		const usage = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
		const responses: ProviderResult[] = [
			{
				kind: 'tool_calls',
				usage,
				providerItems: '[]',
				calls: [{ callId: 'read', name: 'read_scribe', input: {} }]
			},
			{
				kind: 'tool_calls',
				usage,
				providerItems: '[]',
				calls: [
					{
						callId: 'show',
						name: 'show_lyrics',
						input: {
							references: [
								{
									id: 'one',
									anchor: { exact: 'Jeg hører skymåneklangen din', before: '', after: '', line: 3 },
									note: 'Bitte mit der Aufnahme abgleichen.'
								}
							]
						}
					}
				]
			},
			{
				kind: 'answer',
				usage,
				raw: {
					scope: 'draft-work',
					blocks: [
						{ kind: 'prose', text: 'Behold teksten som den er.', ruleIds: [], sourceIds: [] }
					]
				}
			}
		];
		const provider: AnswerProvider = async (messages) => {
			if (responses.length === 2)
				expect(messages.at(-1)).toMatchObject({
					role: 'tool',
					results: [{ name: 'read_scribe', result: { status: 'granted' } }]
				});
			return responses.shift()!;
		};
		await expect(evaluateToolLanguage(provider, 'Korrekturles', () => {})).rejects.toThrow(
			'Tool language regression: annotation language'
		);
		expect(responses).toHaveLength(0);
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

	it('covers general help both with and without a useful reviewed rule', () => {
		const cases = evalSet.cases.filter((testCase) => testCase.category === 'general-guidance');
		expect(cases.some((testCase) => testCase.expect?.citesNone)).toBe(true);
		expect(cases.some((testCase) => (testCase.expect?.citesAny?.length ?? 0) > 0)).toBe(true);
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
