import { EditorSelection, EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cdp, userEvent } from 'vitest/browser';
import type { ProfileId } from '#lib/profiles/types.js';
import { createLyricEditor, type LyricEditorInstance } from './create-editor.js';

const source = '[Verse: Mira]\nThe [silver compass](123456) by the door\nStay beside me';
const plain = 'The silver compass by the door\nStay beside me';
const editors: LyricEditorInstance[] = [];

afterEach(() => {
	for (const editor of editors.splice(0)) {
		const host = editor.view.dom.parentElement;
		editor.destroy();
		host?.remove();
	}
});

function mount(text: string) {
	const host = document.createElement('div');
	document.body.append(host);
	const onSnapshot = vi.fn();
	const editor = createLyricEditor(host, {
		initialText: text,
		context: { language: 'en', performers: [], ruleSetVersion: 'test' },
		callbacks: {
			onSnapshot,
			onAssignRequest: vi.fn(),
			onSectionHeaderRequest: vi.fn(),
			onDiagnosticActivate: vi.fn(),
			onSectionDetailRequest: vi.fn(),
			onAnnouncement: vi.fn()
		}
	});
	editors.push(editor);
	return { ...editor, onSnapshot };
}

const shapes = ['forward', 'backward', 'multiple', 'caret'] as const;
for (const identical of [false, true]) {
	for (const start of ['genius', 'musixmatch'] satisfies ProfileId[]) {
		describe(`${start} history with ${identical ? 'identical' : 'different'} text`, () => {
			it.each(shapes)(
				'retains %s selections through repeated Undo/Redo and subsequent typing',
				async (shape) => {
					const { view, handle, onSnapshot } = mount(identical ? plain : source);
					if (start === 'musixmatch') expect(handle.switchProfile!(start)).toEqual({ ok: true });
					const end = view.state.doc.length;
					const main = EditorSelection.range(
						shape === 'forward' ? end - 2 : end,
						shape === 'caret' ? end : shape === 'forward' ? end : end - 2
					);
					const ranges =
						shape === 'multiple' ? [EditorSelection.range(end - 14, end - 10), main] : [main];
					view.dispatch({
						effects: StateEffect.appendConfig.of(EditorState.allowMultipleSelections.of(true))
					});
					view.dispatch({ selection: EditorSelection.create(ranges, ranges.length - 1) });
					const original = view.state.selection;
					const other = start === 'genius' ? 'musixmatch' : 'genius';
					for (let cycle = 0; cycle < 2; cycle++) {
						expect(handle.switchProfile!(other)).toEqual({ ok: true });
						expect(handle.switchProfile!(start)).toEqual({ ok: true });
					}
					expect(view.state.selection.eq(original)).toBe(true);
					const stable = handle.getSnapshot();
					for (let cycle = 0; cycle < 3; cycle++) {
						onSnapshot.mockClear();
						handle.undo();
						expect(onSnapshot).toHaveBeenCalledOnce();
						expect(handle.getSnapshot().conversion?.profile).toBe(other);
						const delta = view.state.doc.length - stable.text.length;
						expect(view.state.selection.toJSON()).toEqual(
							EditorSelection.create(
								ranges.map((range) =>
									EditorSelection.range(range.anchor + delta, range.head + delta)
								),
								original.mainIndex
							).toJSON()
						);
						expect(
							view.state.selection.ranges.map((range) => view.state.sliceDoc(range.from, range.to))
						).toEqual(ranges.map((range) => stable.text.slice(range.from, range.to)));
						handle.redo();
						expect(handle.getSnapshot().text).toBe(stable.text);
						expect(view.state.selection.toJSON()).toEqual(original.toJSON());
						expect(handle.getSnapshot().conversion?.model).toEqual(stable.conversion?.model);
					}
					onSnapshot.mockClear();
					expect(handle.switchProfile!(start)).toEqual({ ok: true });
					expect(onSnapshot).not.toHaveBeenCalled();
					const expected = [...ranges]
						.reverse()
						.reduce(
							(text, range) => text.slice(0, range.from) + 'you' + text.slice(range.to),
							stable.text
						);
					view.focus();
					await userEvent.keyboard('you');
					expect(handle.getSnapshot().text).toBe(expected);
					expect(handle.getSnapshot().conversionRecovery).toBeUndefined();
					handle.undo();
					expect(handle.getSnapshot().text).toBe(stable.text);
					expect(view.state.selection.toJSON()).toEqual(original.toJSON());
					expect(handle.getSnapshot().conversion?.profile).toBe(start);
					handle.redo();
					expect(handle.getSnapshot().text).toBe(expected);
					handle.undo();
					handle.undo();
					const undoneText = handle.getSnapshot().text;
					const expectedAfterUndo = [...view.state.selection.ranges]
						.reverse()
						.reduce(
							(text, range) => text.slice(0, range.from) + 'us' + text.slice(range.to),
							undoneText
						);
					await userEvent.keyboard('us');
					expect(handle.getSnapshot().text).toBe(expectedAfterUndo);
					handle.redo();
					expect(handle.getSnapshot().text).toBe(expectedAfterUndo);
					handle.undo();
					expect(handle.getSnapshot().text).toBe(undoneText);
					expect(handle.getSnapshot().conversion?.profile).toBe(other);
				}
			);
		});
	}
}

it.each(['genius', 'musixmatch'] satisfies ProfileId[])(
	'keeps a scrolled occurrence through a %s switch and history',
	async (start) => {
		const text = Array.from(
			{ length: 100 },
			(_, index) => `[Verse ${index + 1}]\nSame [silver compass](123456)\nStay beside me\n`
		).join('\n');
		const { view, handle } = mount(text);
		if (start === 'musixmatch') handle.switchProfile!(start);
		view.dom.style.height = '300px';
		view.dom.style.width = '700px';
		view.scrollDOM.style.overflow = 'auto';
		await vi.waitFor(() => expect(view.scrollDOM.clientHeight).toBe(300));
		const line = (profile: ProfileId) => view.state.doc.line(profile === 'genius' ? 199 : 149);
		const offset = (profile: ProfileId) =>
			view.lineBlockAt(line(profile).from).top +
			view.documentPadding.top -
			view.scrollDOM.scrollTop;
		// The selection stays at the start, far outside the scrolled passage.
		view.dispatch({
			effects: EditorView.scrollIntoView(line(start).from, { y: 'start', yMargin: -12 })
		});
		await vi.waitFor(() => {
			expect(offset(start)).toBeLessThan(-4);
			expect(offset(start)).toBeGreaterThan(-16);
		});
		const settle = async () => {
			await new Promise(requestAnimationFrame);
			await new Promise(requestAnimationFrame);
		};
		await settle();
		const before = offset(start);
		const other = start === 'genius' ? 'musixmatch' : 'genius';
		expect(handle.switchProfile!(other)).toEqual({ ok: true });
		await settle();
		await vi.waitFor(() => expect(Math.abs(offset(other) - before)).toBeLessThan(4));
		handle.undo();
		await settle();
		await vi.waitFor(() => expect(Math.abs(offset(start) - before)).toBeLessThan(4));
		handle.redo();
		await settle();
		await vi.waitFor(() => expect(Math.abs(offset(other) - before)).toBeLessThan(4));
	}
);

it.each(['genius', 'musixmatch'] satisfies ProfileId[])(
	'keeps a deeply wrapped lyric at its visual offset through %s history',
	async (start) => {
		const { view, handle } = mount('Silver moon over water '.repeat(1000));
		if (start === 'musixmatch') handle.switchProfile!(start);
		view.dom.style.height = '300px';
		view.dom.style.width = '300px';
		view.scrollDOM.style.overflow = 'auto';
		await vi.waitFor(() => expect(view.scrollDOM.clientHeight).toBe(300));
		const settle = async () => {
			await new Promise(requestAnimationFrame);
			await new Promise(requestAnimationFrame);
		};
		await settle();
		view.scrollDOM.scrollTop = 600;
		await settle();
		const before = view.scrollDOM.scrollTop;
		expect(before).toBeGreaterThan(500);
		const other = start === 'genius' ? 'musixmatch' : 'genius';
		for (const action of [() => handle.switchProfile!(other), handle.undo, handle.redo]) {
			action();
			await settle();
			await vi.waitFor(() => expect(Math.abs(view.scrollDOM.scrollTop - before)).toBeLessThan(4));
		}
	}
);

it.each(['genius', 'musixmatch'] satisfies ProfileId[])(
	'keeps the visible opening lyric below a section widget through %s history',
	async (start) => {
		const text = Array.from(
			{ length: 100 },
			(_, index) => `[Verse ${index + 1}]\nSame [silver compass](123456)\nStay beside me\n`
		).join('\n');
		const { view, handle } = mount(text);
		if (start === 'musixmatch') handle.switchProfile!(start);
		view.dom.style.height = '300px';
		view.dom.style.width = '700px';
		view.scrollDOM.style.overflow = 'auto';
		await vi.waitFor(() => expect(view.scrollDOM.clientHeight).toBe(300));
		const position = (profile: ProfileId) =>
			view.state.doc.line(profile === 'genius' ? 198 : 148).from;
		const offset = (profile: ProfileId) =>
			view.coordsAtPos(position(profile))!.top - view.scrollDOM.getBoundingClientRect().top;
		view.dispatch({
			effects: EditorView.scrollIntoView(position(start), { y: 'start', yMargin: 2 })
		});
		const settle = async () => {
			await new Promise(requestAnimationFrame);
			await new Promise(requestAnimationFrame);
		};
		await settle();
		const before = offset(start);
		const other = start === 'genius' ? 'musixmatch' : 'genius';
		for (const [action, profile] of [
			[() => handle.switchProfile!(other), other],
			[handle.undo, start],
			[handle.redo, other]
		] as const) {
			action();
			await settle();
			await vi.waitFor(() => expect(Math.abs(offset(profile) - before)).toBeLessThan(4));
		}
	}
);

it('keeps the document start visible when its first section widget changes', async () => {
	const { view, handle } = mount('[Verse]\n' + 'Silver moon over water\n'.repeat(100));
	view.dom.style.height = '300px';
	view.scrollDOM.style.overflow = 'auto';
	await vi.waitFor(() => expect(view.scrollDOM.clientHeight).toBe(300));
	for (const action of [() => handle.switchProfile!('musixmatch'), handle.undo, handle.redo]) {
		action();
		await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
		expect(view.scrollDOM.scrollTop).toBe(0);
	}
});

it('keeps native IME composition in its own typing event after a profile replay', async () => {
	const { view, handle } = mount(source);
	view.dispatch({ selection: { anchor: source.length, head: source.length - 2 } });
	handle.switchProfile!('musixmatch');
	handle.switchProfile!('genius');
	handle.undo();
	handle.redo();
	view.focus();
	await cdp().send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
	expect(handle.switchProfile!('musixmatch')).toMatchObject({ ok: false, deferred: true });
	await cdp().send('Input.imeSetComposition', { text: '日本', selectionStart: 2, selectionEnd: 2 });
	await cdp().send('Input.insertText', { text: '日本' });
	await vi.waitFor(() => expect(handle.getSnapshot().composing).toBe(false));
	expect(handle.getSnapshot().text).toBe(source.slice(0, -2) + '日本');
	expect(handle.getSnapshot().conversionRecovery).toBeUndefined();
	handle.switchProfile!('musixmatch');
	expect(handle.getSnapshot().text).toBe(plain.slice(0, -2) + '日本');
	handle.undo();
	expect(handle.getSnapshot().text).toBe(source.slice(0, -2) + '日本');
	handle.undo();
	expect(handle.getSnapshot().text).toBe(source);
	expect(view.state.selection.toJSON()).toEqual({ ranges: [{ anchor: 69, head: 67 }], main: 0 });
	handle.redo();
	expect(handle.getSnapshot().text).toBe(source.slice(0, -2) + '日本');
	handle.redo();
	expect(handle.getSnapshot().text).toBe(plain.slice(0, -2) + '日本');
});
