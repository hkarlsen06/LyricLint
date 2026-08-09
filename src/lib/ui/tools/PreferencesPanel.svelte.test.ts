import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { WorkspaceBackupController, WorkspaceBackupState } from '$lib/persistence/backup.js';
import {
	configureStoragePersistence,
	ensurePersistentStorage,
	type PersistentStorageApi
} from '../state/storage-persistence.svelte.js';
import { createTestWorkbench } from '../test-utils.js';
import PreferencesPanel from './PreferencesPanel.svelte';

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

/*
 * The workspace half of the split tab. It carries the app-scoped sections and
 * the one setting the feedback asked for; none of the song-scoped controls
 * belong here.
 */
describe('PreferencesPanel skimmability', () => {
	afterEach(cleanup);

	test('leads with grammar checking and lists only app-scoped sections', () => {
		const { controller } = createTestWorkbench({
			backup: backupController({ supported: false, status: 'idle' })
		});
		const { container } = render(PreferencesPanel, { controller });

		expect([...container.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual([
			'Grammar checking',
			'Workspace backup',
			'Local data',
			'Reviewed rules'
		]);

		// Song-scoped controls belong to the Song tab.
		expect(screen.queryByRole('button', { name: 'Export .txt' })).toBeNull();
		expect(screen.queryByRole('heading', { name: 'Song metadata' })).toBeNull();
		expect(screen.queryByRole('button', { name: /line timings/u })).toBeNull();
		// The reset replaced `Delete all local data`; the old wording promised less
		// than the sweep now does, so re-adding it is the specific regression.
		expect(screen.queryByRole('button', { name: /Delete all local data/u })).toBeNull();
	});

	test('drops the backup section where no backup controller is present', () => {
		const { controller } = createTestWorkbench();
		const { container } = render(PreferencesPanel, { controller });

		expect([...container.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual([
			'Grammar checking',
			'Local data',
			'Reviewed rules'
		]);
	});
});

/*
 * The one toggle in the workbench. Default on — the feedback called the
 * corrections nice and only wanted a way out — persisted through the repository,
 * so it survives a reload and is covered by the backup and by delete-all.
 */
describe('PreferencesPanel grammar toggle', () => {
	afterEach(cleanup);

	test('reflects and writes the preference', async () => {
		const { controller, repository } = createTestWorkbench();
		const setPreference = vi.spyOn(repository, 'setPreference');
		render(PreferencesPanel, { controller });

		// A switch, not a checkbox — the state is carried by `aria-checked`.
		const toggle = screen.getByRole('switch', { name: 'Check grammar with Harper' });
		expect(toggle.getAttribute('aria-checked')).toBe('true');

		await fireEvent.click(toggle);
		expect(controller.grammarCheckEnabled).toBe(false);
		await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
		expect(setPreference).toHaveBeenCalledWith('grammarCheck', 'false');

		await fireEvent.click(toggle);
		expect(controller.grammarCheckEnabled).toBe(true);
		expect(setPreference).toHaveBeenLastCalledWith('grammarCheck', 'true');
	});
});

describe('PreferencesPanel destructive confirm', () => {
	afterEach(cleanup);

	test('confirms in place instead of opening a box inside the panel section', async () => {
		const { controller, repository } = createTestWorkbench();
		await controller.refreshDrafts();
		const { container } = render(PreferencesPanel, { controller });

		await fireEvent.click(screen.getByRole('button', { name: 'Reset LyricLint…' }));

		expect(container.querySelector('.confirm-block')).toBeNull();
		expect(screen.getByText(/Reset LyricLint to a fresh install\?/u)).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Reset LyricLint…' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Reset LyricLint' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.getByRole('button', { name: 'Reset LyricLint…' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Reset LyricLint…' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Reset LyricLint' }));
		await waitFor(async () => expect(await repository.list()).toEqual([]));
		expect(screen.getByRole('button', { name: 'Reset LyricLint…' })).toBeTruthy();
	});

	test('resets the grammar preference along with the data', async () => {
		const { controller, repository } = createTestWorkbench();
		await controller.refreshDrafts();
		render(PreferencesPanel, { controller });

		const toggle = screen.getByRole('switch', { name: 'Check grammar with Harper' });
		await fireEvent.click(toggle);
		expect(controller.grammarCheckEnabled).toBe(false);
		expect(await repository.getPreference('grammarCheck')).toBe('false');

		await fireEvent.click(screen.getByRole('button', { name: 'Reset LyricLint…' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Reset LyricLint' }));

		// The stored row is swept and the running session returns to the default,
		// so the switch may not go on reporting a preference that no longer exists.
		await waitFor(async () =>
			expect(await repository.getPreference('grammarCheck')).toBeUndefined()
		);
		await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
		expect(controller.grammarCheckEnabled).toBe(true);
	});
});

/*
 * The Local data section states whether "stays in this browser" is actually
 * durable, and only where the browser can answer. The module state is shared
 * with the boot page, so every test here resets it — one test's outcome must
 * not become the next test's boot state.
 */
describe('PreferencesPanel storage persistence', () => {
	afterEach(() => {
		configureStoragePersistence();
		cleanup();
	});

	function storageApi(overrides: Partial<PersistentStorageApi> = {}): PersistentStorageApi {
		return {
			persisted: async () => false,
			persist: async () => true,
			permissionState: async () => 'prompt' as const,
			...overrides
		};
	}

	test('says nothing while the state is unresolved', () => {
		configureStoragePersistence();
		const { controller } = createTestWorkbench();
		render(PreferencesPanel, { controller });

		expect(screen.queryByText(/Storage is/u)).toBeNull();
		expect(screen.queryByRole('button', { name: 'Protect storage' })).toBeNull();
	});

	test('offers the ask where the browser would prompt, and spends it on the press', async () => {
		configureStoragePersistence(storageApi());
		await ensurePersistentStorage();
		const { controller } = createTestWorkbench();
		render(PreferencesPanel, { controller });

		expect(screen.getByText(/Storage is best-effort/u)).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Protect storage' }));

		await waitFor(() => expect(screen.getByText(/Storage is protected/u)).toBeTruthy());
		// Granted, the control goes: there is nothing left for it to ask.
		expect(screen.queryByRole('button', { name: 'Protect storage' })).toBeNull();
	});

	test('states a refusal and offers no control that cannot deliver', async () => {
		configureStoragePersistence(storageApi({ permissionState: async () => 'denied' as const }));
		await ensurePersistentStorage();
		const { controller } = createTestWorkbench();
		render(PreferencesPanel, { controller });

		expect(screen.getByText(/declined protected storage/u)).toHaveClass(
			'backup-status--warning'
		);
		expect(screen.queryByRole('button', { name: 'Protect storage' })).toBeNull();
	});

	/*
	 * Measured rather than asserted by class, because the failure looks like
	 * working CSS: the flush pull aligns a quiet button's label with prose, and
	 * kept under the bordered `Protect storage` control it outdents the reset's
	 * box past the one above it instead.
	 */
	test('drops the reset row’s flush pull only while a control stands above it', async () => {
		configureStoragePersistence(storageApi());
		await ensurePersistentStorage();
		const { controller } = createTestWorkbench();
		render(PreferencesPanel, { controller });

		const rowOf = () =>
			screen.getByRole('button', { name: 'Reset LyricLint…' }).parentElement as HTMLElement;
		expect(parseFloat(getComputedStyle(rowOf()).marginInlineStart)).toBe(0);
		cleanup();

		// Under a sentence again — the granted state — the pull comes back so the
		// label lines up with the paragraph edge.
		configureStoragePersistence(storageApi({ persisted: async () => true }));
		await ensurePersistentStorage();
		const { controller: granted } = createTestWorkbench();
		render(PreferencesPanel, { controller: granted });

		expect(parseFloat(getComputedStyle(rowOf()).marginInlineStart)).toBeLessThan(0);
	});
});

describe('PreferencesPanel workspace backup', () => {
	afterEach(cleanup);

	test('downloads a full backup where direct file access is unavailable', async () => {
		const backup = backupController({ supported: false, status: 'idle' });
		const exportLog: Array<{ text: string; filename: string }> = [];
		const { controller } = createTestWorkbench({ backup, exportLog });
		render(PreferencesPanel, { controller });

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
		render(PreferencesPanel, { controller });

		expect(await screen.findByText(/choose “Allow on every visit”/u)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Allow backup access' }));

		expect(backup.requestPermission).toHaveBeenCalledOnce();
	});

	test('imports immediately without a destructive confirmation', async () => {
		const backup = backupController({ supported: false, status: 'idle' });
		const { controller } = createTestWorkbench({ backup });
		const { container } = render(PreferencesPanel, { controller });
		const file = new File(['{}'], 'July backup.json', { type: 'application/json' });
		const input = container.querySelector<HTMLInputElement>('input[type="file"]');
		expect(input).toBeTruthy();

		await fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

		await waitFor(() => expect(backup.restore).toHaveBeenCalledWith(file));
		expect(screen.queryByText(/replaces every local draft/iu)).toBeNull();
		expect(screen.queryByRole('button', { name: /restore/iu })).toBeNull();
	});
});
