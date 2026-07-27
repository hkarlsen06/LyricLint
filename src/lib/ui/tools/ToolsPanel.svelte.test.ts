import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { WorkspaceBackupController, WorkspaceBackupState } from '$lib/persistence/backup.js';
import type { WorkbenchController } from '../state/workbench.svelte.js';
import type { SongDetails } from '../state/media-player.svelte.js';
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

	test('offers the draft’s line timings only while it has some, and clears them', async () => {
		const { controller, calls } = createTestWorkbench();
		const { container } = render(ToolsPanel, { controller });

		// Nothing timed: no control offering to delete nothing.
		expect(screen.queryByRole('button', { name: 'Delete line timings…' })).toBeNull();

		calls.lineAnchors = [{ line: 2, time: 1 }];
		controller.onLineAnchorsChanged();
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Delete line timings…' })).toBeTruthy()
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete line timings…' }));
		// In place, and the competing question is hidden while this one is open.
		expect(container.querySelector('.confirm-block')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Delete all local data…' })).toBeNull();
		expect(screen.getByText(/1 line timing on this transcription/u)).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Delete line timings' }));
		expect(calls.lineAnchors).toEqual([]);
		expect(controller.lineAnchorCount).toBe(0);
		await waitFor(() =>
			expect(screen.queryByRole('button', { name: 'Delete line timings…' })).toBeNull()
		);
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

	test('gives each section a heading over at most two things, and Document one export', () => {
		const { controller } = createTestWorkbench({
			backup: backupController({ supported: false, status: 'idle' })
		});
		const { container } = render(ToolsPanel, { controller });

		// `Document` sits near the foot: an export is wanted once, on the way out.
		expect([...container.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual([
			'Workspace backup',
			'Local data',
			'Document',
			'Reviewed rules'
		]);

		const documentActions = [...container.querySelectorAll('section')]
			.find((section) => section.querySelector('h3')?.textContent === 'Document')
			?.querySelector('.tool-actions');
		expect(
			[...(documentActions?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim())
		).toEqual(['Export .txt']);

		// The toolbar carries this one; a second copy here is the drift to catch.
		expect(screen.queryByRole('button', { name: 'Copy lyrics' })).toBeNull();
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
 * Both facts are facts about the attached song, so the section carrying them
 * comes and goes with one — and each control comes and goes with its own fact.
 * A local file has neither and must draw no heading at all, or the panel offers
 * an action for something that is not there.
 */
describe('ToolsPanel song metadata', () => {
	afterEach(cleanup);

	function withSong(media: {
		artwork?: string;
		videoId?: string;
		songDetails?: SongDetails;
	}): WorkbenchController {
		const { controller } = createTestWorkbench();
		return {
			...controller,
			media: {
				videoId: media.videoId,
				player: {
					artwork: media.artwork,
					songDetails: media.songDetails,
					name: 'Mul — Sensommer'
				}
			}
		} as unknown as WorkbenchController;
	}

	function headings(container: HTMLElement): (string | null)[] {
		return [...container.querySelectorAll('h3')].map((heading) => heading.textContent);
	}

	/** Scoped by heading: `Reviewed rules` draws a `.metadata-list` of its own. */
	function songSection(container: HTMLElement): HTMLElement | undefined {
		return [...container.querySelectorAll('section')].find(
			(section) => section.querySelector('h3')?.textContent === 'Song metadata'
		);
	}

	test('offers each control only where its own fact exists', () => {
		const { container } = render(ToolsPanel, {
			controller: withSong({ artwork: 'https://i.scdn.co/image/640' })
		});

		// It leads: the one section about the song rather than about the app.
		expect(headings(container)[0]).toBe('Song metadata');
		expect(screen.getByRole('button', { name: 'Download album art' })).toBeTruthy();
		// Spotify and Apple publish a cover and no video, so the link must not be
		// offered for a song there is no link to.
		expect(screen.queryByRole('button', { name: 'Copy YouTube link' })).toBeNull();
	});

	test('copies the watch page for an attached video, contacting nobody', async () => {
		const copied: string[] = [];
		const clipboard = { writeText: async (text: string) => void copied.push(text) };
		vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(clipboard as unknown as Clipboard);

		render(ToolsPanel, {
			controller: withSong({ videoId: 'dQw4w9WgXcQ', artwork: 'https://i.ytimg.com/vi/x/hq.jpg' })
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Copy YouTube link' }));
		await waitFor(() => expect(copied).toEqual(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']));
	});

	/*
	 * `songDetails` is not the same question as "has this list anything to show".
	 * Artist and title live on it too — the cover band sets them at opposite ends
	 * of a row — and Spotify reports only those two, so gating on the object
	 * itself opens an empty `<dl>` under a heading.
	 */
	test('draws no list for a source that knows only the artist and title', () => {
		const { container } = render(ToolsPanel, {
			controller: withSong({ songDetails: { artist: 'Mul', title: 'Sensommer' } })
		});

		expect(headings(container)).not.toContain('Song metadata');
		expect(songSection(container)).toBeUndefined();
	});

	test('draws nothing for a song with neither', () => {
		const { container } = render(ToolsPanel, { controller: withSong({}) });

		expect(headings(container)).not.toContain('Song metadata');
		expect(screen.queryByRole('button', { name: 'Download album art' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Copy YouTube link' })).toBeNull();
	});

	/*
	 * Separate fields rather than one copied block, because that is how they are
	 * typed in on the other end. A field the catalogue did not carry is absent
	 * from the list entirely — an empty `Label` row is a fact this application
	 * does not have, dressed up as one it does.
	 *
	 * This is everything known, not the shorter list the copy receipt draws: the
	 * ISRC is here because a reader may want it, and not there because Genius's
	 * song form has no field to paste it into.
	 */
	test('lists only the facts the catalogue actually carried', () => {
		const { container } = render(ToolsPanel, {
			controller: withSong({
				songDetails: {
					releaseDate: '2015-03-23',
					writers: 'Kygo, Parker Ighile',
					label: 'Ultra Records',
					isrc: 'USUG11500642'
				}
			})
		});

		const list = songSection(container)!.querySelector('.metadata-list') as HTMLElement;
		expect([...list.querySelectorAll('dt')].map((term) => term.textContent)).toEqual([
			'Released',
			'Writers',
			'Label',
			'ISRC'
		]);
		expect(list.querySelector('time')?.getAttribute('datetime')).toBe('2015-03-23');
		expect(list.textContent).toContain('Ultra Records');
	});

	/*
	 * Measured rather than trusted, because the failure this replaces looked
	 * exactly like working CSS: the rows were `space-between` flex pairs, which
	 * pushes two ends apart without putting any space between them, so the first
	 * value long enough to wrap came back flush against its own term and read as
	 * one word — `WritersTigergutt101, …`.
	 *
	 * Two assertions, and the second is the one that would have caught it: every
	 * value starts at one left edge, which is only true while the grid is on the
	 * list rather than on each row.
	 */
	test('keeps a long value clear of its term, in a column with the others', () => {
		const { container } = render(ToolsPanel, {
			controller: withSong({
				songDetails: {
					releaseDate: '2026-03-20',
					writers: 'Tigergutt101, Mathias Nilsen & Kjell Øverland',
					label: 'RCA Records Label'
				}
			})
		});

		const list = songSection(container)!.querySelector('.metadata-list') as HTMLElement;
		const terms = [...list.querySelectorAll('dt')];
		const values = [...list.querySelectorAll('dd')];

		for (const [index, value] of values.entries()) {
			const term = terms[index] as HTMLElement;
			expect(value.getBoundingClientRect().left).toBeGreaterThan(
				term.getBoundingClientRect().right
			);
		}

		const edges = new Set(values.map((value) => Math.round(value.getBoundingClientRect().left)));
		expect(edges.size).toBe(1);
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
