import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test } from 'vitest';
import DocumentTitle from './DocumentTitle.svelte';

describe('DocumentTitle', () => {
	afterEach(() => {
		cleanup();
	});

	test('keeps the active draft first and updates when the draft changes', async () => {
		const screen = render(DocumentTitle, { title: 'Test draft' });

		await waitFor(() => expect(document.title).toBe('Test draft · LyricLint'));

		await screen.rerender({ title: 'Next song' });
		await waitFor(() => expect(document.title).toBe('Next song · LyricLint'));

		await screen.rerender({ title: undefined });
		await waitFor(() => expect(document.title).toBe('LyricLint'));
	});
});
