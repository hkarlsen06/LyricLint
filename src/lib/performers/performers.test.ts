import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../core/parser.js';
import type { AtomicDocumentEdit, PerformerRecord, Section, TextEdit } from '../core/types.js';
import { serializeLegend } from '../serialization/genius-markup.js';
import {
	allocateStyleSlot,
	analyzeSlotOrder,
	assignVoiceGroup,
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
		const legend = serializeLegend([
			{ styleSlot: 1, members: [records[0]!, records[1]!] }
		]);
		const extraction = extractPerformers(parseDocument(`[Chorus: ${legend}]\nLine`), records);

		expect(legend).toBe('Echo &amp; The Glass & A');
		expect(extraction.rosterAdditions).toEqual([]);
		expect(extraction.voiceGroups).toHaveLength(1);
		expect(extraction.voiceGroups[0]?.performerIds).toEqual([
			records[0]?.id,
			records[1]?.id
		]);
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
			expect(applyEdits(input, result.edit.edits)).toBe('[Verse: A & <i>B</i>]\n<i>Whole line</i>');
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
