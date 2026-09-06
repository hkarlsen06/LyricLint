import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorState, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Annotation, TransactionSpec } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { editorComposingField, setComposingEffect } from './extensions/editor-state.js';
import {
	applyOnlyHereAnnotation,
	linkConnectionsFor,
	linkHolesField,
	sectionLinkCompositionField,
	sectionLinkField,
	sectionLinkHistory,
	sectionLinkMirror,
	sectionLinksFor,
	sectionPassageField,
	setSectionLinkEffect,
	setSectionLinksEffect,
	typeOnlyHere,
	typeOnlyHereField
} from './extensions/section-links.js';
import { copySectionLinks } from '$lib/persistence/copy.js';

const SONG =
	'[Intro]\nHold on tight\nThrough the night\n\n[Chorus]\nHold on tight\nThrough the night\n\n[Outro]\nHold on tight\nThrough the night';

function createState(local = false, text = SONG): EditorState {
	const extensions = [
		history(),
		editorComposingField,
		sectionLinkCompositionField,
		sectionLinkField,
		linkHolesField,
		sectionPassageField,
		sectionLinkHistory,
		sectionLinkMirror()
	];
	const initial = EditorState.create({ doc: text, extensions: [...extensions, typeOnlyHereField] });
	const linked = initial.update({
		effects: setSectionLinkEffect.of({
			headers: [0, text.indexOf('[Chorus]'), text.indexOf('[Outro]')]
		}),
		annotations: Transaction.addToHistory.of(false)
	}).state;
	// Seed the real fields directly so each test starts with linked text, empty
	// history, and (where requested) the same local-mode field as the UI toggle.
	return EditorState.create({
		doc: text,
		extensions: [
			...extensions,
			sectionLinkField.init(() => linked.field(sectionLinkField)),
			linkHolesField.init(() => linked.field(linkHolesField)),
			sectionPassageField.init(() => linked.field(sectionPassageField)),
			typeOnlyHereField.init(() => (local ? { header: 0 } : undefined))
		]
	});
}

function update(state: EditorState, specification: TransactionSpec): EditorState {
	return state.update(specification).state;
}

function startComposition(state: EditorState): EditorState {
	return update(state, {
		effects: setComposingEffect.of(true),
		annotations: Transaction.addToHistory.of(false)
	});
}

function compose(
	state: EditorState,
	from: number,
	to: number,
	insert: string,
	time: number
): EditorState {
	return update(state, {
		changes: { from, to, insert },
		userEvent: 'input.type.compose',
		annotations: Transaction.time.of(time)
	});
}

function commit(state: EditorState, time = 10_000): EditorState {
	return update(state, {
		effects: setComposingEffect.of(false),
		annotations: Transaction.time.of(time)
	});
}

function historyStep(state: EditorState, command: typeof undo): EditorState {
	let result = state;
	expect(
		command({
			state,
			dispatch: (transaction) => {
				result = transaction.state;
			}
		})
	).toBe(true);
	return result;
}

describe('passage transactions', () => {
	it('keeps IME preedit local, commits once after a long candidate pause, and undoes/redoes as one event', () => {
		let state = startComposition(createState());
		const from = SONG.indexOf('tight');
		state = compose(state, from, from + 5, 't', 1000);
		expect(state.doc.toString()).toBe(SONG.replace('tight', 't'));
		state = compose(state, from, from + 1, 'té', 8000);
		expect(state.doc.toString()).toBe(SONG.replace('tight', 'té'));
		state = commit(state, 20_000);
		expect(state.doc.toString()).toBe(SONG.replaceAll('tight', 'té'));
		expect(state.field(editorComposingField)).toBe(false);
		expect(state.field(sectionLinkCompositionField)).toBeUndefined();
		expect(undoDepth(state)).toBe(1);
		state = historyStep(state, undo);
		expect(state.doc.toString()).toBe(SONG);
		state = historyStep(state, redo);
		expect(state.doc.toString()).toBe(SONG.replaceAll('tight', 'té'));
		// History restores the connection as well as the text.
		state = update(state, { changes: { from, to: from + 2, insert: 'close' } });
		expect(state.doc.toString()).toBe(SONG.replaceAll('tight', 'close'));
	});

	it.each(['東京', 'té'])('keeps committed %s connected before any history navigation', (word) => {
		let state = startComposition(createState());
		const from = SONG.indexOf('tight');
		state = compose(state, from, from + 5, 't', 1000);
		state = compose(state, from, from + 1, word, 2000);
		state = commit(state);
		const links = sectionLinksFor(state);
		expect(copySectionLinks(links)).toEqual(links);
		state = update(state, { changes: { from, to: from + 2, insert: 'close' } });
		expect(state.doc.toString()).toBe(SONG.replaceAll('tight', 'close'));
	});

	it('includes a final text replacement delivered with compositionend', () => {
		let state = startComposition(createState());
		const from = SONG.indexOf('tight');
		state = compose(state, from, from + 5, 't', 1000);
		state = update(state, {
			changes: { from, to: from + 1, insert: '東京' },
			effects: setComposingEffect.of(false),
			userEvent: 'input.type.compose',
			annotations: Transaction.time.of(10_000)
		});
		expect(state.doc.toString()).toBe(SONG.replaceAll('tight', '東京'));
		state = historyStep(state, undo);
		expect(state.doc.toString()).toBe(SONG);
	});

	it('cancelled composition preserves text and the existing connections', () => {
		let state = startComposition(createState());
		const from = SONG.indexOf('tight');
		state = compose(state, from, from + 5, 'x', 1000);
		state = compose(state, from, from + 1, 'tight', 2000);
		state = commit(state);
		expect(state.doc.toString()).toBe(SONG);
		state = update(state, { changes: { from, to: from + 5, insert: 'close' } });
		expect(state.doc.toString()).toBe(SONG.replaceAll('tight', 'close'));
	});

	it('keeps local-mode composition local without disconnecting the remaining copies', () => {
		let state = startComposition(createState(true));
		const from = SONG.indexOf('tight');
		state = compose(state, from, from + 5, 'é', 1000);
		state = commit(state);
		const local = SONG.replace('tight', 'é');
		expect(state.doc.toString()).toBe(local);
		const other = local.indexOf('tight');
		state = update(state, { changes: { from: other, to: other + 5, insert: 'close' } });
		expect(state.doc.toString()).toBe(local.replaceAll('tight', 'close'));
	});

	it('mirrors scattered replacements within one section and keeps their surviving text connected', () => {
		let state = createState();
		const first = SONG.indexOf('Hold');
		const second = SONG.indexOf('night');
		state = update(state, {
			changes: [
				{ from: first, to: first + 4, insert: 'Keep' },
				{ from: second, to: second + 5, insert: 'day' }
			]
		});
		const replaced = SONG.replaceAll('Hold', 'Keep').replaceAll('night', 'day');
		expect(state.doc.toString()).toBe(replaced);
		const links = sectionLinksFor(state);
		expect(copySectionLinks(links)).toEqual(links);
		const middle = replaced.indexOf('tight');
		state = update(state, { changes: { from: middle, to: middle + 5, insert: 'close' } });
		expect(state.doc.toString()).toBe(replaced.replaceAll('tight', 'close'));
	});

	it('retains shared content after a pre-expanded performer-style transaction edits every copy', () => {
		let state = createState();
		const edits = [...SONG.matchAll(/Hold/g)].flatMap((match) => [
			{ from: match.index, insert: '<i>' },
			{ from: match.index + 4, insert: '</i>' }
		]);
		state = update(state, { changes: edits });
		const styled = SONG.replaceAll('Hold', '<i>Hold</i>');
		expect(state.doc.toString()).toBe(styled);
		const styledWord = styled.indexOf('Hold');
		state = update(state, { changes: { from: styledWord, to: styledWord + 4, insert: 'Keep' } });
		const renamed = styled.replaceAll('Hold', 'Keep');
		expect(state.doc.toString()).toBe(renamed);
		const from = renamed.indexOf('tight');
		state = update(state, { changes: { from, to: from + 5, insert: 'close' } });
		expect(state.doc.toString()).toBe(renamed.replaceAll('tight', 'close'));
	});
});

/** The toggle reads only state and dispatch; no DOM is involved in its command. */
function toggleLocal(state: EditorState, header: number): EditorState {
	let next = state;
	const commandTarget = {
		state,
		dispatch: (spec: TransactionSpec) => {
			next = state.update(spec).state;
		}
	} as EditorView;
	expect(typeOnlyHere(commandTarget, header)).toBe(true);
	return next;
}

function memberHeaders(state: EditorState): number[] {
	return [...state.doc.toString().matchAll(/^\[(Intro|Chorus|Outro)\]/gm)].map(
		(match) => match.index
	);
}

function expectValidStorage(state: EditorState, label: string): void {
	const raw = sectionLinksFor(state);

	expect(raw[0]?.passages?.length, label).toBeGreaterThan(0);
	// The trust-boundary validator rejects overlapping owners and unequal text.
	// A valid live model must survive this ordinary autosave copier byte for byte.
	expect(copySectionLinks(raw), label).toEqual(raw);
	for (const passage of state.field(sectionPassageField).passages) {
		const words = passage.members.map((member) => state.doc.sliceString(member.from, member.to));
		expect(new Set(words).size, label).toBe(1);
	}
}

describe('independence, reconnection and sustained passage edits', () => {
	it('keeps a deliberately deleted word local after leaving local mode and retyping it', () => {
		let state = createState(true);
		const from = SONG.indexOf('tight');
		state = update(state, { changes: { from, to: from + 5, insert: '' } });
		expect(state.doc.toString()).toBe(SONG.replace('tight', ''));
		state = toggleLocal(state, 0);
		expect(state.field(typeOnlyHereField)).toBeUndefined();
		state = update(state, { changes: { from, insert: 'close' } });
		expect(state.doc.toString()).toBe(SONG.replace('tight', 'close'));
		const text = state.doc.toString();
		const peer = text.indexOf('tight');
		state = update(state, { changes: { from: peer, to: peer + 5, insert: 'firm' } });
		expect(state.doc.toString()).toBe(text.replaceAll('tight', 'firm'));
		expectValidStorage(state, 'after local deletion and retyping');
	});

	it('preserves a local deletion boundary when the other copies later delete the same character', () => {
		let state = createState(true);
		const from = SONG.indexOf('tight');
		state = update(state, { changes: { from, to: from + 1, insert: '' } });
		state = toggleLocal(state, 0);
		const peer = state.doc.toString().indexOf('tight');
		state = update(state, { changes: { from: peer, to: peer + 1, insert: '' } });
		expect(state.doc.toString()).toBe(SONG.replaceAll('tight', 'ight'));
		expectValidStorage(state, 'equal text after separately deleting one letter');
		state = update(state, { changes: { from, insert: 'r' } });
		expect(state.doc.toString()).toBe(SONG.replaceAll('tight', 'ight').replace('ight', 'right'));
	});

	it('refreshes legacy exclusions explicitly, preserves lyrics, and retains unmatched local wording', () => {
		const text = SONG.replace('tight', 'alone');
		let state = createState(false, text);
		const legacy = sectionLinksFor(state).map(({ lines, holes }) => ({ lines, holes }));
		state = update(state, { effects: setSectionLinksEffect.of(legacy) });
		expect(sectionLinksFor(state)[0]?.passages).toEqual([]);
		const headers = memberHeaders(state);
		const offered = linkConnectionsFor(state, headers);
		expect(
			offered.some((connection) => connection.added && connection.text.includes('Hold on'))
		).toBe(true);
		state = update(state, { effects: setSectionLinkEffect.of({ headers, refresh: true }) });
		expect(state.doc.toString()).toBe(text);
		expectValidStorage(state, 'after explicit refresh');
		expect(linkConnectionsFor(state, headers).every((connection) => !connection.added)).toBe(true);
		const from = text.indexOf('Hold');
		state = update(state, { changes: { from, to: from + 4, insert: 'Keep' } });
		expect(state.doc.toString()).toBe(text.replaceAll('Hold', 'Keep'));
		const local = state.doc.toString().indexOf('alone');
		state = update(state, { changes: { from: local, to: local + 5, insert: 'solo' } });
		expect(state.doc.toString()).toBe(text.replaceAll('Hold', 'Keep').replace('alone', 'solo'));
		expect(
			sectionLinksFor(state)[0]?.detached?.some(
				(member) => member.headerLine === 1 && member.line === 2
			)
		).toBe(true);
	});

	it('adding a member keeps equal-but-deliberately-independent words separate until refresh is chosen', () => {
		let state = createState();
		state = update(state, { effects: setSectionLinksEffect.of([]) });
		state = update(state, {
			effects: setSectionLinkEffect.of({ headers: memberHeaders(state).slice(0, 2) })
		});
		const from = SONG.indexOf('tight');
		state = update(state, {
			changes: { from, to: from + 5, insert: 'close' },
			annotations: applyOnlyHereAnnotation.of({ from, to: from + 5 })
		});
		state = update(state, { changes: { from, to: from + 5, insert: 'tight' } });
		expect(state.doc.toString()).toBe(SONG);
		state = update(state, { effects: setSectionLinkEffect.of({ headers: memberHeaders(state) }) });
		const peer = state.doc.toString().indexOf('tight', state.doc.toString().indexOf('[Chorus]'));
		state = update(state, { changes: { from: peer, to: peer + 5, insert: 'firm' } });
		expect(state.doc.toString()).toBe(
			SONG.slice(0, SONG.indexOf('[Chorus]')) +
				SONG.slice(SONG.indexOf('[Chorus]')).replaceAll('tight', 'firm')
		);
		expectValidStorage(state, 'after adding member beside a deliberate exclusion');
	});

	it('keeps a valid, serializable model through 90 reproducible shared and local edits', () => {
		let seed = 0x4c594c;
		const random = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
			return seed;
		};
		let state = createState();
		for (let step = 0; step < 90; step++) {
			const line = state.doc.line([2, 6, 10][random() % 3]!);
			const words = [...line.text.matchAll(/[A-Za-z]+/g)];
			const word = words[random() % words.length]!;
			const from = line.from + word.index;
			const change =
				step % 3 === 0
					? { from: from + word[0].length, to: from + word[0].length, insert: 's' }
					: step % 3 === 1
						? { from, to: from + word[0].length, insert: ['stay', 'hold', 'near'][random() % 3]! }
						: { from, to: from + Math.min(1, word[0].length - 1), insert: '' };
			const annotations: Annotation<unknown>[] = [Transaction.time.of(1000 * (step + 1))];
			if (step % 7 === 0) annotations.push(applyOnlyHereAnnotation.of(change));
			state = update(state, { changes: change, annotations, userEvent: 'input.type' });
			expectValidStorage(state, `seed 0x4c594c, step ${step}`);
			expect(state.doc.toString().match(/Through the night/g)).toHaveLength(3);
		}
	});
});
