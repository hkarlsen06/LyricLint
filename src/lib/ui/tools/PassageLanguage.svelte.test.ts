import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
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
async function setup(text = source, controlsOnly = false) {
	const { controller } = createTestWorkbench({ text });
	const host = document.createElement('div');
	document.body.append(host);
	const editor = createLyricEditor(host, {
		initialText: text,
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
	editor.handle.setSelection({ anchor: 0, head: Math.min(8, text.length) });
	await render(PassageLanguage, { controller, controlsOnly });
	return { controller, editor };
}
async function open() {
	await fireEvent.click(
		screen.getByRole('button', { name: /^(Selected passage|Selection) language:/ })
	);
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

test('keeps the selected language separate from hidden wording through history', async () => {
	const { controller, editor } = await setup('[Verse]\nMoon Star Sun');
	controller.switchProfile('musixmatch');
	expect(
		controller.applyConversionAction({
			kind: 'setPassageLanguage',
			range: { from: 5, to: 9 },
			language: 'de'
		})
	).toBe(true);
	expect(
		controller.applyConversionAction({
			kind: 'setForm',
			range: { from: 5, to: 9 },
			profile: 'genius',
			text: ''
		})
	).toBe(true);
	controller.switchProfile('genius');
	editor.handle.setSelection({ anchor: 0, head: controller.snapshot.text.length });
	const before = structuredClone(controller.snapshot.conversion?.model);
	if (!before) throw new Error('The hidden wording model is missing.');
	const hiddenLanguage = controller.snapshot.conversion?.model.languageRanges[0];
	await waitFor(() =>
		expect(screen.getByRole('button', { name: 'Selected passage language: English' })).toBeTruthy()
	);
	await open();
	await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'French' } });
	await fireEvent.click(screen.getByRole('button', { name: 'French' }));
	await waitFor(() =>
		expect(screen.getByRole('button', { name: 'Selected passage language: French' })).toBeTruthy()
	);
	expect(
		controller.snapshot.conversion?.model.languageRanges.find((range) => range.language === 'de')
	).toEqual(hiddenLanguage);
	expect(controller.snapshot.text).toBe('[Verse]\nMoon  Sun');
	editor.handle.undo();
	expect(controller.snapshot.conversion?.model).toEqual({ ...before, nextId: expect.any(Number) });
	expect(controller.snapshot.conversion?.model.nextId).toBeGreaterThanOrEqual(before.nextId);
	editor.handle.redo();
	expect(
		controller.snapshot.conversion?.model.languageRanges.find((range) => range.language === 'de')
	).toEqual(hiddenLanguage);
	controller.switchProfile('musixmatch');
	expect(controller.snapshot.text).toBe('Moon Star Sun');
	controller.switchProfile('genius');
	expect(controller.snapshot.text).toBe('[Verse]\nMoon  Sun');
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

for (const profile of ['genius', 'musixmatch'] as const) {
	test.each([
		{
			name: 'an override and unassigned words',
			assignments: [{ from: 0, to: 8, language: 'fr' }],
			label: 'Mixed languages'
		},
		{
			name: 'different overrides',
			assignments: [
				{ from: 0, to: 8, language: 'fr' },
				{ from: 8, to: source.length, language: 'de' }
			],
			label: 'Mixed languages'
		},
		{
			name: 'reviewed and unknown overrides',
			assignments: [
				{ from: 0, to: 8, language: 'fr' },
				{ from: 8, to: source.length, language: 'zz-Latn-custom' }
			],
			label: 'Mixed languages'
		},
		{
			name: 'adjacent overrides in the same language',
			assignments: [
				{ from: 0, to: 8, language: 'fr' },
				{ from: 8, to: source.length, language: 'fr' }
			],
			label: 'French'
		},
		{
			name: 'an override matching the document default',
			assignments: [{ from: 0, to: 8, language: 'en' }],
			label: 'English'
		}
	])(`reports the whole ${profile} selection for $name`, async ({ assignments, label }) => {
		const { controller, editor } = await setup();
		for (const { from, to, language } of assignments) {
			expect(
				controller.applyConversionAction({
					kind: 'setPassageLanguage',
					range: { from, to },
					language
				})
			).toBe(true);
		}
		controller.switchProfile(profile);
		editor.handle.setSelection({ anchor: 0, head: source.length });
		const before = JSON.stringify(controller.snapshot.conversion?.model);
		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: `Selected passage language: ${label}` })
			).toBeTruthy()
		);
		if (assignments.some((assignment) => assignment.language === 'zz-Latn-custom')) {
			expect(
				screen.getByText('zz-Latn-custom: language-independent checks and conversion only.')
			).toBeVisible();
			expect(screen.getByText('Reviewed language-specific rules for French.')).toBeVisible();
		}
		await open();
		if (assignments.some((assignment) => assignment.language === 'zz-Latn-custom')) {
			expect(
				within(screen.getByRole('dialog')).getByText(
					'zz-Latn-custom: language-independent checks and conversion only.'
				)
			).toBeVisible();
		}
		const current = screen.getByRole('dialog').querySelectorAll('[aria-current="true"]');
		expect(current).toHaveLength(label === 'Mixed languages' ? 0 : 1);
		if (label !== 'Mixed languages') expect(current[0].getAttribute('aria-label')).toBe(label);
		expect(controller.language).toBe('en');
		expect(controller.snapshot.text).toBe(source);
		expect(JSON.stringify(controller.snapshot.conversion?.model)).toBe(before);
	});
}

for (const text of ['Un beau jour', '[Verse]\nUn [beau](12345) jour']) {
	test.each([
		{ length: 4, label: 'French' },
		{ length: 2, label: 'Mixed languages' }
	])('reports $label inside transformed wording in ' + text, async ({ length, label }) => {
		const { controller, editor } = await setup(text);
		const from = text.indexOf('beau');
		expect(
			controller.applyConversionAction({
				kind: 'setPassageLanguage',
				range: { from, to: from + length },
				language: 'fr'
			})
		).toBe(true);
		expect(
			controller.applyConversionAction({
				kind: 'setForm',
				profile: 'musixmatch',
				range: { from, to: from + 4 },
				text: 'joli'
			})
		).toBe(true);
		controller.switchProfile('musixmatch');
		expect(controller.snapshot.text).toBe('Un joli jour');
		editor.handle.setSelection({ anchor: 4, head: 6 });
		const before = JSON.stringify(controller.snapshot.conversion?.model);
		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: `Selected passage language: ${label}` })
			).toBeTruthy()
		);
		expect(
			screen.getByRole('button', { name: `Selected passage language: ${label}` })
		).toBeDisabled();
		expect(JSON.stringify(controller.snapshot.conversion?.model)).toBe(before);

		controller.switchProfile('genius');
		expect(controller.snapshot.text).toBe(text);
	});
}

test.each([
	'[Verse: Mira]\nThe [silver 🌙 compass](123456) by the door\nNext English line',
	'[Verse: Mira]\nMoon and sun\n[Chorus]\nStars'
])('assigns complete syntax-spanning selections through the controller: %s', async (text) => {
	const { controller, editor } = await setup(text);
	editor.handle.setSelection({ anchor: 0, head: text.length });
	await open();
	await fireEvent.click(screen.getByRole('button', { name: /^French$/ }));
	expect(screen.queryByRole('dialog')).toBeNull();
	expect(controller.snapshot.text).toBe(text);
	const assigned = controller.snapshot.conversion;
	expect(assigned?.model.languageRanges).toMatchObject([
		{ from: 0, to: assigned?.model.content.length, language: 'fr' }
	]);
	expect(assigned?.model.defaultLanguage).toBe('en');
	editor.handle.undo();
	expect(controller.snapshot.conversion?.model.languageRanges ?? []).toEqual([]);
	editor.handle.redo();
	expect(controller.snapshot.conversion).toEqual(assigned);
	expect(controller.snapshot.text).toBe(text);
});

test('writing control keeps its slot, scope, coverage and stale refusal without Song controls', async () => {
	const { controller, editor } = await setup(source, true);
	const trigger = screen.getByRole('button', { name: 'Selection language: English' });
	expect(trigger.textContent).toContain('Selection language');
	expect(screen.queryByRole('heading', { name: 'Passage language' })).toBeNull();
	expect(screen.queryByRole('button', { name: 'Show passage' })).toBeNull();
	const before = trigger.getBoundingClientRect().toJSON();
	await open();
	expect(screen.getByRole('region', { name: 'Selected lyrics' }).textContent?.trim()).toBe(
		'Héllo 🌙'
	);
	expect(screen.getByText('Reviewed language-specific rules for English.')).toBeVisible();
	await fireEvent.click(screen.getByRole('button', { name: 'French' }));
	expect(controller.language).toBe('en');
	await waitFor(() => expect(document.activeElement).toBe(trigger));
	expect(trigger.getBoundingClientRect().toJSON()).toEqual(before);
	await open();
	editor.handle.setSelection({ anchor: 8, head: 0 });
	await fireEvent.click(screen.getByRole('button', { name: 'German' }));
	expect(screen.getByRole('dialog').textContent).toContain('Close and reopen');
	expect(controller.snapshot.conversion?.model.languageRanges[0]?.language).toBe('fr');
});

test('newly typed Genius lyrics can open writing language before a rich envelope exists', async () => {
	const { controller, editor } = await setup('', true);
	editor.handle.focus();
	await userEvent.keyboard('Héllo');
	editor.handle.setSelection({ anchor: 0, head: 5 });
	expect(controller.snapshot.conversion).toBeUndefined();
	await open();
	await fireEvent.click(screen.getByRole('button', { name: 'French' }));
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	expect(controller.snapshot.text).toBe('Héllo');
	expect(controller.snapshot.conversion?.model.languageRanges[0]?.language).toBe('fr');
});

test('writing language includes its visible label in the accessible control name', async () => {
	await setup(source, true);
	const trigger = screen.getByText('Selection language').closest('button');
	expect(trigger).toHaveAccessibleName('Selection language: English');
});
