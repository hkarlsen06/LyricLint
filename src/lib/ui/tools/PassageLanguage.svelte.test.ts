import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createLyricEditor } from '#lib/editor/create-editor.js';
import { createTestWorkbench } from '../test-utils.js';
import PassageLanguage from './PassageLanguage.svelte';

const source = 'Héllo 🌙\nOther words';
const disposers: (() => void)[] = [];
afterEach(async () => {
	await cleanup();
	for (const dispose of disposers.splice(0)) dispose();
});
async function setup() {
	const { controller } = createTestWorkbench({ text: source });
	const host = document.createElement('div');
	document.body.append(host);
	const editor = createLyricEditor(host, {
		initialText: source,
		context: { language: 'en', performers: [], ruleSetVersion: 'test' },
		callbacks: {
			onSnapshot: (snapshot) => controller.onSnapshot(snapshot),
			onAssignRequest: vi.fn(),
			onSectionHeaderRequest: vi.fn(),
			onDiagnosticActivate: vi.fn(),
			onAnnouncement: vi.fn()
		}
	});
	disposers.push(() => {
		editor.destroy();
		host.remove();
	});
	controller.setEditorHandle(editor.handle);
	controller.onSnapshot(editor.handle.getSnapshot());
	editor.handle.setSelection({ anchor: 0, head: 8 });
	await render(PassageLanguage, { controller });
	return { controller, editor };
}
async function open() {
	await fireEvent.click(screen.getByRole('button', { name: /^Selected passage language:/ }));
	await waitFor(() => expect(screen.getByRole('searchbox')).toBeTruthy());
}
test('search assigns exact captured codepoints, separate from default; history and clear preserve text', async () => {
	const { controller, editor } = await setup();
	await open();
	await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'French' } });
	await fireEvent.click(screen.getByRole('button', { name: /^French$/ }));
	expect(controller.snapshot.text).toBe(source);
	expect(controller.language).toBe('en');
	expect(controller.snapshot.conversion?.model.languageRanges).toMatchObject([
		{ from: 0, to: 8, language: 'fr' }
	]);
	editor.handle.undo();
	expect(controller.snapshot.conversion?.model.languageRanges ?? []).toEqual([]);
	editor.handle.redo();
	expect(controller.snapshot.text).toBe(source);
	expect(controller.snapshot.conversion?.model.languageRanges[0]?.language).toBe('fr');
	await fireEvent.click(screen.getByRole('button', { name: 'Use document language' }));
	expect(controller.snapshot.conversion?.model.languageRanges ?? []).toEqual([]);
	expect(controller.snapshot.text).toBe(source);
});
test('custom tags keep boundary validation and native Escape restores trigger without taking editor input', async () => {
	const { controller, editor } = await setup();
	await open();
	await fireEvent.click(screen.getByText('Custom language code'));
	const input = screen.getByRole('textbox', { name: 'Language code' });
	await fireEvent.input(input, { target: { value: 'bad code!' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Use custom code' }));
	expect(controller.snapshot.conversion?.model.languageRanges ?? []).toEqual([]);
	expect(screen.getByRole('dialog')).toBeTruthy();
	await fireEvent.input(input, { target: { value: 'zz-Latn-custom' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Use custom code' }));
	expect(controller.snapshot.conversion?.model.languageRanges[0]?.language).toBe('zz-Latn-custom');
	await open();
	await userEvent.keyboard('{Escape}');
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	await waitFor(() =>
		expect(document.activeElement).toBe(
			screen.getByRole('button', { name: /^Selected passage language:/ })
		)
	);
	expect(controller.snapshot.text).toBe(source);
	editor.handle.focus();
	await userEvent.keyboard('X');
	expect(controller.snapshot.text).toBe('X\nOther words');
});
test.each(['selection', 'text', 'profile', 'draft', 'revision'] as const)(
	'refuses stale %s while preserving the current document',
	async (change) => {
		const { controller, editor } = await setup();
		await open();
		if (change === 'selection') editor.handle.setSelection({ anchor: 9, head: source.length });
		if (change === 'text') editor.view.dispatch({ changes: { from: source.length, insert: '!' } });
		if (change === 'profile') controller.switchProfile('musixmatch');
		if (change === 'draft') await controller.createDraft();
		if (change === 'revision')
			controller.onSnapshot({ ...controller.snapshot, revision: controller.snapshot.revision + 1 });
		const before = controller.snapshot.text;
		await fireEvent.click(screen.getByRole('button', { name: /^French$/ }));
		await waitFor(() =>
			expect(screen.getByRole('dialog').textContent).toContain('Close and reopen')
		);
		expect(controller.snapshot.text).toBe(before);
		expect(controller.snapshot.conversion?.model.languageRanges ?? []).toEqual([]);
		await userEvent.keyboard('{Escape}');
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	}
);

test('native Escape still owns the modal after its focused result disappears', async () => {
	const { controller } = await setup();
	await open();
	await userEvent.keyboard('{ArrowDown}');
	await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'zzzz' } });
	await waitFor(() => expect(document.querySelector('.language-option')).toBeNull());
	await userEvent.keyboard('{Escape}');
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	expect(controller.snapshot.text).toBe(source);
});
