import { parseDocument } from '$lib/core/parser.js';
import { currentRuleSet } from '$lib/rules/index.js';
import { describe, expect, test } from 'vitest';
import { createTestWorkbench, performer } from '../test-utils.js';
import { buildRuleContext, computeDiagnostics, resolveVoiceGroupRanges } from './wiring.js';

describe('UI wiring', () => {
	test('propagates the editor revision to rule fixes and accepts the resulting fix', () => {
		const text = '[Verse\nLine';
		const parsed = parseDocument(text);
		const diagnostics = computeDiagnostics(
			parsed,
			buildRuleContext('en', [], currentRuleSet.version, 3)
		);
		const diagnostic = diagnostics.find((candidate) => candidate.fixes?.length);
		const fix = diagnostic?.fixes?.[0];
		expect(fix?.edit.baseRevision).toBe(3);

		const { controller, calls } = createTestWorkbench({ text, revision: 3 });
		controller.onSnapshot({
			...controller.snapshot,
			revision: 3,
			parsed,
			diagnostics
		});
		controller.applyFix(diagnostic!, fix!);
		expect(calls.dispatched).toEqual([fix!.edit]);
	});

	test('keeps literal style wrappers out of plain performer highlight ranges', () => {
		const text = '[Chorus: A & <i>B</i>]\nPlain <i>Voice</i> tail';
		const ranges = resolveVoiceGroupRanges(parseDocument(text), [
			performer('a', 'A', 0),
			performer('b', 'B', 1)
		]);
		const highlightedText = ranges.map((range) => ({
			text: text.slice(range.from, range.to),
			ids: range.group.performerIds
		}));

		expect(highlightedText).toEqual([
			{ text: 'Plain', ids: ['a'] },
			{ text: 'Voice', ids: ['b'] },
			{ text: 'tail', ids: ['a'] }
		]);
		expect(highlightedText.some((range) => range.text.includes('<i>'))).toBe(false);
	});

	test('resolves exact names and aliases only, while decoding generated entities', () => {
		const roster = [
			performer('avery', 'Avery', 0),
			performer('echo', 'Echo & The Glass', 1),
			{ ...performer('alias', 'Blair', 2), aliases: ['B.'] }
		];

		const caseOnly = resolveVoiceGroupRanges(
			parseDocument('[Chorus: avery]\nLine'),
			roster
		);
		expect(caseOnly[0]?.group.performerIds).toEqual([]);

		const entityName = resolveVoiceGroupRanges(
			parseDocument('[Chorus: Echo &amp; The Glass]\nLine'),
			roster
		);
		expect(entityName[0]?.group.performerIds).toEqual(['echo']);

		const joint = resolveVoiceGroupRanges(
			parseDocument(
				'[Chorus: <i>Echo &amp; The Glass & B.</i>]\n<i>Joint line</i>'
			),
			roster
		);
		expect(joint[0]?.group.performerIds).toEqual(['echo', 'alias']);
	});
});
