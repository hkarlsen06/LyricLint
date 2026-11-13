import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EditorHandle } from '#lib/core/types.js';
import { importDocument, renderProfile } from '#lib/conversion/index.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import type { LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';

const lyrics = [
	'Back down the block',
	'Counting every light',
	'',
	'Hold the line',
	'Hold the line',
	'',
	'Morning through the glass',
	'',
	'Hold the line',
	'Hold the line'
].join('\n');

async function mount(source = lyrics, sourceProfile: 'genius' | 'musixmatch' = 'musixmatch') {
	const imported = importDocument({ text: source, language: 'en', profile: sourceProfile });
	if (!imported.ok) throw new Error(imported.refusal.message);
	const projected = renderProfile(imported.value, 'musixmatch');
	if (!projected.ok) throw new Error(projected.refusal.message);
	const text = projected.value.text;
	let handle: EditorHandle | undefined;
	const callbacks = {
		onSnapshot: vi.fn(),
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onSectionDetailRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onAnnouncement: vi.fn(),
		onConversionAction: vi.fn(
			(action) =>
				handle?.dispatchConversionAction?.(action, handle.getSnapshot().revision)?.ok ?? false
		)
	} satisfies LyricEditorCallbacks;
	await render(EditorPane, {
		props: {
			initialText: text,
			initialConversion: createConversionEnvelope(
				imported.value,
				'musixmatch',
				profilePolicyVersions
			),
			context: { language: 'en', performers: [], ruleSetVersion: 'test', profile: 'musixmatch' },
			callbacks,
			onready: (ready: EditorHandle) => {
				handle = ready;
			}
		}
	});
	await vi.waitFor(() => expect(handle).toBeDefined());
	if (!handle) throw new Error('The editor did not publish its handle.');
	const ready = handle;
	return {
		handle: ready,
		callbacks,
		async openAt(needle: string, occurrence = 0) {
			let at = -1;
			for (let found = 0; found <= occurrence; found++) at = text.indexOf(needle, at + 1);
			ready.setSelection({ anchor: at, head: at });
			ready.focus();
			const modifier = navigator.platform.toLocaleLowerCase().includes('mac') ? 'Meta' : 'Control';
			await userEvent.keyboard(`{${modifier}>}{Shift>}h{/Shift}{/${modifier}}`);
			// The first open loads the overlays; the card is ready when its list has the keys.
			await expect.element(page.getByRole('listbox')).toHaveFocus();
		},
		tags: () =>
			[...document.querySelectorAll('.ll-conversion-section')].map((tag) => tag.textContent)
	};
}

describe('tagging a stanza in a headerless draft', () => {
	it('tags the stanza around the caret with one key and leaves the lyrics exact', async () => {
		const run = await mount();
		await run.openAt('Counting');
		const card = page.getByRole('dialog', { name: 'Tag this stanza' });
		await expect.element(card).toMatchTextContent('Back down the block');

		await userEvent.keyboard('v');

		await expect.element(card).not.toBeInTheDocument();
		expect(run.tags()).toEqual(['Verse']);
		expect(run.handle.getSnapshot().text).toBe(lyrics);
		expect(run.callbacks.onConversionAction).toHaveBeenCalledWith({
			kind: 'insertSection',
			at: 0,
			type: 'Verse'
		});
		expect(run.callbacks.onAnnouncement).toHaveBeenCalledWith('Verse tag added on line 1.');
		await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toHaveFocus();
	});

	it('starts on the tag of an identically worded stanza, so Enter repeats it', async () => {
		const run = await mount();
		await run.openAt('Hold the line');
		await userEvent.keyboard('c');
		await run.openAt('Hold the line', 2);

		const suggested = page.getByRole('option', { name: /^Chorus/u });
		await expect.element(suggested).toHaveAttribute('data-active');
		await expect.element(suggested).toMatchTextContent('suggested');
		await userEvent.keyboard('{Enter}');

		expect(run.tags()).toEqual(['Chorus', 'Chorus']);
	});

	it('changes, removes or opens the options of a tag pressed in the lyrics', async () => {
		const run = await mount();
		await run.openAt('Morning');
		await userEvent.keyboard('v');
		const tag = () => page.getByRole('button', { name: /^Edit .* details$/u });

		await tag().click();
		const card = page.getByRole('dialog', { name: 'Change section tag' });
		await expect
			.element(card.getByRole('option', { name: /Verse/u }))
			.toHaveAttribute('aria-selected', 'true');
		await userEvent.keyboard('b');
		expect(run.tags()).toEqual(['Bridge']);

		await tag().click();
		await card.getByRole('button', { name: 'Section options' }).click();
		expect(run.callbacks.onSectionDetailRequest).toHaveBeenCalledTimes(1);
		expect(run.tags()).toEqual(['Bridge']);

		await tag().click();
		await card.getByRole('button', { name: 'Remove tag' }).click();
		expect(run.tags()).toEqual([]);
		expect(run.handle.getSnapshot().text).toBe(lyrics);
	});

	it('closes on Escape without a tag and hands the caret back', async () => {
		const run = await mount();
		await run.openAt('Morning');
		await userEvent.keyboard('{Escape}');

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(run.callbacks.onConversionAction).not.toHaveBeenCalled();
		await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toHaveFocus();
	});

	it('offers no removal or options for a stanza that begins no section', async () => {
		const run = await mount();
		await run.openAt('Morning');
		const card = page.getByRole('dialog');
		await expect.element(card.getByRole('button', { name: 'Remove tag' })).not.toBeInTheDocument();
		await expect
			.element(card.getByRole('button', { name: 'Section options' }))
			.not.toBeInTheDocument();
	});

	it('changes the tag that was pressed when two sections share an offset', async () => {
		const run = await mount('[Intro]\n[Verse]\nBack down the block', 'genius');
		expect(run.tags()).toEqual(['Intro · Empty section', 'Verse']);

		await page.getByRole('button', { name: 'Edit Verse details' }).click();
		await expect
			.element(page.getByRole('option', { name: /^Verse/u }))
			.toHaveAttribute('aria-selected', 'true');
		await userEvent.keyboard('b');

		expect(run.tags()).toEqual(['Intro · Empty section', 'Bridge']);
	});

	it('draws no section rows for a host that takes no section requests', async () => {
		const imported = importDocument({ text: '[Verse 1]\nOne', language: 'en', profile: 'genius' });
		if (!imported.ok) throw new Error(imported.refusal.message);
		await render(EditorPane, {
			props: {
				initialText: '[Verse 1]\nOne',
				initialConversion: createConversionEnvelope(
					imported.value,
					'genius',
					profilePolicyVersions
				),
				context: { language: 'en', performers: [], ruleSetVersion: 'test' },
				callbacks: {
					onSnapshot: vi.fn(),
					onAssignRequest: vi.fn(),
					onSectionHeaderRequest: vi.fn(),
					onDiagnosticActivate: vi.fn(),
					onAnnouncement: vi.fn()
				}
			}
		});
		await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
		expect(document.querySelector('.ll-conversion-heading')).toBeNull();
	});
});
