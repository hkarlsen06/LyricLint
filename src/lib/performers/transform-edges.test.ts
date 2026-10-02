// Edge cases of the performer assignment transforms: selections that land on
// markup boundaries, annotation syntax, or entities must still produce a
// legend and body the linter and the user's next edit agree with.
import { scanAnnotations } from '#lib/core/annotations.js';
import { parseDocument } from '#lib/core/parser.js';
import type {
	AssignmentRequest,
	PerformerRecord,
	SerializedSelection,
	TextEdit
} from '#lib/core/types.js';
import { performerRedundantMarkupRule } from '#lib/rules/catalog/performer-redundant-markup.js';
import { ruleContext } from '#lib/rules/rule-test-utils.js';
import { unaccountedStyledSlots } from './legend-cleanup.js';
import { assignUnknownVoice, assignVoiceGroup, unknownVoiceOffers } from './transform.js';
import { describe, expect, it } from 'vitest';

const roster: PerformerRecord[] = ['A', 'B', 'C', 'D', 'E'].map((displayName, order) => ({
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

function selectionOf(text: string, selected: string, occurrence = 0): SerializedSelection {
	let from = -1;
	for (let index = 0; index <= occurrence; index += 1) {
		from = text.indexOf(selected, from + 1);
	}
	if (from < 0) throw new Error(`Selection ${JSON.stringify(selected)} not found.`);
	return { anchor: from, head: from + selected.length };
}

function assign(
	text: string,
	selection: SerializedSelection,
	performerIds: string[],
	sectionPerformerIds: string[] = []
) {
	const request: AssignmentRequest = {
		revision: 1,
		text,
		document: parseDocument(text),
		selection,
		performerIds,
		roster,
		sectionPerformerIds
	};
	return assignVoiceGroup(request);
}

function appliedText(text: string, result: ReturnType<typeof assignVoiceGroup>): string {
	expect(result.status).toBe('applied');
	return result.status === 'applied' ? applyEdits(text, result.edit.edits) : text;
}

function selectedAfter(next: string, result: ReturnType<typeof assignVoiceGroup>): string {
	const after = result.status === 'applied' ? result.edit.selectionAfter : undefined;
	return after
		? next.slice(Math.min(after.anchor, after.head), Math.max(after.anchor, after.head))
		: '';
}

describe('performer transform edges', () => {
	// A selection end inside a deleted closing tag must still map to a valid
	// offset in the rewritten text, not overshoot it.
	it('Remove formatting over a selection ending inside a closing tag does not throw', () => {
		const text = '[Verse: A & <i>B</i>]\nHello <i>there</i>';
		const result = assign(text, selectionOf(text, 'there</i'), []);
		const next = appliedText(text, result);

		expect(next).toBe('[Verse: A & <i>B</i>]\nHello there');
		expect(selectedAfter(next, result)).toBe('there');
	});

	// The selection retained after unwrapping must cover exactly the unwrapped
	// words, not spill past them onto text the user never selected.
	it('Remove formatting keeps the selection on the unwrapped words', () => {
		const text = '[Verse: A & <i>B</i>]\nHello <i>there</i> world';
		const result = assign(text, selectionOf(text, 'there</i'), []);
		const next = appliedText(text, result);

		expect(next).toBe('[Verse: A & <i>B</i>]\nHello there world');
		expect(selectedAfter(next, result)).toBe('there');
	});

	// No selection, anywhere in a small corpus of songs, may make the
	// assignment transform throw instead of applying or blocking.
	it('no selection over a small corpus makes the assignment transform throw', () => {
		const songs = [
			'[Verse: A]\nHello <i><b>there</b></i> world',
			'[Verse]\n<i>Hello</i> there <b>world</b>',
			'[Verse: A & <i>B</i>]\nHello <i>there</i>'
		];
		const thrown: string[] = [];
		for (const text of songs) {
			const document = parseDocument(text);
			for (let from = 0; from <= text.length; from += 1) {
				for (let to = from; to <= text.length; to += 1) {
					for (const performerIds of [[], ['B']]) {
						try {
							assignVoiceGroup({
								revision: 1,
								text,
								document,
								selection: { anchor: from, head: to },
								performerIds,
								roster
							});
						} catch {
							thrown.push(`${JSON.stringify(text.slice(from, to))} [${performerIds}]`);
						}
					}
				}
			}
		}
		expect(thrown).toEqual([]);
	});

	// A selection holding only markup and whitespace changes no lyrics, so it
	// must never write a legend group for a voice the body ends up not using.
	it('a markup-only selection never writes a legend group', () => {
		const text = '[Verse: A, <i>B</i> & <b>C</b>]\nHello <i>there</i> <b>world</b>';
		const result = assign(text, selectionOf(text, '</i> <'), ['D']);

		expect(result.status).toBe('blocked');
	});

	// Same rule on the unknown-voice path: every offer `unknownVoiceOffers`
	// draws for a markup-only selection must actually apply when pressed.
	it('every unknown-voice offer for a markup-only selection can be carried out', () => {
		const text = '[Verse: A]\nHello <i>there</i> <b>world</b>';
		const document = parseDocument(text);
		const selection = selectionOf(text, '</i> <');
		const offers = unknownVoiceOffers(document, selection);

		const refused: string[] = [];
		if (offers.canAllocateNew) {
			const result = assignUnknownVoice({ revision: 1, text, document, selection });
			if (result.status !== 'applied') refused.push('new');
		}
		for (const styleSlot of offers.existingSlots) {
			const result = assignUnknownVoice({ revision: 1, text, document, selection, styleSlot });
			if (result.status !== 'applied') refused.push(`slot ${styleSlot}`);
		}
		expect(refused).toEqual([]);
	});

	// Annotations are lyrics: a selection ending anywhere inside
	// `[there world](123)`, including on its dimmed delimiters, must leave the
	// annotation intact.
	it('assigning a voice never splits an annotation link', () => {
		const text = '[Verse: A]\nHello [there world](123) end';
		for (const selected of ['[there world]', 'there world]', 'there world](1']) {
			const next = appliedText(text, assign(text, selectionOf(text, selected), ['B']));
			expect(
				scanAnnotations(next).map((annotation) => annotation.id),
				`${selected} => ${next}`
			).toEqual([123]);
		}
	});

	// An annotation's `(123)` is its id, not a parenthetical ad-lib: selecting
	// the id or the parenthesized id must never wrap it in styling, on either
	// the named or the unknown-voice path.
	it('an annotation id is never wrapped as an ad-lib', () => {
		const text = '[Verse: A]\nHello [there world](123) end';
		const document = parseDocument(text);
		for (const selected of ['123', '(123)']) {
			const selection = selectionOf(text, selected);
			const named = assign(text, selection, ['B']);
			const unknown = assignUnknownVoice({ revision: 1, text, document, selection });
			for (const result of [named, unknown]) {
				const next = result.status === 'applied' ? applyEdits(text, result.edit.edits) : text;
				expect(
					scanAnnotations(next).map((annotation) => annotation.id),
					next
				).toEqual([123]);
			}
		}
	});

	// Naming an unknown voice the same performer already carrying the section
	// must resolve it, not leave the selection's styling as an unclaimed
	// unknown voice; answering the same way twice must be idempotent.
	it('naming the whole section one voice leaves no unknown voice in the selection', () => {
		const text = '[Verse]\n<i>Hello</i> there';
		const next = appliedText(text, assign(text, selectionOf(text, 'Hello'), ['A'], ['A']));

		expect(unaccountedStyledSlots(parseDocument(next).sections[0]!)).toEqual([]);
		const again = assign(next, selectionOf(next, 'Hello'), ['A']);
		const afterAgain = again.status === 'applied' ? applyEdits(next, again.edit.edits) : next;
		expect(afterAgain).toBe(next);
	});

	// Extending a voice next to its own existing wrapper must merge into one
	// span, not write the adjacent-wrapper shape `performer.redundant-markup`
	// flags. (Merging across a line break is a known gap left to that rule's
	// safe fix, not covered here.)
	it('extending a voice beside its own wrapper merges instead of writing adjacent wrappers', () => {
		const inline = '[Verse: A & <i>B</i>]\nwell <i>Hello</i> there';
		expect(appliedText(inline, assign(inline, selectionOf(inline, 'there'), ['B']))).toBe(
			'[Verse: A & <i>B</i>]\nwell <i>Hello there</i>'
		);
	});

	describe('joins a wrap to the same voice on the neighbouring line', () => {
		const redundant = (text: string) =>
			performerRedundantMarkupRule.check(parseDocument(text), ruleContext({}));
		const cases: { name: string; text: string; select: string; expected: string }[] = [
			{
				name: 'the line above',
				text: '[Verse: A & <i>B</i>]\nwell <i>Hello</i>\nthere',
				select: 'there',
				expected: '[Verse: A & <i>B</i>]\nwell <i>Hello\nthere</i>'
			},
			{
				name: 'the line below',
				text: '[Verse: A & <i>B</i>]\nwell\n<i>Hello</i> there',
				select: 'well',
				expected: '[Verse: A & <i>B</i>]\n<i>well\nHello</i> there'
			},
			{
				name: 'both lines, around a multi-line selection',
				text: '[Verse: A & <i>B</i>]\n<i>one</i>\ntwo\nthree\n<i>four</i>',
				select: 'two\nthree',
				expected: '[Verse: A & <i>B</i>]\n<i>one\ntwo\nthree\nfour</i>'
			},
			{
				name: 'a line whose own tag already stood at its start',
				text: '[Verse: A & <i>B</i>]\n<i>one</i>\n<i>two</i> three',
				select: 'three',
				expected: '[Verse: A & <i>B</i>]\n<i>one\ntwo three</i>'
			}
		];
		for (const { name, text, select, expected } of cases) {
			it(name, () => {
				const result = assign(text, selectionOf(text, select), ['B']);
				const next = appliedText(text, result);
				expect(next).toBe(expected);
				expect(redundant(next)).toEqual([]);
				expect(selectedAfter(next, result).replaceAll(/<\/?[ib]>/gu, '')).toBe(select);
				// Deterministic: the same answer again changes nothing.
				const again = assign(next, selectionOf(next, select.split('\n')[0]!), ['B']);
				expect(again.status === 'blocked' || appliedText(next, again) === next).toBe(true);
			});
		}

		it('does not join past a line another voice sings', () => {
			const text = '[Verse: A & <i>B</i>]\n<i>Hello</i>\nplain\nthere';
			expect(appliedText(text, assign(text, selectionOf(text, 'there'), ['B']))).toBe(
				'[Verse: A & <i>B</i>]\n<i>Hello</i>\nplain\n<i>there</i>'
			);
		});

		it('does not join italic to a bold-italic neighbour', () => {
			const text = '[Verse: A, <i>B</i> & <i><b>C</b></i>]\n<i><b>Hello</b></i>\nthere';
			expect(appliedText(text, assign(text, selectionOf(text, 'there'), ['B']))).toBe(
				'[Verse: A, <i>B</i> & <i><b>C</b></i>]\n<i><b>Hello</b></i>\n<i>there</i>'
			);
		});

		it('joins an unknown voice to the same unknown voice above it', () => {
			const text = '[Verse: A]\nwell\n<i>Hello</i>\nthere';
			const result = assignUnknownVoice({
				revision: 1,
				text,
				document: parseDocument(text),
				selection: selectionOf(text, 'there'),
				styleSlot: 2
			});
			expect(result.status).toBe('applied');
			if (result.status !== 'applied') return;
			expect(applyEdits(text, result.edit.edits)).toBe('[Verse: A]\nwell\n<i>Hello\nthere</i>');
		});
	});

	// A selection that starts on a closing tag must write the same result as
	// the equivalent selection without the tag: one wrapper spanning the line
	// break, not redundant per-line markup.
	it('a selection starting on a closing tag writes what the same visible selection writes', () => {
		const text = '[Verse: A & <i>B</i>]\nHello <i>there</i> world\nSecond <i>line</i> here';
		const plain = appliedText(text, assign(text, selectionOf(text, 'world\nSecond'), ['C']));
		const fromTag = assign(text, selectionOf(text, '</i> world\nSecond'), ['C']);
		const next = appliedText(text, fromTag);

		expect(next).toBe(plain);
		expect(selectedAfter(next, fromTag).replaceAll(/<\/?[ib]>/gu, '')).toBe('world\nSecond');
	});

	// Replacing a voice's only passage with a new voice reuses that voice's
	// slot; it must not refuse as too-many-groups just because the section
	// already has four.
	it('replacing the only passage of a fourth voice does not refuse as too many groups', () => {
		const text =
			'[Verse: A, <i>B</i>, <b>C</b> & <i><b>D</b></i>]\nx <i>b</i> <b>c</b> <i><b>d</b></i> y';
		const next = appliedText(
			text,
			assign(text, { anchor: text.indexOf('>d<') + 1, head: text.indexOf('>d<') + 2 }, ['E'])
		);

		expect(next).toBe(
			'[Verse: A, <i>B</i>, <b>C</b> & <i><b>E</b></i>]\nx <i>b</i> <b>c</b> <i><b>d</b></i> y'
		);
	});

	// When a selection inside a leading ad-lib causes the rest of the section
	// to be wrapped instead, that wrapper must open outside the ad-lib's
	// parenthesis, matching `performer.parenthetical-boundary`.
	it('the rest of a section opening with an ad-lib is wrapped outside its parenthesis', () => {
		const text = '[Verse]\n(Hello) there\nworld again';
		const next = appliedText(text, assign(text, selectionOf(text, 'Hello'), ['B'], ['A']));

		expect(next).toBe('[Verse: B & <i>A</i>]\n(Hello) <i>there\nworld again</i>');
	});

	// A selection landing partway inside an HTML entity must not split it: the
	// wrapper opens or closes outside the entity, never between its characters.
	it('a selection partway inside an entity never wraps into it', () => {
		const text = '[Verse: A & <i>B</i>]\nTom &amp; Jerry';
		const next = appliedText(text, assign(text, selectionOf(text, 'amp'), ['B']));

		expect(next).toContain('&amp;');
		expect(next).not.toMatch(/&<|&[a-z]*<\//u);
	});
});
