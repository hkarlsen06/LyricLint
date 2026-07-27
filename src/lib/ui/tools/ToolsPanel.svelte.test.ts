import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { WorkspaceBackupController, WorkspaceBackupState } from '$lib/persistence/backup.js';
import type { WorkbenchController } from '../state/workbench.svelte.js';
import { createTestWorkbench } from '../test-utils.js';
import ToolsPanel from './ToolsPanel.svelte';

function backupController(state: WorkspaceBackupState): WorkspaceBackupController {
	return {
		state: () => state,
		subscribe(listener) {
			listener(state);
			return () => {};
		},
		serialize: vi.fn(async () => '{"format":"lyriclint-workspace"}'),
		restore: vi.fn(async () => 1),
		chooseFile: vi.fn(async (beforeWrite) => {
			await beforeWrite();
			return true;
		}),
		requestPermission: vi.fn(async (beforeWrite) => {
			await beforeWrite();
			return true;
		}),
		unlink: vi.fn(async () => {}),
		schedule: vi.fn(),
		flush: vi.fn(async () => {}),
		destroy: vi.fn()
	};
}

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

/*
 * The panel is meant to be skimmed, and these pin the two rules that make it
 * skimmable rather than the wording of any one line.
 *
 * Attaching audio is deliberately absent: it moved to the status bar's picker,
 * whose own tests cover it. Re-adding an audio control here is the drift these
 * assertions exist to catch — a third action in `Document` would put the row
 * back to wrapping, which is how the panel got messy the first time.
 */
describe('ToolsPanel skimmability', () => {
	afterEach(cleanup);

	test('gives each section a heading over at most two things, and Document one row of actions', () => {
		const { controller } = createTestWorkbench({
			backup: backupController({ supported: false, status: 'idle' })
		});
		const { container } = render(ToolsPanel, { controller });

		expect([...container.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual([
			'Document',
			'Workspace backup',
			'Local data',
			'Reviewed rules'
		]);

		const documentActions = container.querySelector('section .tool-actions');
		expect(
			[...(documentActions?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim())
		).toEqual(['Copy lyrics', 'Export .txt']);
	});

	test('says nothing about audio, and makes the local-data claim exactly once', () => {
		const { controller } = createTestWorkbench();
		const { container } = render(ToolsPanel, { controller });

		expect(screen.queryByRole('button', { name: /audio/iu })).toBeNull();
		expect(screen.queryByRole('button', { name: /YouTube/iu })).toBeNull();
		expect(screen.queryByLabelText('YouTube link')).toBeNull();

		// The trailing sentence that used to hang outside every section is gone,
		// folded into `Local data` with the rest of the story.
		expect(container.querySelector('.offline-note')).toBeNull();
		expect(container.querySelectorAll('.panel-content > p')).toHaveLength(0);
	});
});

/*
 * The cover is a fact about the attached song, so the section that saves it
 * comes and goes with one. A source with no picture — a local file, and every
 * source before the catalogue read lands — must draw no heading at all, or the
 * panel carries an action for something that is not there.
 */
describe('ToolsPanel album art', () => {
	afterEach(cleanup);

	function withArtwork(artwork: string | undefined): WorkbenchController {
		const { controller } = createTestWorkbench();
		return {
			...controller,
			media: { player: { artwork, name: 'Mul — Sensommer' } }
		} as unknown as WorkbenchController;
	}

	test('offers the download only while a source has published a cover', () => {
		const { container } = render(ToolsPanel, {
			controller: withArtwork('https://i.scdn.co/image/640')
		});

		expect([...container.querySelectorAll('h3')].map((heading) => heading.textContent)).toContain(
			'Album art'
		);
		expect(screen.getByRole('button', { name: 'Download album art' })).toBeTruthy();
	});

	test('draws nothing for a source with no cover', () => {
		const { container } = render(ToolsPanel, { controller: withArtwork(undefined) });

		expect(
			[...container.querySelectorAll('h3')].map((heading) => heading.textContent)
		).not.toContain('Album art');
		expect(screen.queryByRole('button', { name: 'Download album art' })).toBeNull();
	});
});

describe('ToolsPanel workspace backup', () => {
	afterEach(cleanup);

	test('downloads a full backup where direct file access is unavailable', async () => {
		const backup = backupController({ supported: false, status: 'idle' });
		const exportLog: Array<{ text: string; filename: string }> = [];
		const { controller } = createTestWorkbench({ backup, exportLog });
		render(ToolsPanel, { controller });

		await fireEvent.click(await screen.findByRole('button', { name: 'Download backup' }));

		expect(backup.serialize).toHaveBeenCalledOnce();
		expect(exportLog).toEqual([
			{ text: '{"format":"lyriclint-workspace"}', filename: 'LyricLint backup.json' }
		]);
	});

	test('offers Chrome persistent access for a linked file that needs permission', async () => {
		const backup = backupController({
			supported: true,
			linkedFileName: 'LyricLint backup.json',
			permission: 'prompt',
			status: 'idle'
		});
		const { controller } = createTestWorkbench({ backup });
		render(ToolsPanel, { controller });

		expect(await screen.findByText(/choose “Allow on every visit”/u)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Allow backup access' }));

		expect(backup.requestPermission).toHaveBeenCalledOnce();
	});

	test('imports immediately without a destructive confirmation', async () => {
		const backup = backupController({ supported: false, status: 'idle' });
		const { controller } = createTestWorkbench({ backup });
		const { container } = render(ToolsPanel, { controller });
		const file = new File(['{}'], 'July backup.json', { type: 'application/json' });
		const input = container.querySelector<HTMLInputElement>('input[type="file"]');
		expect(input).toBeTruthy();

		await fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

		await waitFor(() => expect(backup.restore).toHaveBeenCalledWith(file));
		expect(screen.queryByText(/replaces every local draft/iu)).toBeNull();
		expect(screen.queryByRole('button', { name: /restore/iu })).toBeNull();
	});
});
