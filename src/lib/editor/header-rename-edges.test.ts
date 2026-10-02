import { history } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '#lib/core/parser.js';
import type { PerformerRecord } from '#lib/core/types.js';
import { headerNameAtoms } from '#lib/performers/header-rename.js';
import {
	editorComposingField,
	editorContextField,
	setEditorContextEffect
} from './extensions/editor-state.js';
import {
	headerRenameEffect,
	headerRenameFilter,
	headerRenameSessionField
} from './extensions/header-rename.js';
import { legendCleanupFilter } from './extensions/legend-cleanup.js';

function roster(...names: string[]): PerformerRecord[] {
	return names.map((displayName, order) => ({
		id: `performer-${order}`,
		displayName,
		normalizedKey: displayName.toLocaleLowerCase(),
		aliases: [],
		colorId: `color-${order}`,
		order
	}));
}

function createState(text: string, performers: PerformerRecord[]): EditorState {
	const state = EditorState.create({
		doc: text,
		extensions: [
			history(),
			editorContextField,
			editorComposingField,
			legendCleanupFilter(),
			headerRenameSessionField,
			headerRenameFilter()
		]
	});
	return state.update({
		effects: setEditorContextEffect.of({ language: 'en', performers, ruleSetVersion: 'test' })
	}).state;
}

/** Type like a keyboard does: replace the range and put the caret after it. */
function typeAt(state: EditorState, from: number, insert: string, to = from) {
	return state.update({
		changes: { from, to, insert },
		selection: { anchor: from + insert.length },
		userEvent: insert ? 'input.type' : 'delete.backward'
	});
}

describe('headerRenameFilter composed with legendCleanupFilter', () => {
	// The rename session's stored ranges must stay valid across a transaction
	// where cleanup also edits the document, and lyrics must never be
	// overwritten by a mirrored rename that lands at a stale offset.
	const dirty = [
		'[Verse 1: Mara]',
		'Mara opens',
		'',
		'[Chorus: Jun, <i>Mara</i>]',
		'Plain only',
		'',
		'[Bridge: Mara]',
		'Bridge line that is long enough to hold stale coordinates'
	].join('\n');

	it('keeps lyrics intact on the keystroke after a cleanup landed in the rename transaction', () => {
		let state = createState(dirty, roster('Mara', 'Jun'));
		const at = dirty.indexOf('Mara]') + 'Mara'.length;
		state = typeAt(state, at, 'h').state;
		state = typeAt(state, at + 1, 'n').state;

		expect(state.doc.toString()).toBe(
			[
				'[Verse 1: Marahn]',
				'Mara opens',
				'',
				'[Chorus: Jun, <i>Marahn</i>]',
				'Plain only',
				'',
				'[Bridge: Marahn]',
				'Bridge line that is long enough to hold stale coordinates'
			].join('\n')
		);
	});

	it('does not throw on the keystroke after a cleanup landed in the rename transaction', () => {
		// The stale target can also point past the end of the document; mapping
		// it must not throw and lose the keystroke.
		const doc = dirty.replace(/\nBridge line.*$/u, '\nBridge line');
		let state = createState(doc, roster('Mara', 'Jun'));
		const at = doc.indexOf('Mara]') + 'Mara'.length;
		state = typeAt(state, at, 'h').state;

		expect(() => typeAt(state, at + 1, 'n')).not.toThrow();
	});
});

describe('headerRenameFilter session boundaries', () => {
	const base = [
		'[Verse 1: Mara]',
		'Mara opens',
		'',
		'[Chorus: Mara & Jun]',
		'Both',
		'',
		'[Bridge: Jun]',
		'Jun alone'
	].join('\n');

	it('does not rename a performer when a new legend group is typed in front of it', () => {
		// Typing `Kim, ` at the start of `[Verse 1: Mara]` adds a second
		// performer before an existing one; the start boundary must not count as
		// inside Mara's name, so none of it mirrors into `Mara`.
		let state = createState(base, roster('Mara', 'Jun'));
		let at = base.indexOf('Mara');
		for (const character of 'Kim, ') {
			state = typeAt(state, at, character).state;
			at += 1;
		}

		expect(state.doc.toString()).toContain('[Verse 1: Kim, Mara]');
		expect(state.doc.toString()).toContain('[Chorus: Mara & Jun]');
	});

	it('keeps the rename open while the name is empty, as isMirrorableHeaderName documents', () => {
		// An empty or padded name belongs to an in-progress edit: the rename
		// session must stay open so the next keystroke still mirrors, whether the
		// name was cleared by typing over a selection or by Backspace first.
		let state = createState(base, roster('Mara', 'Jun'));
		const at = base.indexOf('Mara');
		state = typeAt(state, at, '', at + 'Mara'.length).state;
		expect(state.field(headerRenameSessionField)).toBeDefined();

		for (const [offset, character] of [...'Kim'].entries()) {
			state = typeAt(state, at + offset, character).state;
		}
		expect(state.doc.toString()).toContain('[Verse 1: Kim]');
		expect(state.doc.toString()).toContain('[Chorus: Kim & Jun]');
	});
});

describe('header rename reports raw legend text as a name', () => {
	it('reports decoded names for a legend that spells the performer with an entity', () => {
		// The effect's `previousName` and `displayName` must be decoded text
		// (`Tom & Jerry`), matching what `decodeLegendText` resolves atoms with,
		// not raw source (`Tom &amp; Jerry`), or the roster record it feeds stops
		// matching the header it came from.
		const doc = '[Verse 1: Tom &amp; Jerry]\nline\n\n[Chorus: Tom &amp; Jerry]\nline';
		const state = createState(doc, roster('Tom & Jerry', 'Jun'));
		const transaction = typeAt(state, doc.indexOf(']'), 'x');

		expect(transaction.state.doc.toString()).toContain('[Chorus: Tom &amp; Jerryx]');
		const rename = transaction.effects.find((effect) => effect.is(headerRenameEffect))?.value;
		expect(rename).toEqual(
			expect.objectContaining({ previousName: 'Tom & Jerry', displayName: 'Tom & Jerryx' })
		);
	});
});

describe('headerNameAtoms agrees with import resolution', () => {
	it('resolves a performer whose name contains a comma, as import extraction does', () => {
		// Import's `logicalHeaderGroups` rejoins comma-split legend groups whose
		// combined text is an exact roster name (`Tyler, The Creator`);
		// `headerNameAtoms` must find the same performer there, or a rename
		// leaves the header naming someone the roster no longer has.
		const text = '[Verse 1: Tyler, The Creator]\nA line';
		const atoms = headerNameAtoms(parseDocument(text), roster('Tyler, The Creator'));

		expect(atoms.filter((atom) => atom.performerId === 'performer-0')).toHaveLength(1);
	});
});
