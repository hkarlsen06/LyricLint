import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { AtomicDocumentEdit, PerformerRecord, Section, TextEdit } from '$lib/core/types.js';
import { serializeLegend } from '$lib/serialization/genius-markup.js';
import {
	allocateStyleSlot,
	analyzeSlotOrder,
	assignmentNeedsSectionVoice,
	assignVoiceGroup,
	assignVoiceLegend,
	cleanupLegendSlots,
	extractPerformers,
	findExactPerformer,
	insertSectionHeader,
	makeVoiceGroupKey,
	normalizePerformerKey,
	removeDifferentiation,
	suggestPerformerMatches
} from './index.js';

interface LyricFixture {
	id: string;
	input: string;
	performers: string[];
	expectedOutput?: string;
	selection?: { text: string; voiceGroup: string[] };
}

const fixtures = JSON.parse(
	readFileSync(resolve(process.cwd(), 'fixtures/lyrics/cases.json'), 'utf8')
) as LyricFixture[];

function fixture(id: string): LyricFixture {
	const found = fixtures.find((candidate) => candidate.id === id);
	if (!found) {
		throw new Error(`Missing fixture: ${id}`);
	}
	return found;
}

function roster(names: readonly string[]): PerformerRecord[] {
	return names.map((displayName, order) => ({
		id: `performer-${order + 1}`,
		displayName,
		normalizedKey: normalizePerformerKey(displayName),
		aliases: [],
		colorId: `performer-${order + 1}`,
		order
	}));
}

function applyEdits(text: string, edits: readonly TextEdit[]): string {
	let result = text;
	for (const edit of [...edits].sort((left, right) => right.from - left.from)) {
		result = `${result.slice(0, edit.from)}${edit.insert}${result.slice(edit.to)}`;
	}
	return result;
}

function inverseEdit(original: string, atomic: AtomicDocumentEdit): AtomicDocumentEdit {
	let delta = 0;
	const edits = atomic.edits.map((edit) => {
		const from = edit.from + delta;
		const inverse = {
			from,
			to: from + edit.insert.length,
			insert: original.slice(edit.from, edit.to)
		};
		delta += edit.insert.length - (edit.to - edit.from);
		return inverse;
	});
	return { baseRevision: atomic.baseRevision + 1, edits };
}

describe('performer identity', () => {
	it('normalizes for matching without stripping meaningful characters', () => {
		const source = '  Écho, [A&B] <Lead>  ';
		const normalized = normalizePerformerKey(source);

		expect(normalized).toBe('écho, [a&b] <lead>');
		expect(source).toBe('  Écho, [A&B] <Lead>  ');
	});

	it('uses exact names and aliases while returning casing as suggestions only', () => {
		const records = roster(['Avery']);
		records[0]?.aliases.push('A. Ray');

		expect(findExactPerformer('Avery', records)?.id).toBe(records[0]?.id);
		expect(findExactPerformer('A. Ray', records)?.id).toBe(records[0]?.id);
		expect(findExactPerformer('avery', records)).toBeUndefined();
		expect(suggestPerformerMatches('avery', records)[0]).toMatchObject({
			performerId: records[0]?.id,
			reason: 'case'
		});
	});

	it('creates an order-independent group key from the performer-ID set', () => {
		expect(makeVoiceGroupKey(['b', 'a', 'a'])).toBe(makeVoiceGroupKey(['a', 'b']));
	});
});

describe('performer import extraction', () => {
	it.each(['valid-joint-voice-group', 'valid-four-voice-slots'])(
		'correlates header groups and inline slots for %s',
		(id) => {
			const source = fixture(id);
			const extraction = extractPerformers(parseDocument(source.input), roster(source.performers));

			expect(extraction.rosterAdditions).toHaveLength(0);
			expect(extraction.unresolvedVoiceGroups).toHaveLength(0);
			expect(extraction.voiceGroups.map((group) => group.styleSlot)).toEqual(
				id === 'valid-four-voice-slots' ? [1, 2, 3, 4] : [1, 2]
			);
		}
	);

	it('resolves a known ampersand name as one performer, not a joint group', () => {
		const source = fixture('performer-name-with-ampersand');
		const records = roster(source.performers);
		const extraction = extractPerformers(parseDocument(source.input), records);

		expect(extraction.voiceGroups).toHaveLength(1);
		expect(extraction.voiceGroups[0]?.performerIds).toEqual([records[0]?.id]);
		expect(extraction.voiceGroups[0]?.rawNameText).toBe('Echo & The Glass');
	});

	it('round-trips a joint group containing an ampersand-bearing performer name', () => {
		const records = roster(['Echo & The Glass', 'A']);
		const legend = serializeLegend([{ styleSlot: 1, members: [records[0]!, records[1]!] }]);
		const extraction = extractPerformers(parseDocument(`[Chorus: ${legend}]\nLine`), records);

		expect(legend).toBe('Echo &amp; The Glass & A');
		expect(extraction.rosterAdditions).toEqual([]);
		expect(extraction.voiceGroups).toHaveLength(1);
		expect(extraction.voiceGroups[0]?.performerIds).toEqual([records[0]?.id, records[1]?.id]);
	});

	it('preserves comma, bracket, ampersand, and HTML-significant exact names', () => {
		const names = ['Doe, Jane', 'Bracket [Live]', 'Echo & The Glass', 'A <B> & C'];
		const inputs = [
			'[Verse: Doe, Jane]\nLine',
			'[Verse: Bracket [Live]]\nLine',
			'[Verse: Echo & The Glass]\nLine',
			'[Verse: A &lt;B&gt; &amp; C]\nLine'
		];

		for (const [index, input] of inputs.entries()) {
			const records = roster([names[index] ?? '']);
			const extraction = extractPerformers(parseDocument(input ?? ''), records);
			expect(extraction.voiceGroups, names[index]).toHaveLength(1);
			expect(extraction.voiceGroups[0]?.performerIds, names[index]).toEqual([records[0]?.id]);
			expect(extraction.rosterAdditions, names[index]).toHaveLength(0);
		}
	});

	it('adds a differently cased identity and suggests rather than auto-merging', () => {
		const records = roster(['avery']);
		const extraction = extractPerformers(parseDocument('[Verse: Avery]\nLine'), records);

		expect(extraction.rosterAdditions.map((performer) => performer.displayName)).toEqual(['Avery']);
		expect(extraction.voiceGroups[0]?.performerIds).not.toEqual([records[0]?.id]);
		expect(extraction.suggestions[0]).toMatchObject({
			importedName: 'Avery',
			performerId: records[0]?.id,
			reason: 'case'
		});
	});

	it('creates an unresolved voice record for inline style without a header mapping', () => {
		const source = fixture('inline-style-without-legend');
		const extraction = extractPerformers(parseDocument(source.input), roster(source.performers));

		expect(extraction.unresolvedVoiceGroups).toHaveLength(1);
		expect(extraction.unresolvedVoiceGroups[0]).toMatchObject({
			styleSlot: 2,
			rawNameText: 'Unresolved voice 2'
		});
		expect(extraction.rosterAdditions.at(-1)?.displayName).toBe('Unresolved voice 2');
	});
});

describe('section-local style allocation', () => {
	function group(ids: string[], styleSlot: 1 | 2 | 3 | 4) {
		return {
			id: makeVoiceGroupKey(ids),
			performerIds: ids,
			styleSlot
		};
	}

	it('keeps established slots stable as line counts change and D is added', () => {
		const groups = [group(['a'], 1), group(['b'], 2), group(['c'], 3)];
		const section: Section = {
			from: 0,
			to: 0,
			language: 'en',
			voiceGroups: groups,
			lines: []
		};

		expect(allocateStyleSlot(section, makeVoiceGroupKey(['a']))).toEqual({
			status: 'existing',
			styleSlot: 1
		});
		expect(allocateStyleSlot(section, makeVoiceGroupKey(['b']))).toEqual({
			status: 'existing',
			styleSlot: 2
		});
		expect(allocateStyleSlot(section, makeVoiceGroupKey(['c']))).toEqual({
			status: 'existing',
			styleSlot: 3
		});
		expect(allocateStyleSlot(section, makeVoiceGroupKey(['d']))).toEqual({
			status: 'available',
			styleSlot: 4
		});
	});

	it('counts a joint group as one slot and reports an unavailable fifth group', () => {
		const section: Section = {
			from: 0,
			to: 0,
			language: 'en',
			voiceGroups: [
				group(['a', 'b'], 1),
				group(['c'], 2),
				group(['d'], 3),
				group(['e'], 4),
				group(['f'], 1)
			],
			lines: []
		};

		expect(allocateStyleSlot(section, makeVoiceGroupKey(['a', 'b']))).toEqual({
			status: 'existing',
			styleSlot: 1
		});
		expect(analyzeSlotOrder(section).at(-1)).toMatchObject({
			kind: 'unavailable',
			reason: 'unavailable-fifth-slot'
		});
	});
});

describe('performer assignment transforms', () => {
	it('reproduces selection-transform-seed atomically and maps the semantic selection', () => {
		const source = fixture('selection-transform-seed');
		const records = roster(source.performers);
		const selectedText = source.selection?.text ?? '';
		const from = source.input.indexOf(selectedText);
		const result = assignVoiceGroup({
			revision: 7,
			text: source.input,
			document: parseDocument(source.input),
			selection: { anchor: from, head: from + selectedText.length },
			performerIds: [records[1]?.id ?? ''],
			roster: records
		});

		expect(result.status).toBe('applied');
		if (result.status !== 'applied') {
			throw new Error(`Assignment blocked: ${result.reason}`);
		}
		const output = applyEdits(source.input, result.edit.edits);
		expect(result.edit.baseRevision).toBe(7);
		expect(result.edit.edits).toHaveLength(2);
		expect(output).toBe(source.expectedOutput);
		expect(output.slice(result.edit.selectionAfter?.anchor, result.edit.selectionAfter?.head)).toBe(
			selectedText
		);

		const reparsedOutput = parseDocument(output);
		expect(reparsedOutput.text).toBe(output);
		const restored = applyEdits(output, inverseEdit(source.input, result.edit).edits);
		expect(parseDocument(restored).text).toBe(source.input);
	});

	it('merges adjacent equivalent spans while preserving unselected content', () => {
		const input = '[Verse: A & <i>B</i>]\n<i>Hello</i>world';
		const records = roster(['A', 'B']);
		const from = input.indexOf('world');
		const result = assignVoiceGroup({
			revision: 1,
			text: input,
			document: parseDocument(input),
			selection: { anchor: from, head: from + 'world'.length },
			performerIds: [records[1]?.id ?? ''],
			roster: records
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(applyEdits(input, result.edit.edits)).toBe('[Verse: A & <i>B</i>]\n<i>Helloworld</i>');
		}
	});

	// A first legend group landing in italic is a legend that does not begin at
	// plain, which `performer.style-order` flags and cannot fix: the only reorder
	// available to one group hands it the unstyled lyrics it was distinguished
	// from. The picker asks for the missing voice instead of writing that.
	describe('section voice', () => {
		const partial = '[Verse]\nFirst line\nSecond line';
		const partialRange = {
			anchor: partial.indexOf('Second'),
			head: partial.indexOf('Second') + 'Second line'.length
		};

		it('is needed when unstyled lyrics would stay behind with nobody named', () => {
			expect(assignmentNeedsSectionVoice(parseDocument(partial), partialRange)).toBe(true);
		});

		it('is not needed when the section already names its plain voice', () => {
			const named = '[Verse: A]\nFirst line\nSecond line';
			const from = named.indexOf('Second');
			expect(
				assignmentNeedsSectionVoice(parseDocument(named), {
					anchor: from,
					head: from + 'Second line'.length
				})
			).toBe(false);
		});

		it('is not needed when the selection leaves no unstyled lyrics behind', () => {
			const from = partial.indexOf('First');
			expect(
				assignmentNeedsSectionVoice(parseDocument(partial), { anchor: from, head: partial.length })
			).toBe(false);
		});

		it('writes the answer into the plain slot ahead of the styled group', () => {
			const records = roster(['A', 'B']);
			const result = assignVoiceGroup({
				revision: 1,
				text: partial,
				document: parseDocument(partial),
				selection: partialRange,
				performerIds: [records[1]?.id ?? ''],
				sectionPerformerIds: [records[0]?.id ?? ''],
				roster: records
			});

			expect(result.status).toBe('applied');
			if (result.status === 'applied') {
				expect(applyEdits(partial, result.edit.edits)).toBe(
					'[Verse: A & <i>B</i>]\nFirst line\n<i>Second line</i>'
				);
			}
		});

		// `[Chorus: Frikk & <i>Frikk</i>]` — two legend groups, one singer, and a
		// passage wrapped to distinguish someone from themselves.
		it('writes one plain group when the same voice sings the selection and the rest', () => {
			const records = roster(['A', 'B']);
			const result = assignVoiceGroup({
				revision: 1,
				text: partial,
				document: parseDocument(partial),
				selection: partialRange,
				performerIds: [records[1]?.id ?? ''],
				sectionPerformerIds: [records[1]?.id ?? ''],
				roster: records
			});

			expect(result.status).toBe('applied');
			if (result.status === 'applied') {
				const output = applyEdits(partial, result.edit.edits);
				expect(output).toBe('[Verse: B]\nFirst line\nSecond line');
				expect(
					output.slice(result.edit.selectionAfter?.anchor, result.edit.selectionAfter?.head)
				).toBe('Second line');
			}
		});

		it('leaves the legend as it was when the voice is named later', () => {
			const records = roster(['A', 'B']);
			const result = assignVoiceGroup({
				revision: 1,
				text: partial,
				document: parseDocument(partial),
				selection: partialRange,
				performerIds: [records[1]?.id ?? ''],
				roster: records
			});

			expect(result.status).toBe('applied');
			if (result.status === 'applied') {
				expect(applyEdits(partial, result.edit.edits)).toBe(
					'[Verse: <i>B</i>]\nFirst line\n<i>Second line</i>'
				);
			}
		});
	});

	it('reuses the plain slot when replacing the performer across the whole section', () => {
		const input = '[Verse: A]\nFirst line\nSecond line';
		const records = roster(['A', 'B']);
		const from = input.indexOf('First line');
		const to = input.length;
		const result = assignVoiceGroup({
			revision: 1,
			text: input,
			document: parseDocument(input),
			selection: { anchor: from, head: to },
			performerIds: [records[1]?.id ?? ''],
			roster: records
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			const output = applyEdits(input, result.edit.edits);
			expect(output).toBe('[Verse: B]\nFirst line\nSecond line');
			expect(
				output.slice(result.edit.selectionAfter?.anchor, result.edit.selectionAfter?.head)
			).toBe('First line\nSecond line');
		}
	});

	it('does not introduce italic markup when a joint group replaces a prior partial assignment', () => {
		const input =
			'[Pre-Chorus]\nTrenger ikke at du dør for meg\n' +
			'Eller smiler når du møter meg\nMen vi står her igjen';
		const records = roster(['Leif Tore', 'Lars Ulrik', 'Leif Terje']);
		const firstFrom = input.indexOf('Trenger');
		const firstAssignment = assignVoiceGroup({
			revision: 1,
			text: input,
			document: parseDocument(input),
			selection: { anchor: firstFrom, head: firstFrom + 'Trenger'.length },
			performerIds: [records[0]!.id],
			roster: records
		});

		expect(firstAssignment.status).toBe('applied');
		if (firstAssignment.status !== 'applied') {
			throw new Error(`Initial assignment blocked: ${firstAssignment.reason}`);
		}
		const withFirstPerformer = applyEdits(input, firstAssignment.edit.edits);
		const sectionFrom = withFirstPerformer.indexOf('Trenger');
		const replacement = assignVoiceGroup({
			revision: 2,
			text: withFirstPerformer,
			document: parseDocument(withFirstPerformer),
			selection: { anchor: sectionFrom, head: withFirstPerformer.length },
			performerIds: records.map((performer) => performer.id),
			roster: records
		});

		expect(replacement.status).toBe('applied');
		if (replacement.status === 'applied') {
			const output = applyEdits(withFirstPerformer, replacement.edit.edits);
			expect(output).toBe(
				'[Pre-Chorus: Leif Tore & Lars Ulrik & Leif Terje]\n' +
					'Trenger ikke at du dør for meg\n' +
					'Eller smiler når du møter meg\nMen vi står her igjen'
			);
			expect(output).not.toContain('<i>');
			expect(
				parseDocument(output).sections[0]?.header?.legendGroups.map((group) => group.styleSlot)
			).toEqual([1]);
			expect(cleanupLegendSlots(parseDocument(output))).toEqual([]);
		}
	});

	it('blocks a fifth group with explicit options and no edit', () => {
		const source = fixture('too-many-voice-groups');
		const records = roster([...source.performers, 'F']);
		const from = source.input.indexOf('One');
		const result = assignVoiceGroup({
			revision: 1,
			text: source.input,
			document: parseDocument(source.input),
			selection: { anchor: from, head: from + 3 },
			performerIds: [records.at(-1)?.id ?? ''],
			roster: records
		});

		expect(result).toEqual({
			status: 'blocked',
			reason: 'too-many-groups',
			blocked: 'too-many-groups',
			options: ['merge', 'split', 'remove-differentiation', 'cancel']
		});
		expect('edit' in result).toBe(false);
		expect(source.input).toBe(fixture('too-many-voice-groups').input);
	});

	it('expands a partial combining-mark selection to the whole grapheme', () => {
		const source = fixture('emoji-and-combining-marks');
		const records = roster([...source.performers, 'Blair']);
		const graphemeFrom = source.input.indexOf('é');
		const result = assignVoiceGroup({
			revision: 1,
			text: source.input,
			document: parseDocument(source.input),
			selection: { anchor: graphemeFrom, head: graphemeFrom + 1 },
			performerIds: [records[1]?.id ?? ''],
			roster: records
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			const output = applyEdits(source.input, result.edit.edits);
			expect(output).toContain('Caf<i>é</i> lights');
			expect(
				output.slice(result.edit.selectionAfter?.anchor, result.edit.selectionAfter?.head)
			).toBe('é');
		}
	});

	it('returns no edit for a whitespace-only selection', () => {
		const input = '[Verse: A]\nA line';
		const records = roster(['A']);
		const from = input.indexOf(' ');
		const result = assignVoiceGroup({
			revision: 1,
			text: input,
			document: parseDocument(input),
			selection: { anchor: from, head: from + 1 },
			performerIds: [records[0]?.id ?? ''],
			roster: records
		});

		expect(result).toEqual({ status: 'blocked', reason: 'whitespace-selection' });
		expect('edit' in result).toBe(false);
	});

	it('uses the current lyric line for an explicit caret-only assignment', () => {
		const input = '[Verse: A]\nWhole line';
		const records = roster(['A', 'B']);
		const caret = input.indexOf('line');
		const result = assignVoiceGroup({
			revision: 1,
			text: input,
			document: parseDocument(input),
			selection: { anchor: caret, head: caret },
			performerIds: [records[1]?.id ?? ''],
			roster: records
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(applyEdits(input, result.edit.edits)).toBe('[Verse: B]\nWhole line');
		}
	});

	it('blocks a selection spanning section boundaries without an edit', () => {
		const input = '[Verse: A]\nFirst\n\n[Chorus: A]\nSecond';
		const records = roster(['A']);
		const result = assignVoiceGroup({
			revision: 1,
			text: input,
			document: parseDocument(input),
			selection: {
				anchor: input.indexOf('First'),
				head: input.indexOf('Second') + 'Second'.length
			},
			performerIds: [records[0]?.id ?? ''],
			roster: records
		});

		expect(result).toEqual({ status: 'blocked', reason: 'cross-section' });
		expect('edit' in result).toBe(false);
	});

	it('does not apply an empty edit when assigning the existing performer again', () => {
		const input = '[Verse: A & <i>B</i>]\n<i>Hello</i>';
		const records = roster(['A', 'B']);
		const from = input.indexOf('Hello');
		const result = assignVoiceGroup({
			revision: 1,
			text: input,
			document: parseDocument(input),
			selection: { anchor: from, head: from + 'Hello'.length },
			performerIds: [records[1]!.id],
			roster: records
		});

		expect(result).toEqual({ status: 'blocked', reason: 'invalid-range' });
		expect('edit' in result).toBe(false);
	});

	it('removes a fully selected multiline voice while retaining its legend when an ad-lib remains', () => {
		const input =
			'[Verse: A & <i>B</i>]\nA line (<i>Ad-lib</i>)\n<i>First B line\nSecond B line</i>';
		const records = roster(['A', 'B']);
		const from = input.indexOf('<i>First B line');
		const to = input.indexOf('</i>', from) + '</i>'.length;
		const result = assignVoiceGroup({
			revision: 1,
			text: input,
			document: parseDocument(input),
			selection: { anchor: from, head: to },
			performerIds: [],
			roster: records
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			const output = applyEdits(input, result.edit.edits);
			expect(output).toBe(
				'[Verse: A & <i>B</i>]\nA line (<i>Ad-lib</i>)\nFirst B line\nSecond B line'
			);
			expect(cleanupLegendSlots(parseDocument(output))).toEqual([]);
			expect(
				output.slice(result.edit.selectionAfter?.anchor, result.edit.selectionAfter?.head)
			).toBe('First B line\nSecond B line');
		}
	});

	it('makes an unused performer legend eligible for cleanup after removing its only voice', () => {
		const input = '[Verse: A & <i>B</i>]\nA line\n<i>Only B line</i>';
		const records = roster(['A', 'B']);
		const from = input.indexOf('Only B line');
		const result = assignVoiceGroup({
			revision: 1,
			text: input,
			document: parseDocument(input),
			selection: { anchor: from, head: from + 'Only B line'.length },
			performerIds: [],
			roster: records
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			const withoutFormatting = applyEdits(input, result.edit.edits);
			const cleaned = applyEdits(
				withoutFormatting,
				cleanupLegendSlots(parseDocument(withoutFormatting))
			);
			expect(cleaned).toBe('[Verse: A]\nA line\nOnly B line');
		}
	});

	it('assigns the plain and unresolved styled voices with one header-only edit', () => {
		const input = '[Verse: Avery]\nAvery leads\n<i>Blair answers\nStill Blair</i>';
		const records = roster(['Avery', 'Blair']);
		const result = assignVoiceLegend({
			revision: 8,
			text: input,
			document: parseDocument(input),
			sectionFrom: 0,
			assignments: [
				{ styleSlot: 1, performerIds: [records[0]!.id] },
				{ styleSlot: 2, performerIds: [records[1]!.id] }
			],
			roster: records
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(result.edit.baseRevision).toBe(8);
			expect(result.edit.edits).toHaveLength(1);
			expect(applyEdits(input, result.edit.edits)).toBe(
				'[Verse: Avery & <i>Blair</i>]\nAvery leads\n<i>Blair answers\nStill Blair</i>'
			);
		}
	});

	it('promotes a styled-only section to plain by unwrapping it in the same edit', () => {
		// The section has no plain lyrics, so its single voice belongs in slot 1.
		// Keeping the wrappers would leave an italic legend group with no plain
		// group before it — `performer.style-order` right after the assignment.
		const input = '[Verse]\n<i>Blair sings\nBlair wakes the pines</i>';
		const records = roster(['Avery', 'Blair']);
		const result = assignVoiceLegend({
			revision: 3,
			text: input,
			document: parseDocument(input),
			sectionFrom: 0,
			assignments: [{ styleSlot: 1, performerIds: [records[1]!.id] }],
			roster: records,
			unwrapSlots: [2]
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(applyEdits(input, result.edit.edits)).toBe(
				'[Verse: Blair]\nBlair sings\nBlair wakes the pines'
			);
		}
	});

	it('drops the legend group of a slot whose markup the assignment removes', () => {
		const input = '[Verse: <i>Blair</i>]\n<i>Blair sings</i>';
		const records = roster(['Avery', 'Blair']);
		const result = assignVoiceLegend({
			revision: 1,
			text: input,
			document: parseDocument(input),
			sectionFrom: 0,
			assignments: [{ styleSlot: 1, performerIds: [records[1]!.id] }],
			roster: records,
			unwrapSlots: [2]
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(applyEdits(input, result.edit.edits)).toBe('[Verse: Blair]\nBlair sings');
		}
	});

	it('blocks unwrapping a slot the same assignment writes a legend group for', () => {
		const input = '[Verse]\n<i>Blair sings</i>';
		const records = roster(['Blair']);
		const result = assignVoiceLegend({
			revision: 1,
			text: input,
			document: parseDocument(input),
			sectionFrom: 0,
			assignments: [{ styleSlot: 2, performerIds: [records[0]!.id] }],
			roster: records,
			unwrapSlots: [2]
		});

		expect(result.status).toBe('blocked');
	});

	it('leaves a styled-only section untouched when its markup is malformed', () => {
		const input = '[Verse]\n<i>Blair sings\n<u>Blair wakes</u>';
		const records = roster(['Blair']);
		const result = assignVoiceLegend({
			revision: 1,
			text: input,
			document: parseDocument(input),
			sectionFrom: 0,
			assignments: [{ styleSlot: 1, performerIds: [records[0]!.id] }],
			roster: records,
			unwrapSlots: [2]
		});

		expect(result.status).toBe('blocked');
	});

	it.each(['<u>X</u>', '<i>X'])(
		'blocks assignment anywhere on a line containing unsupported or malformed markup: %s',
		(line) => {
			const input = `[Verse: A & <i>B</i>]\n${line}`;
			const records = roster(['A', 'B']);
			const from = input.indexOf('X');
			const result = assignVoiceGroup({
				revision: 1,
				text: input,
				document: parseDocument(input),
				selection: { anchor: from, head: from + 1 },
				performerIds: [records[1]!.id],
				roster: records
			});

			expect(result.status).toBe('blocked');
			expect('edit' in result).toBe(false);
		}
	);
});

describe('section transforms', () => {
	it('inserts a chosen header in one atomic edit', () => {
		const input = '[Verse]\nFirst\n\nOrphan line';
		const document = parseDocument(input);
		const section = document.sections[1];
		const result = insertSectionHeader({
			revision: 3,
			text: input,
			document,
			sectionFrom: section?.from ?? -1,
			headerName: 'Chorus',
			ordinal: 2
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(result.edit.edits).toHaveLength(1);
			expect(applyEdits(input, result.edit.edits)).toBe(
				'[Verse]\nFirst\n\n[Chorus 2]\nOrphan line'
			);
		}
	});

	it('renumbers matching later verses as part of the same atomic insertion', () => {
		const input =
			'[Vers 1]\nFirst\n\nMissing verse\n\n[Refreng]\nHook\n\n' +
			'[Vers 2: A & <i>B</i>]\nSecond\n\n[Vers 3]\nThird';
		const document = parseDocument(input);
		const section = document.sections.find((candidate) =>
			candidate.lines.some((line) => line.text === 'Missing verse')
		);
		const result = insertSectionHeader({
			revision: 8,
			text: input,
			document,
			sectionFrom: section?.from ?? -1,
			headerName: 'Vers',
			ordinal: 2,
			numberedHeaderTerms: ['Vers']
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(result.edit.baseRevision).toBe(8);
			expect(result.edit.edits).toHaveLength(3);
			expect(applyEdits(input, result.edit.edits)).toBe(
				'[Vers 1]\nFirst\n\n[Vers 2]\nMissing verse\n\n[Refreng]\nHook\n\n' +
					'[Vers 3: A & <i>B</i>]\nSecond\n\n[Vers 4]\nThird'
			);
		}
	});

	it('does not renumber earlier or differently named numbered sections', () => {
		const input = '[Vers 2]\nEarlier\n\nMissing verse\n\n[Chorus 2]\nHook\n\n[Vers 3]\nLater';
		const document = parseDocument(input);
		const section = document.sections.find((candidate) =>
			candidate.lines.some((line) => line.text === 'Missing verse')
		);
		const result = insertSectionHeader({
			revision: 9,
			text: input,
			document,
			sectionFrom: section?.from ?? -1,
			headerName: 'Vers',
			ordinal: 3,
			numberedHeaderTerms: ['Vers']
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(applyEdits(input, result.edit.edits)).toBe(
				'[Vers 2]\nEarlier\n\n[Vers 3]\nMissing verse\n\n[Chorus 2]\nHook\n\n[Vers 4]\nLater'
			);
		}
	});

	it('writes a chosen name into the brackets an empty header already has', () => {
		for (const [input, expected] of [
			['[]\nA lyric', '[Chorus 2]\nA lyric'],
			['[ ]\nA lyric', '[Chorus 2]\nA lyric'],
			// A legend is a decision about voices, and naming the part is not a
			// reason to take it away.
			['[: Ari]\nA lyric', '[Chorus 2: Ari]\nA lyric']
		]) {
			const document = parseDocument(input ?? '');
			const result = insertSectionHeader({
				revision: 3,
				text: input ?? '',
				document,
				sectionFrom: document.sections[0]?.from ?? -1,
				headerName: 'Chorus',
				ordinal: 2
			});

			expect(result.status, input).toBe('applied');
			if (result.status === 'applied') {
				// One edit, so filling the brackets is one undo — and no second
				// header line opened above the one the user typed.
				expect(result.edit.edits, input).toHaveLength(1);
				expect(applyEdits(input ?? '', result.edit.edits), input).toBe(expected);
			}
		}
	});

	it('renumbers later verses when an empty header is the one being named', () => {
		const input = '[]\nFirst\n\n[Verse 2]\nSecond';
		const document = parseDocument(input);
		const result = insertSectionHeader({
			revision: 6,
			text: input,
			document,
			sectionFrom: document.sections[0]?.from ?? -1,
			headerName: 'Verse',
			ordinal: 2,
			numberedHeaderTerms: ['Verse']
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(applyEdits(input, result.edit.edits)).toBe('[Verse 2]\nFirst\n\n[Verse 3]\nSecond');
		}
	});

	it('refuses to overwrite a header that already names its part', () => {
		const input = '[Verse]\nA lyric';
		const document = parseDocument(input);
		expect(
			insertSectionHeader({
				revision: 3,
				text: input,
				document,
				sectionFrom: document.sections[0]?.from ?? -1,
				headerName: 'Chorus'
			}).status
		).toBe('blocked');
	});

	it('refuses an unclosed header, which is a bracket to finish rather than a name to fill', () => {
		const input = '[\nA lyric';
		const document = parseDocument(input);
		expect(
			insertSectionHeader({
				revision: 3,
				text: input,
				document,
				sectionFrom: document.sections[0]?.from ?? -1,
				headerName: 'Chorus'
			}).status
		).toBe('blocked');
	});

	it('removes only supported differentiation as one atomic edit set', () => {
		const input = '[Chorus: A & <i>B</i>]\nA\n<i>B</i>\n<u>Unknown</u>';
		const document = parseDocument(input);
		const result = removeDifferentiation({
			revision: 4,
			text: input,
			document,
			sectionFrom: document.sections[0]?.from ?? -1
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(result.edit.baseRevision).toBe(4);
			expect(applyEdits(input, result.edit.edits)).toBe('[Chorus]\nA\nB\n<u>Unknown</u>');
		}
	});

	it('removes supported differentiation spanning physical lyric lines', () => {
		const input = '[Chorus: A & <i>B</i>]\nA\n<i>First\nMiddle\nLast</i>';
		const document = parseDocument(input);
		const result = removeDifferentiation({
			revision: 5,
			text: input,
			document,
			sectionFrom: document.sections[0]?.from ?? -1
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(applyEdits(input, result.edit.edits)).toBe('[Chorus]\nA\nFirst\nMiddle\nLast');
		}
	});

	it('uses the line ending nearest the insertion point in a mixed-EOL document', () => {
		const input = '[Verse]\nFirst\r\n\r\nOrphan line';
		const document = parseDocument(input);
		const section = document.sections[1];
		const result = insertSectionHeader({
			revision: 3,
			text: input,
			document,
			sectionFrom: section?.from ?? -1,
			headerName: 'Chorus'
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(applyEdits(input, result.edit.edits)).toBe(
				'[Verse]\nFirst\r\n\r\n[Chorus]\r\nOrphan line'
			);
		}
	});
});
