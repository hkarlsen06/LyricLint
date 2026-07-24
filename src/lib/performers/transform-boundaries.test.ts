import { parseDocument } from '$lib/core/parser.js';
import type {
	AtomicDocumentEdit,
	PerformerRecord,
	SerializedSelection,
	TextEdit
} from '$lib/core/types.js';
import { assignVoiceGroup } from './index.js';
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
		undoSeeds: ['Hello world']
	},
	{
		name: 'leading and trailing whitespace',
		input: `${header} Hello world `,
		selection(input) {
			return { anchor: header.length, head: input.length };
		},
		expected: `${header} <i>Hello world</i> `,
		selectedText: 'Hello world',
		undoSeeds: [' Hello world ']
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
		undoSeeds: ['He<i>llo wo</i>rld']
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
		undoSeeds: ['<i>Hi</i>there<i>!</i>']
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
		undoSeeds: ['A 👩‍🎤 sings']
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
		undoSeeds: ['A 🇳🇴 sings']
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
