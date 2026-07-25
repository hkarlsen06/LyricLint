import { parseDocument } from '$lib/core/parser.js';
import type { AtomicDocumentEdit } from '$lib/core/types.js';
import { currentRuleSet } from '$lib/rules/index.js';
import { describe, expect, test } from 'vitest';
import { createTestWorkbench, performer } from '../test-utils.js';
import {
	buildRuleContext,
	computeDiagnostics,
	orderPerformersByAppearance,
	resolveVoiceGroupRanges
} from './wiring.js';

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

	test('draws a preview requested before the editor could render one', () => {
		const text = '[Verse\nLine';
		const parsed = parseDocument(text);
		const diagnostics = computeDiagnostics(
			parsed,
			buildRuleContext('en', [], currentRuleSet.version, 3)
		);
		const diagnostic = diagnostics.find((candidate) => candidate.fixes?.length);
		const fix = diagnostic?.fixes?.[0];

		const { controller } = createTestWorkbench({ text, revision: 3 });
		controller.onSnapshot({ ...controller.snapshot, revision: 3, parsed, diagnostics });

		// The card that starts expanded previews itself on mount, which happens
		// while the editor is still the bootstrap handle — it cannot draw a diff.
		// Dropping the request there would leave an Apply button with nothing to
		// explain it, so the request waits for the real editor.
		controller.previewFix(diagnostic!, fix!);

		const previewed: AtomicDocumentEdit[] = [];
		controller.setEditorHandle({
			...controller.editor,
			previewAtomic: (edit) => previewed.push(edit)
		});

		expect(previewed).toEqual([fix!.edit]);
	});

	test('keeps literal style wrappers out of plain performer highlight ranges', () => {
		const text = '[Chorus: A & <i>B</i>]\nPlain <i>Voice</i> tail';
		const ranges = resolveVoiceGroupRanges(parseDocument(text), [
			performer('a', 'A', 0),
			performer('b', 'B', 1)
		]);
		const highlightedText = ranges.map((range) => ({
			text: text.slice(range.from, range.to),
			ids: range.group.performerIds,
			legend: range.legend ?? false
		}));

		expect(highlightedText).toEqual([
			{ text: 'A', ids: ['a'], legend: true },
			{ text: 'B', ids: ['b'], legend: true },
			{ text: 'Plain', ids: ['a'], legend: false },
			{ text: 'Voice', ids: ['b'], legend: false },
			{ text: 'tail', ids: ['a'], legend: false }
		]);
		expect(highlightedText.some((range) => range.text.includes('<i>'))).toBe(false);
	});

	test('colors valid multi-line performer markup across every physical line', () => {
		const roster = [performer('mein', 'Mein', 0), performer('krissyb', 'KrissyB', 1)];
		const text =
			'[Vers 1: Mein & <i>KrissyB</i>]\n' +
			'Plain line\n' +
			'Ad lib (<i>La oss</i>)\n' +
			'<i>Open across lines\n' +
			'Interior line\n' +
			'Closing here</i>\n' +
			'Plain again';
		const ranges = resolveVoiceGroupRanges(parseDocument(text), roster);
		const highlighted = ranges.map((range) => ({
			text: text.slice(range.from, range.to),
			ids: range.group.performerIds,
			legend: range.legend ?? false
		}));

		// Genius allows one style wrapper to span physical lyric lines. Every
		// line inside it belongs to the styled performer, while surrounding
		// plain text remains attributed to the first legend slot.
		expect(highlighted).toEqual([
			{ text: 'Mein', ids: ['mein'], legend: true },
			{ text: 'KrissyB', ids: ['krissyb'], legend: true },
			{ text: 'Plain line', ids: ['mein'], legend: false },
			{ text: 'Ad lib (', ids: ['mein'], legend: false },
			{ text: 'La oss', ids: ['krissyb'], legend: false },
			{ text: ')', ids: ['mein'], legend: false },
			{ text: 'Open across lines', ids: ['krissyb'], legend: false },
			{ text: 'Interior line', ids: ['krissyb'], legend: false },
			{ text: 'Closing here', ids: ['krissyb'], legend: false },
			{ text: 'Plain again', ids: ['mein'], legend: false }
		]);
	});

	test('orders the roster by first appearance, with absent performers last', () => {
		const roster = [
			performer('avery', 'Avery', 0),
			performer('blair', 'Blair', 1),
			performer('cleo', 'Cleo', 2)
		];
		const parsed = parseDocument('[Chorus: Blair, <i>Avery</i>]\nBlair line\n<i>Avery line</i>');

		const ordered = orderPerformersByAppearance(parsed, roster);
		expect(ordered.map((entry) => entry.id)).toEqual(['blair', 'avery', 'cleo']);
		// Ordering never rewrites the records themselves (colors stay attached).
		expect(ordered.find((entry) => entry.id === 'avery')).toBe(roster[0]);
	});

	test('resolves exact names and aliases only, while decoding generated entities', () => {
		const roster = [
			performer('avery', 'Avery', 0),
			performer('echo', 'Echo & The Glass', 1),
			{ ...performer('alias', 'Blair', 2), aliases: ['B.'] }
		];

		const caseOnly = resolveVoiceGroupRanges(parseDocument('[Chorus: avery]\nLine'), roster);
		expect(caseOnly[0]?.group.performerIds).toEqual([]);

		const entityName = resolveVoiceGroupRanges(
			parseDocument('[Chorus: Echo &amp; The Glass]\nLine'),
			roster
		);
		expect(entityName[0]?.group.performerIds).toEqual(['echo']);

		const joint = resolveVoiceGroupRanges(
			parseDocument('[Chorus: <i>Echo &amp; The Glass & B.</i>]\n<i>Joint line</i>'),
			roster
		);
		expect(joint[0]?.group.performerIds).toEqual(['echo', 'alias']);
	});
});
