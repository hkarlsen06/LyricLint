import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import type { TransactionSpec } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import type { PerformerRecord } from '../core/types.js';
import {
	editorComposingField,
	editorContextField,
	setComposingEffect,
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

const document = [
	'[Verse 1: Mara]',
	'Mara opens the song',
	'',
	'[Chorus: Mara & Jun]',
	'Both of them together',
	'',
	'[Bridge: Jun]',
	'Jun alone at the end'
].join('\n');

function createState(text = document, performers = roster('Mara', 'Jun')): EditorState {
	const state = EditorState.create({
		doc: text,
		extensions: [
			history(),
			editorContextField,
			editorComposingField,
			headerRenameSessionField,
			// Registered in the same order as the real editor, where the rename
			// filter has to run before legend cleanup.
			legendCleanupFilter(),
			headerRenameFilter()
		]
	});
	return state.update({
		effects: setEditorContextEffect.of({
			language: 'en',
			performers,
			ruleSetVersion: 'test'
		})
	}).state;
}

/** Offset just before the closing bracket of the header containing `header`. */
function endOfHeaderName(text: string, header: string, name: string): number {
	const from = text.indexOf(header);
	if (from < 0) {
		throw new Error(`Test fixture is missing ${header}.`);
	}
	return from + header.indexOf(name) + name.length;
}

function type(state: EditorState, at: number, insert: string, spec: TransactionSpec = {}) {
	return state.update({ changes: { from: at, to: at, insert }, ...spec });
}

describe('headerRenameFilter', () => {
	it('mirrors a header name edit into every other header in one transaction', () => {
		const state = createState();
		const transaction = type(state, endOfHeaderName(document, '[Verse 1: Mara]', 'Mara'), 'h');

		expect(transaction.state.doc.toString()).toBe(
			document.replace('[Verse 1: Mara]', '[Verse 1: Marah]').replace('Mara &', 'Marah &')
		);
		expect(transaction.state.doc.toString()).toContain('Mara opens the song');
	});

	it('reports the rename so the shell can follow it in the roster', () => {
		const state = createState();
		const transaction = type(state, endOfHeaderName(document, '[Verse 1: Mara]', 'Mara'), 'h');
		const rename = transaction.effects.find((effect) => effect.is(headerRenameEffect))?.value;

		expect(rename).toEqual({
			performerId: 'performer-0',
			previousName: 'Mara',
			displayName: 'Marah',
			occurrences: 1,
			started: true
		});
	});

	it('keeps mirroring across the following keystrokes of the same rename', () => {
		let state = createState();
		let at = endOfHeaderName(document, '[Verse 1: Mara]', 'Mara');
		for (const character of 'hnna') {
			const transaction = type(state, at, character);
			state = transaction.state;
			at += 1;
		}

		expect(state.doc.toString()).toContain('[Verse 1: Marahnna]');
		expect(state.doc.toString()).toContain('[Chorus: Marahnna & Jun]');
		expect(state.doc.toString()).toContain('[Bridge: Jun]');
		expect(state.field(headerRenameSessionField)?.previousName).toBe('Mara');
	});

	it('mirrors deletions inside the renamed name', () => {
		const state = createState();
		const at = endOfHeaderName(document, '[Verse 1: Mara]', 'Mara');
		const shortened = state.update({ changes: { from: at - 2, to: at, insert: '' } }).state;

		expect(shortened.doc.toString()).toContain('[Verse 1: Ma]');
		expect(shortened.doc.toString()).toContain('[Chorus: Ma & Jun]');
	});

	it('renames a member of a joint group from the joint header itself', () => {
		const state = createState();
		const transaction = type(state, endOfHeaderName(document, '[Chorus: Mara & Jun]', 'Jun'), 'e');

		expect(transaction.state.doc.toString()).toContain('[Chorus: Mara & June]');
		expect(transaction.state.doc.toString()).toContain('[Bridge: June]');
		expect(transaction.state.doc.toString()).toContain('Jun alone at the end');
	});

	it('waits for a padded name instead of mirroring a half-typed one', () => {
		const state = createState();
		const at = endOfHeaderName(document, '[Verse 1: Mara]', 'Mara');
		const padded = type(state, at, ' ').state;

		expect(padded.doc.toString()).toContain('[Chorus: Mara & Jun]');
		expect(padded.field(headerRenameSessionField)).toBeDefined();

		const finished = type(padded, at + 1, 'J').state;
		expect(finished.doc.toString()).toContain('[Verse 1: Mara J]');
		expect(finished.doc.toString()).toContain('[Chorus: Mara J & Jun]');
	});

	it('leaves other headers alone for a name the roster does not know', () => {
		const text = '[Verse 1: Kit]\nKit opens\n\n[Chorus: Kit]\nKit again';
		const state = createState(text, roster('Mara'));

		expect(type(state, text.indexOf('Kit') + 3, 'e').state.doc.toString()).toBe(
			text.replace('[Verse 1: Kit]', '[Verse 1: Kite]')
		);
	});

	it('leaves lyric lines alone', () => {
		const state = createState();
		const transaction = type(state, document.indexOf('Mara opens') + 4, 'h');

		expect(transaction.state.doc.toString()).toContain('[Chorus: Mara & Jun]');
		expect(transaction.state.field(headerRenameSessionField)).toBeUndefined();
	});

	it('never mirrors a character that would change how another header parses', () => {
		const state = createState();
		const transaction = type(state, endOfHeaderName(document, '[Verse 1: Mara]', 'Mara'), ',');

		expect(transaction.state.doc.toString()).toContain('[Chorus: Mara & Jun]');
		expect(transaction.state.field(headerRenameSessionField)).toBeUndefined();
	});

	it('is exempt from undo, redo, and IME composition', () => {
		const state = createState();
		const at = endOfHeaderName(document, '[Verse 1: Mara]', 'Mara');

		for (const userEvent of ['undo', 'redo']) {
			expect(type(state, at, 'h', { userEvent }).state.doc.toString()).toContain(
				'[Chorus: Mara & Jun]'
			);
		}

		const composing = state.update({ effects: setComposingEffect.of(true) }).state;
		expect(type(composing, at, 'h').state.doc.toString()).toContain('[Chorus: Mara & Jun]');
	});

	it('ends the rename when the caret leaves the edited name', () => {
		const state = createState();
		const renamed = type(state, endOfHeaderName(document, '[Verse 1: Mara]', 'Mara'), 'h').state;
		expect(renamed.field(headerRenameSessionField)).toBeDefined();

		const moved = renamed.update({ selection: { anchor: 0, head: 0 } }).state;
		expect(moved.field(headerRenameSessionField)).toBeUndefined();
	});

	it('restores every mirrored header with a single undo', () => {
		const state = createState();
		const renamed = type(state, endOfHeaderName(document, '[Verse 1: Mara]', 'Mara'), 'h').state;
		expect(renamed.doc.toString()).toContain('[Chorus: Marah & Jun]');

		let undone: EditorState | undefined;
		undo({
			state: renamed,
			dispatch: (transaction) => {
				undone = transaction.state;
			}
		});
		expect(undone?.doc.toString()).toBe(document);
	});
});
