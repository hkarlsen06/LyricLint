import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import ToolsPanel from './ToolsPanel.svelte';

describe('ToolsPanel destructive confirm', () => {
	afterEach(cleanup);

	test('confirms in place instead of opening a box inside the panel section', async () => {
		const { controller, repository } = createTestWorkbench();
		await controller.refreshDrafts();
		const { container } = render(ToolsPanel, { controller });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete all local data…' }));

		// The confirm replaces the trigger in the same section rather than
		// revealing a bordered danger box nested inside it.
		expect(container.querySelector('.confirm-block')).toBeNull();
		expect(screen.getByText('Delete every local draft? This cannot be undone.')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Delete all local data…' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Delete all local data' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.getByRole('button', { name: 'Delete all local data…' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Delete all local data…' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete all local data' }));
		await waitFor(async () => expect(await repository.list()).toEqual([]));
		expect(screen.getByRole('button', { name: 'Delete all local data…' })).toBeTruthy();
	});
});
