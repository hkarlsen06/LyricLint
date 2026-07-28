import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import DocumentTitle from './DocumentTitle.svelte';

describe('DocumentTitle', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
	});

	test('keeps the active draft first and updates when the draft changes', async () => {
		const screen = render(DocumentTitle, { title: 'Test draft' });

		await waitFor(() => expect(document.title).toBe('Test draft · LyricLint'));

		await screen.rerender({ title: 'Next song' });
		await waitFor(() => expect(document.title).toBe('Next song · LyricLint'));

		await screen.rerender({ title: undefined });
		await waitFor(() => expect(document.title).toBe('LyricLint'));
	});

	test('a dev build with a tab label says that instead of the draft', async () => {
		vi.stubEnv('PUBLIC_DEV_TAB_TITLE', 'Dev');

		// The whole title, not a prefix on the draft's: a tab shows the first few
		// characters, so the label has to be all of them.
		render(DocumentTitle, { title: 'Test draft' });

		await waitFor(() => expect(document.title).toBe('Dev'));
	});
});
