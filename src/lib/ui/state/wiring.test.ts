import { parseDocument } from '$lib/core/parser.js';
import type { AtomicDocumentEdit } from '$lib/core/types.js';
import { currentRuleSet } from '$lib/rules/index.js';
import { describe, expect, test } from 'vitest';
import { createTestWorkbench, performer } from '../test-utils.js';
import {
	buildRuleContext,
	computeDiagnostics,
	filterForEditorState,
	everyLyricLineTimed,
	isTypingChange,
	orderPerformersByAppearance,
	resolveVoiceGroupRanges,
	timedLinesSkippable
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

	test('defers trailing whitespace until the caret leaves its line', () => {
		const text = `[Chorus]\nFirst\u200b \nSecond\n\n[Chorus]\nFirst\u200b \nSecond\n\n[Verse]\nOther  `;
		const parsed = parseDocument(text);
		const diagnostics = computeDiagnostics(
			parsed,
			buildRuleContext('en', [], currentRuleSet.version, 3)
		);
		const firstLine = text.indexOf('First') + 'First'.length;
		const snapshot = {
			...createTestWorkbench({ text, revision: 3 }).controller.snapshot,
			parsed,
			diagnostics,
			selection: { anchor: firstLine, head: firstLine }
		};

		expect(
			filterForEditorState(snapshot, diagnostics, [{ lines: [1, 5] }])
				.filter((diagnostic) => diagnostic.ruleId === 'text.invisible-characters')
				.map((diagnostic) => text.slice(diagnostic.from, diagnostic.to))
		).toEqual(['\u200b', '\u200b', '  ']);
		expect(
			filterForEditorState(
				{ ...snapshot, selection: { anchor: text.length, head: text.length } },
				diagnostics,
				[{ lines: [1, 5] }]
			)
				.filter((diagnostic) => diagnostic.ruleId === 'text.invisible-characters')
				.map((diagnostic) => text.slice(diagnostic.from, diagnostic.to))
		).toEqual(['\u200b', ' ', '\u200b', ' ']);
		expect(
			filterForEditorState(
				{ ...snapshot, selection: { anchor: text.length - 2, head: text.length } },
				diagnostics,
				[{ lines: [1, 5] }]
			)
		).toEqual(diagnostics);
	});

	// A `document`-tier finding is a claim about the shape of the whole song, and
	// the shape of a song being typed is wrong the entire way down. It waits for
	// the typing to stop rather than for the caret to leave a line, because no
	// line is where the answer lives.
	test('holds document-shape findings while the document is being typed', () => {
		const text = '[Verse 1]\nA plain lyric line here';
		const parsed = parseDocument(text);
		const diagnostics = computeDiagnostics(
			parsed,
			buildRuleContext('en', [], currentRuleSet.version, 3)
		);
		const snapshot = {
			...createTestWorkbench({ text, revision: 3 }).controller.snapshot,
			parsed,
			diagnostics,
			selection: { anchor: 0, head: 0 }
		};
		const numbering = (settled: boolean) =>
			filterForEditorState(snapshot, diagnostics, [], { settled }).filter(
				(diagnostic) => diagnostic.ruleId === 'section.verse-numbering'
			).length;

		expect(numbering(false)).toBe(0);
		expect(numbering(true)).toBe(1);
		// Absent the option, a caller is one looking at a document nobody is typing
		// into — a test, or the landing page's demo.
		expect(
			filterForEditorState(snapshot, diagnostics).filter(
				(diagnostic) => diagnostic.ruleId === 'section.verse-numbering'
			).length
		).toBe(1);
	});

	// What separates a song being written from one that arrived whole. Opening a
	// draft, pasting, loading the sample and applying a bulk fix all deliver a
	// finished document in one change, and its shape findings are right at once.
	test('tells typing from text arriving whole', () => {
		expect(isTypingChange('', 'a')).toBe(true);
		expect(isTypingChange('Hold on', 'Hold on ')).toBe(true);
		expect(isTypingChange('Hold on\r', 'Hold on\r\n')).toBe(true);
		// A deletion is typing too — backspacing through a word must not publish a
		// shape finding on every character on the way out.
		expect(isTypingChange('Hold on', 'Hold o')).toBe(true);
		// A paste, a draft opening, the sample.
		expect(isTypingChange('', '[Verse 1]\nA plain lyric line here')).toBe(false);
		expect(isTypingChange('[Verse 1]\nA plain lyric line here', '')).toBe(false);
		// A snapshot that changed nothing is not a change at all; a selection move
		// must not restart the wait.
		expect(isTypingChange('Hold on', 'Hold on')).toBe(false);
	});

	// The rules see a parsed document and nothing else, so a linked group still
	// looks like two identical choruses to them — and linked sections keep
	// identical words by construction, which is the suggestion firing on its own
	// result forever. The links are known here, so the answer is here.
	test('stops suggesting a link once one is made', () => {
		const text = '[Chorus]\nHold the line\n\n[Verse 1]\nA lyric\n\n[Chorus]\nHold the line';
		const parsed = parseDocument(text);
		const diagnostics = computeDiagnostics(
			parsed,
			buildRuleContext('en', [], currentRuleSet.version, 3)
		);
		const snapshot = {
			...createTestWorkbench({ text, revision: 3 }).controller.snapshot,
			parsed,
			diagnostics,
			selection: { anchor: 0, head: 0 }
		};
		const suggested = (links: { lines: number[] }[]) =>
			filterForEditorState(snapshot, diagnostics, links).filter(
				(diagnostic) => diagnostic.ruleId === 'section.unlinked-repeat'
			).length;

		expect(suggested([])).toBe(1);
		// The diagnostic is anchored on the first header, which is line 1.
		expect(suggested([{ lines: [1, 7] }])).toBe(0);
		// A link somewhere else in the song is not an answer to this one.
		expect(suggested([{ lines: [4, 9] }])).toBe(1);
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
		// plain text remains attributed to the first legend slot. The
		// parentheses around the styled ad-lib are notation, like the tag
		// characters beside them, so no range claims them.
		expect(highlighted).toEqual([
			{ text: 'Mein', ids: ['mein'], legend: true },
			{ text: 'KrissyB', ids: ['krissyb'], legend: true },
			{ text: 'Plain line', ids: ['mein'], legend: false },
			{ text: 'Ad lib', ids: ['mein'], legend: false },
			{ text: 'La oss', ids: ['krissyb'], legend: false },
			{ text: 'Open across lines', ids: ['krissyb'], legend: false },
			{ text: 'Interior line', ids: ['krissyb'], legend: false },
			{ text: 'Closing here', ids: ['krissyb'], legend: false },
			{ text: 'Plain again', ids: ['mein'], legend: false }
		]);
	});

	test('leaves parentheses uncolored only where the pair encloses styled content', () => {
		const roster = [performer('a', 'A', 0), performer('b', 'B', 1)];
		const text =
			'[Chorus: A & <i>B</i>]\n' +
			'Lead (<i>Echo</i>) on\n' +
			'Keep (a plain aside) whole\n' +
			'Mixed (inner <i>voice</i>) here\n' +
			'Stray ( <i>solo</i>';
		const ranges = resolveVoiceGroupRanges(parseDocument(text), roster);
		const highlighted = ranges
			.filter((range) => !range.legend)
			.map((range) => ({ text: text.slice(range.from, range.to), ids: range.group.performerIds }));

		expect(highlighted).toEqual([
			// A matched pair around styled content is attribution notation: both
			// parens go unclaimed, in one gesture.
			{ text: 'Lead', ids: ['a'] },
			{ text: 'Echo', ids: ['b'] },
			{ text: 'on', ids: ['a'] },
			// A pair wrapping only plain text is the plain voice's own aside — no
			// hole is punched into a wash that was making a true claim.
			{ text: 'Keep (a plain aside) whole', ids: ['a'] },
			// Mixed content: the parens are neutral while the plain words inside
			// them stay the plain voice's.
			{ text: 'Mixed', ids: ['a'] },
			{ text: 'inner', ids: ['a'] },
			{ text: 'voice', ids: ['b'] },
			{ text: 'here', ids: ['a'] },
			// An unmatched parenthesis is not a pair, so it keeps today's color
			// rather than flickering neutral while a line is being typed.
			{ text: 'Stray (', ids: ['a'] },
			{ text: 'solo', ids: ['b'] }
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

	// What the strip's `Lyrics synced` claims. The lines a run would tap are the
	// editor's own stampable ones, so headers and blanks may not hold the claim
	// back — and an anchor on a header may not stand in for a missing lyric line.
	test('a lyric is timed when every stampable line has an anchor', () => {
		const text = '[Verse 1]\nFirst line\n\nSecond line';
		expect(
			everyLyricLineTimed(text, [
				{ line: 2, time: 1 },
				{ line: 4, time: 5 }
			])
		).toBe(true);
		expect(everyLyricLineTimed(text, [{ line: 2, time: 1 }])).toBe(false);
		expect(
			everyLyricLineTimed(text, [
				{ line: 1, time: 0 },
				{ line: 2, time: 1 }
			])
		).toBe(false);
		// Nothing to tap is not finished work, so the control keeps offering the job.
		expect(everyLyricLineTimed('[Verse 1]\n\n', [])).toBe(false);
		expect(
			everyLyricLineTimed('[Verse 1]\rFirst line\r\rSecond line', [
				{ line: 2, time: 1 },
				{ line: 4, time: 5 }
			])
		).toBe(true);
	});

	// The strip's skip control draws off this answer, and it mirrors the editor's
	// own `lyricSyncSkipTarget`: a skip is real exactly when the first untimed
	// lyric line at or after the caret has a *timed* lyric line between it and the
	// caret — that predecessor is where the jump lands.
	test('timed lines are skippable only when the jump would actually move', () => {
		// Lines: 1 header, then First…Fifth on lines 2–6.
		const text = '[Verse 1]\nFirst\nSecond\nThird\nFourth\nFifth';

		// Everything timed up to a gap at `Fifth`.
		const timedToTheGap = [
			{ line: 2, time: 10 },
			{ line: 3, time: 20 },
			{ line: 4, time: 30 },
			{ line: 5, time: 40 }
		];
		// Two timed lines stand between the caret and the gap: somewhere to go.
		expect(timedLinesSkippable(text, timedToTheGap, text.indexOf('Second'))).toBe(true);
		// The gap is the very next lyric line, which the next tap already times.
		expect(timedLinesSkippable(text, timedToTheGap, text.indexOf('Fourth'))).toBe(false);
		// The caret stands on the gap itself: tap it, do not jump over it.
		expect(timedLinesSkippable(text, timedToTheGap, text.indexOf('Fifth'))).toBe(false);

		// Two gaps, at `Second` and `Fifth` — the split-line song this is for.
		const twoGaps = [
			{ line: 2, time: 10 },
			{ line: 4, time: 30 },
			{ line: 5, time: 40 }
		];
		// Resume already stands directly before the first gap, and a jump to the
		// second would leave the first behind the caret — a line the run never
		// comes back to.
		expect(timedLinesSkippable(text, twoGaps, text.indexOf('First'))).toBe(false);
		// Past the first gap, the second is reachable across the timed lines.
		expect(timedLinesSkippable(text, twoGaps, text.indexOf('Third'))).toBe(true);

		// A wholly untimed song has no timed run-up to land on.
		expect(timedLinesSkippable(text, [], 0)).toBe(false);

		// Structure between the caret and the gap changes nothing: the blank line
		// and the header are not lines a run taps.
		const sectioned = '[Verse 1]\nFirst\nSecond\n\n[Chorus]\nThird';
		expect(
			timedLinesSkippable(
				sectioned,
				[
					{ line: 2, time: 10 },
					{ line: 3, time: 20 }
				],
				sectioned.indexOf('First')
			)
		).toBe(true);
	});
});
