import { parseDocument } from '$lib/core/parser.js';
import type {
	AtomicDocumentEdit,
	PerformerRecord,
	SerializedSelection,
	TextEdit
} from '$lib/core/types.js';
import { assignVoiceGroup, canAssignVoiceGroup } from './index.js';
import { describe, expect, it } from 'vitest';

const header = '[Verse: A & <i>B</i>]\n';

const roster: PerformerRecord[] = ['A', 'B'].map((displayName, order) => ({
	id: displayName,
	displayName,
	normalizedKey: displayName.toLocaleLowerCase(),
	aliases: [],
	colorId: `color-${order}`,
	order
}));

function applyEdits(text: string, edits: readonly TextEdit[]): string {
	let output = text;
	for (const edit of [...edits].sort((left, right) => right.from - left.from)) {
		output = `${output.slice(0, edit.from)}${edit.insert}${output.slice(edit.to)}`;
	}
	return output;
}

function inverseEdits(original: string, atomic: AtomicDocumentEdit): TextEdit[] {
	let delta = 0;
	return atomic.edits.map((edit) => {
		const from = edit.from + delta;
		const inverse = {
			from,
			to: from + edit.insert.length,
			insert: original.slice(edit.from, edit.to)
		};
		delta += edit.insert.length - (edit.to - edit.from);
		return inverse;
	});
}

function visibleText(text: string): string {
	return text.replaceAll(/<\/?(?:i|b)>/gu, '');
}

interface BoundaryCase {
	name: string;
	input: string;
	selection(input: string): SerializedSelection;
	expected: string;
	selectedText: string;
	/**
	 * The exact text each edit replaces — which is what changed and not the line
	 * it was computed over.
	 *
	 * An edit's range is read downstream as a claim about what the user wrote
	 * over: `carryHoles` in `extensions/section-links.ts` keeps a divergent run a
	 * change is contained in and destroys one it merely overlaps, and line
	 * anchors map the same way. A whole-line claim for two inserted tags
	 * therefore mirrored a one-copy ad-lib into every linked chorus. These are
	 * the seeds `narrowEdit` leaves, and each is clamped so the selection stays
	 * inside its own edit — which is why case three keeps the tail it does.
	 */
	undoSeeds: string[];
}

const boundaryCases: BoundaryCase[] = [
	{
		name: 'partial ASCII word',
		input: `${header}Hello world`,
		selection(input) {
			const from = input.indexOf('ell');
			return { anchor: from, head: from + 3 };
		},
		expected: `${header}H<i>ell</i>o world`,
		selectedText: 'ell',
		undoSeeds: ['ell']
	},
	{
		name: 'leading and trailing whitespace',
		input: `${header} Hello world `,
		selection(input) {
			return { anchor: header.length, head: input.length };
		},
		expected: `${header} <i>Hello world</i> `,
		selectedText: 'Hello world',
		undoSeeds: ['Hello world']
	},
	{
		name: 'selection crossing an existing italic span boundary',
		input: `${header}He<i>llo wo</i>rld`,
		selection(input) {
			return {
				anchor: input.indexOf('lo'),
				head: input.indexOf('rld') + 'rld'.length
			};
		},
		expected: `${header}He<i>llo world</i>`,
		selectedText: 'lo world',
		undoSeeds: ['lo wo</i>rld']
	},
	{
		name: 'equivalent spans adjacent on both sides',
		input: `${header}<i>Hi</i>there<i>!</i>`,
		selection(input) {
			const from = input.indexOf('there');
			return { anchor: from, head: from + 'there'.length };
		},
		expected: `${header}<i>Hithere!</i>`,
		selectedText: 'there',
		undoSeeds: ['</i>there<i>']
	},
	{
		name: 'partial ZWJ emoji grapheme',
		input: `${header}A 👩‍🎤 sings`,
		selection(input) {
			const from = input.indexOf('👩‍🎤');
			return { anchor: from + 1, head: from + '👩‍🎤'.length - 1 };
		},
		expected: `${header}A <i>👩‍🎤</i> sings`,
		selectedText: '👩‍🎤',
		undoSeeds: ['👩‍🎤']
	},
	{
		name: 'partial flag grapheme',
		input: `${header}A 🇳🇴 sings`,
		selection(input) {
			const from = input.indexOf('🇳🇴');
			return { anchor: from + 1, head: from + '🇳🇴'.length - 1 };
		},
		expected: `${header}A <i>🇳🇴</i> sings`,
		selectedText: '🇳🇴',
		undoSeeds: ['🇳🇴']
	}
];

describe('destructive performer transform boundaries', () => {
	it.each(boundaryCases)(
		'keeps wrappers and undo bytes exact for $name',
		({ input, selection, expected, selectedText, undoSeeds }) => {
			const result = assignVoiceGroup({
				revision: 41,
				text: input,
				document: parseDocument(input),
				selection: selection(input),
				performerIds: ['B'],
				roster
			});

			expect(result.status).toBe('applied');
			if (result.status !== 'applied') {
				throw new Error(`Boundary transform was blocked: ${result.reason}`);
			}

			const output = applyEdits(input, result.edit.edits);
			expect(output).toBe(expected);
			expect(result.edit.baseRevision).toBe(41);
			expect(result.edit.edits.map((edit) => input.slice(edit.from, edit.to))).toEqual(undoSeeds);
			expect(visibleText(output)).toBe(visibleText(input));
			expect(parseDocument(output).syntaxIssues).toEqual([]);
			expect(
				output.slice(result.edit.selectionAfter?.anchor, result.edit.selectionAfter?.head)
			).toBe(selectedText);
			expect(applyEdits(output, inverseEdits(input, result.edit))).toBe(input);
		}
	);
});

// The picker asks this before it opens itself over a selection nobody invited
// it to, so every `false` here has to be a range `assignVoiceGroup` would have
// refused: a card that could only fail is worse than no card.
describe('canAssignVoiceGroup', () => {
	const text = '[Verse: A]\nFirst line\nSecond line\n\n[Chorus: A]\nThird line';
	const document = parseDocument(text);

	function range(needle: string): SerializedSelection {
		const anchor = text.indexOf(needle);
		return { anchor, head: anchor + needle.length };
	}

	it.each([
		['lyric text', range('First')],
		['a whole lyric line', range('First line')],
		['two lyric lines in one section', range('First line\nSecond line')]
	])('offers an assignment for %s', (_label, selection) => {
		expect(canAssignVoiceGroup(document, selection)).toBe(true);
	});

	it.each([
		['a section header', range('[Verse: A]')],
		['the legend inside a header', range('A]')],
		['a selection crossing two sections', range('Second line\n\n[Chorus: A]\nThird')],
		['whitespace', range('\n\n')]
	])('refuses %s', (_label, selection) => {
		expect(canAssignVoiceGroup(document, selection)).toBe(false);
	});

	// A caret normalizes to its own line, exactly as it does for the transform.
	// Ruling collapsed selections out is the anchor reporter's job and stays
	// there: this answers what a range could take, not whether one was made.
	it('answers for a caret as it does for the line the caret is in', () => {
		expect(canAssignVoiceGroup(document, { anchor: 12, head: 12 })).toBe(true);
		expect(canAssignVoiceGroup(document, { anchor: 2, head: 2 })).toBe(false);
	});

	it('refuses a document with no section header to write the legend into', () => {
		const bare = 'First line\nSecond line';

		expect(canAssignVoiceGroup(parseDocument(bare), { anchor: 0, head: 5 })).toBe(false);
	});

	it.each([
		['a section header', range('[Verse: A]')],
		['a selection crossing two sections', range('Second line\n\n[Chorus: A]\nThird')]
	])('agrees with the transform, which blocks %s', (_label, selection) => {
		const result = assignVoiceGroup({
			revision: 0,
			text,
			document,
			selection,
			performerIds: ['A'],
			roster
		});

		expect(result.status).toBe('blocked');
	});
});
