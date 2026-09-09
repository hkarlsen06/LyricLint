import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import LanguagePicker from './LanguagePicker.svelte';

async function openPicker(): Promise<void> {
	await fireEvent.click(screen.getByRole('button', { name: /^Lyric language:/ }));
	await waitFor(() => expect(screen.getByRole('list', { name: 'Languages' })).toBeTruthy());
}

async function search(query: string): Promise<void> {
	await fireEvent.input(screen.getByRole('searchbox'), { target: { value: query } });
}

/** The one live region in this dialog, wherever it sits in the markup. */
function status(): HTMLElement {
	const region = document.querySelector<HTMLElement>('.language-dialog [role="status"]');
	if (!region) throw new Error('the results status line is not in the document');
	return region;
}

describe('LanguagePicker', () => {
	afterEach(cleanup);

	test('builds language options only while open and resets search with focus on reopening', async () => {
		const { controller } = createTestWorkbench();
		await render(LanguagePicker, { controller });
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
		await render(LanguagePicker, { controller });
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
		await render(LanguagePicker, { controller });
		await openPicker();

		expect(status().textContent?.trim()).toBe('');

		await search('english');
		await waitFor(() => expect(status().textContent?.trim()).toMatch(/^\d+ languages? match/u));

		// The no-match case says what the visible message says, rather than a zero.
		await search('zzzz');
		await waitFor(() => expect(status().textContent?.trim()).toBe('No languages match “zzzz”.'));
	});
});
