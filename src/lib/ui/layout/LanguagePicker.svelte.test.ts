import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import { createTestWorkbench } from '../test-utils.js';
import LanguagePicker from './LanguagePicker.svelte';

async function openPicker(): Promise<void> {
	await fireEvent.click(screen.getByRole('button', { name: /^Lyric language:/ }));
	await waitFor(() => expect(screen.getByRole('list', { name: 'Languages' })).toBeTruthy());
}

async function search(query: string): Promise<void> {
	await fireEvent.input(screen.getByRole('searchbox'), { target: { value: query } });
}

/** The search-results live region, outside the list. */
function status(): HTMLElement {
	const region = document.querySelector<HTMLElement>('.language-dialog [role="status"]');
	if (!region) throw new Error('the results status line is not in the document');
	return region;
}

describe('LanguagePicker', () => {
	afterEach(cleanup);

	test.each([360, 390, 1280])('keeps language choices touch-sized at %ipx', async (width) => {
		await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
		await page.viewport(width, 900);
		try {
			expect(matchMedia('(pointer: coarse)').matches).toBe(true);
			await render(LanguagePicker, { language: 'en', onchoose: () => {} });
			await openPicker();
			await document.fonts.ready;
			for (const row of screen
				.getByRole('list', { name: 'Languages' })
				.querySelectorAll('button')) {
				const bounds = row.getBoundingClientRect();
				expect(bounds.height).toBeGreaterThanOrEqual(44);
				expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
			}
		} finally {
			await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
			await page.viewport(800, 600);
		}
	});

	test('discloses reviewed and custom language limits beside the choice', async () => {
		const view = await render(LanguagePicker, {
			language: 'fr-CA',
			custom: true,
			showCoverage: true,
			onchoose: () => {}
		});
		expect(screen.getByText('Reviewed language-specific rules for French.')).toBeVisible();
		await openPicker();
		expect(screen.getByRole('button', { name: 'Afrikaans' }).textContent).toContain(
			'Language-independent only'
		);
		expect(screen.getByRole('button', { name: 'Afrikaans' })).toHaveAccessibleDescription(
			'Language-independent only'
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		await waitFor(() => expect(document.querySelector('.language-option')).toBeNull());
		await view.rerender({ language: 'zz-Latn-custom' });
		expect(
			screen.getByText('zz-Latn-custom: language-independent checks and conversion only.')
		).toBeVisible();
	});

	test.each([
		['français', 'French', 'fr'],
		['日本語', 'Japanese', 'ja']
	])('finds a language by its native name %s', async (query, name, tag) => {
		let chosen: string | undefined;
		await render(LanguagePicker, {
			language: 'en',
			onchoose: (value) => {
				chosen = value;
			}
		});
		await openPicker();
		await search(query);
		await fireEvent.click(screen.getByRole('button', { name }));
		expect(chosen).toBe(tag);
	});

	test('shows the language scope and keeps long choices within the same control', async () => {
		const view = await render(LanguagePicker, {
			language: 'es',
			label: 'Document language',
			expandedLabel: true,
			onchoose: () => {}
		});
		view.container.style.width = '250px';
		const trigger = screen.getByRole('button', { name: 'Document language: Spanish' });
		trigger.style.width = '100%';
		expect(trigger.textContent).toContain('Document language: Spanish');
		const height = trigger.getBoundingClientRect().height;
		await view.rerender({ language: 'zz-Latn-custom', label: 'Selected passage language' });
		expect(trigger.textContent).toContain('Selected passage language: zz-Latn-custom');
		expect(trigger.getBoundingClientRect().height).toBe(height);
		expect(trigger.scrollWidth).toBeLessThanOrEqual(trigger.clientWidth);
	});

	test('Escape closes a searched picker and returns focus without changing language', async () => {
		const { controller } = createTestWorkbench();
		await render(LanguagePicker, {
			language: controller.language,
			onchoose: (tag) => controller.setLanguage(tag)
		});
		const trigger = screen.getByRole('button', { name: /^Lyric language:/ });
		await openPicker();
		await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'French' } });
		await userEvent.keyboard('{Escape}');
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(document.activeElement).toBe(trigger);
		expect(controller.language).toBe('en');
		await openPicker();
		expect(screen.getByRole('searchbox')).toHaveValue('');
	});

	test('builds language options only while open and resets search with focus on reopening', async () => {
		const { controller } = createTestWorkbench();
		await render(LanguagePicker, {
			language: controller.language,
			recentLanguages: controller.recentLanguages,
			onchoose: (tag) => controller.setLanguage(tag)
		});
		const trigger = screen.getByRole('button', { name: /^Lyric language:/ });
		expect(document.querySelector('.language-option')).toBeNull();
		await openPicker();
		expect(document.activeElement).toBe(screen.getByRole('searchbox'));
		await search('zzzz');
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		await waitFor(() => expect(document.querySelector('.language-search')).toBeNull());
		expect(document.activeElement).toBe(trigger);
		await openPicker();
		expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
		expect(document.activeElement).toBe(screen.getByRole('searchbox'));
		await fireEvent.click(screen.getByRole('button', { name: 'English (United Kingdom)' }));
		expect(controller.language).toBe('en-GB');
		await waitFor(() => expect(document.querySelector('.language-option')).toBeNull());
		expect(document.activeElement).toBe(trigger);
	});

	// The whole results list used to sit inside `aria-live="polite"`, so every
	// keystroke queued dozens of re-rendered options to be read out. What the
	// typist wants to hear is how many are left.
	test('the results list is not a live region, and the count is', async () => {
		const { controller } = createTestWorkbench();
		await render(LanguagePicker, {
			language: controller.language,
			recentLanguages: controller.recentLanguages,
			onchoose: (tag) => controller.setLanguage(tag)
		});
		await openPicker();

		const list = screen.getByRole('list', { name: 'Languages' });
		expect(list.closest('[aria-live]')).toBeNull();
		expect(list.closest('[role="status"]')).toBeNull();
		expect(status().closest('.language-results')).toBeNull();
	});

	// Mounted at every state and empty until it has something to say: a region
	// that arrives with its text already in it is not an update, and is not read.
	test('the status line mounts empty and reports each narrowing', async () => {
		const { controller } = createTestWorkbench();
		await render(LanguagePicker, {
			language: controller.language,
			recentLanguages: controller.recentLanguages,
			onchoose: (tag) => controller.setLanguage(tag)
		});
		await openPicker();

		expect(status().textContent?.trim()).toBe('');

		await search('english');
		await waitFor(() => expect(status().textContent?.trim()).toMatch(/^\d+ languages? match/u));

		// The no-match case says what the visible message says, rather than a zero.
		await search('zzzz');
		await waitFor(() => expect(status().textContent?.trim()).toBe('No languages match “zzzz”.'));
	});
});
