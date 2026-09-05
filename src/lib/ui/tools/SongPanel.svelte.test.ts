import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { WorkbenchController } from '../state/workbench.svelte.js';
import type { MediaPlayer, SongDetails } from '../state/media-player.svelte.js';
import type { MediaStore } from '../state/media-store.svelte.js';
import { createTestWorkbench, performer } from '../test-utils.js';
import SongPanel from './SongPanel.svelte';
import { DEFAULT_DRAFT_TITLE } from '$lib/persistence/draft-repository.js';

/*
 * The song half of the split tab. It carries only what is about the
 * transcription in front of the user — its metadata and the files it exports —
 * so the app-scoped sections (backup, local data, preferences) must never
 * appear here. Their home is `PreferencesPanel`.
 */
describe('SongPanel skimmability', () => {
	afterEach(cleanup);

	test('leaves only song-scoped sections here, with portable and project exports', () => {
		const { controller } = createTestWorkbench();
		const { container } = render(SongPanel, { controller });

		// A locally named draft can search for its song before anything is attached.
		expect([...container.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
			'Song metadata',
			'Document'
		]);
		expect((screen.getByRole('link', { name: 'Search YouTube' }) as HTMLAnchorElement).href).toBe(
			'https://www.youtube.com/results?search_query=Test%20draft'
		);

		const documentActions = [...container.querySelectorAll('section')]
			.find((section) => section.querySelector('h2')?.textContent === 'Document')
			?.querySelector('.tool-actions');
		expect(
			[...(documentActions?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim())
		).toEqual(['Export .txt', 'Export Scribe']);

		// App-management moved to the Preferences tab; none of it may be here, and
		// neither may the toolbar's own contrast action.
		expect(screen.queryByRole('button', { name: 'Copy lyrics' })).toBeNull();
		expect(screen.queryByRole('heading', { name: 'Workspace backup' })).toBeNull();
		expect(screen.queryByRole('heading', { name: 'Local data' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Reset LyricLint…' })).toBeNull();
		expect(screen.queryByRole('switch', { name: /Harper/u })).toBeNull();
	});

	test('says nothing about audio for a draft with none', () => {
		const { controller } = createTestWorkbench();
		render(SongPanel, { controller });

		expect(screen.queryByRole('button', { name: /audio/iu })).toBeNull();
		expect(screen.queryByRole('button', { name: /YouTube/iu })).toBeNull();
	});

	test('loads a remembered source directly from the Song tab', async () => {
		const reconnect = vi.fn(async () => {});
		const player: Partial<MediaPlayer> = { attached: false };
		const media: Partial<MediaStore> = {
			pendingName: 'Roc Boyz & Vinni — Håpløs',
			pendingSource: 'apple',
			busy: false,
			reconnect,
			player: player as MediaPlayer
		};
		const controller: WorkbenchController = {
			...createTestWorkbench().controller,
			media: media as MediaStore
		};
		render(SongPanel, { controller });

		await fireEvent.click(
			screen.getByRole('button', {
				name: 'Load Apple Music audio'
			})
		);
		expect(reconnect).toHaveBeenCalledOnce();
		// The picker itself lives in the workbench — the tray's note glyph, the
		// strip's pencil — so this tab names no second way into it.
		expect(screen.queryByRole('button', { name: 'Change audio source' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Add audio source' })).toBeNull();
	});
});

/*
 * The draft in one run of facts, over the files it turns into. A count worth
 * stating is one that could have been otherwise, so each waits until it has
 * something to report and an empty draft states nothing at all.
 */
describe('SongPanel document counts', () => {
	afterEach(cleanup);

	function documentSection(root: ParentNode): HTMLElement | undefined {
		return [...root.querySelectorAll('section')].find(
			(section) => section.querySelector('h2')?.textContent === 'Document'
		);
	}

	test('pluralizes the counts, singular at one', () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		const { container } = render(SongPanel, { controller });

		expect(documentSection(container)?.textContent).toContain('1 line · 1 section');
		expect(documentSection(container)?.textContent).not.toContain('1 lines');
		expect(documentSection(container)?.textContent).not.toContain('1 sections');
	});

	// The counts are one run of facts with interpuncts between them, exactly as
	// a diagnostic's meta line is — the performer count joins the run rather
	// than sitting in a spaced-apart group of its own.
	test('joins the performer count into the one interpunct run', () => {
		const { controller } = createTestWorkbench({
			text: '[Verse]\nA lyric',
			performers: [performer('p1', 'Ari', 0)]
		});
		const { container } = render(SongPanel, { controller });

		expect(documentSection(container)?.textContent).toContain('1 line · 1 section · 1 performer');
	});

	// This document has lines and sections but no performers, so the roster half
	// of the run is absent rather than reporting a zero. The voice-group count
	// is gone outright: it summed legend entries over the whole document —
	// offset-keyed, so three identical choruses counted three — which is a
	// number nobody could read anything from. Re-adding it is the specific
	// regression.
	test('omits a count until it has something to report', () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		const { container } = render(SongPanel, { controller });

		const text = documentSection(container)?.textContent ?? '';
		expect(text).not.toContain('0 performers');
		expect(text).not.toContain('voice group');
	});

	// The line count is of sung text only. Blank lines and bracket-shaped lines
	// — headers, an unclosed `[Bridge` — are structure, and the parser keeps
	// them out of `section.lines`; this pins that the counts inherit the
	// distinction rather than counting rows. A lone `[?]` is the exception the
	// parser makes: it wears the header's brackets but stands where a line
	// nobody could make out was sung, so it counts as the lyric it marks.
	test('counts only lyric lines', () => {
		const { controller } = createTestWorkbench({
			text: '[Verse 1]\nOne\nTwo\n\n[Chorus]\nThree\n   \n[?]\n[Bridge'
		});
		const { container } = render(SongPanel, { controller });

		expect(documentSection(container)?.textContent).toContain('4 lines');
	});

	test('states no counts at all for an empty document', () => {
		const { controller } = createTestWorkbench({ text: '' });
		const { container } = render(SongPanel, { controller });

		// Nothing counts anything, so nothing in the tab is a number — which is
		// a stricter claim than naming the counts that went.
		expect(documentSection(container)?.textContent).not.toMatch(/\d/u);
	});
});

/*
 * Line timings are a document-scoped delete, so they live here, in the section
 * about the timings they clear — next to the export, not beside `Delete all
 * local data`, which is a different scope and now a different tab. The two were
 * only ever together because both are destructive.
 */
describe('SongPanel line timings', () => {
	afterEach(cleanup);

	test('offers the draft’s line timings only while it has some, and clears them', async () => {
		const { controller, calls } = createTestWorkbench();
		const { container } = render(SongPanel, { controller });

		// Nothing timed: no `Timed lyrics` section, and no control offering to
		// delete nothing.
		expect(screen.queryByRole('heading', { name: 'Timed lyrics' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Delete line timings…' })).toBeNull();

		calls.lineAnchors = [{ line: 2, time: 1 }];
		controller.onLineAnchorsChanged();
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Delete line timings…' })).toBeTruthy()
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete line timings…' }));
		// In place, not a bordered danger box nested in the section.
		expect(container.querySelector('.confirm-block')).toBeNull();
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
 * Both facts are facts about the attached song, so the section carrying them
 * comes and goes with one — and each control comes and goes with its own fact.
 * A local file has neither and must draw no heading at all.
 */
describe('SongPanel song metadata', () => {
	afterEach(cleanup);

	function withSong(media: {
		artwork?: string;
		videoId?: string;
		songDetails?: SongDetails;
	}): WorkbenchController {
		const { controller } = createTestWorkbench();
		const player: Partial<MediaPlayer> = {
			artwork: media.artwork,
			songDetails: media.songDetails,
			name: 'Mul — Sensommer'
		};
		const store: Partial<MediaStore> = {
			videoId: media.videoId,
			player: player as MediaPlayer
		};
		return { ...controller, title: 'Mul — Sensommer', media: store as MediaStore };
	}

	function headings(container: HTMLElement): (string | null)[] {
		return [...container.querySelectorAll('h2')].map((heading) => heading.textContent);
	}

	/** Scoped by heading rather than by list class. */
	function songSection(container: HTMLElement): HTMLElement | undefined {
		return [...container.querySelectorAll('section')].find(
			(section) => section.querySelector('h2')?.textContent === 'Song metadata'
		);
	}

	test('offers each control only where its own fact exists, and leads the tab', () => {
		const { container } = render(SongPanel, {
			controller: withSong({
				artwork: 'https://i.scdn.co/image/640',
				songDetails: { isrc: 'USUG11500642' }
			})
		});

		expect(headings(container)[0]).toBe('Song metadata');
		expect(screen.getByRole('button', { name: 'Copy image URL' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Download album art' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Copy image URL' }).parentElement).toBe(
			screen.getByRole('button', { name: 'Download album art' }).parentElement
		);
		expect(
			screen.getByRole('button', { name: 'Copy image URL' }).parentElement?.classList
		).toContain('artwork-actions');
		expect(screen.queryByRole('button', { name: 'Copy YouTube link' })).toBeNull();
		const search = screen.getByRole('link', { name: 'Search YouTube' }) as HTMLAnchorElement;
		expect(search.href).toBe(
			'https://www.youtube.com/results?search_query=Mul%20%E2%80%94%20Sensommer'
		);
		expect(search.target).toBe('_blank');
		expect(search.querySelector('svg[aria-hidden="true"]')).toBeTruthy();

		const section = songSection(container)!;
		const actions = section.querySelector('.tool-actions') as HTMLElement;
		expect(getComputedStyle(actions).marginTop).toBe('16px');
	});

	test('copies the known artwork URL without downloading it', async () => {
		const copied: string[] = [];
		const clipboard: Partial<Clipboard> = {
			writeText: async (text: string) => void copied.push(text)
		};
		vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(clipboard as Clipboard);

		const controller = withSong({ artwork: 'https://i.scdn.co/image/640' });
		render(SongPanel, { controller });

		await fireEvent.click(screen.getByRole('button', { name: 'Copy image URL' }));
		await waitFor(() => expect(copied).toEqual(['https://i.scdn.co/image/640']));
		expect(screen.getByRole('button', { name: 'Image URL copied' })).toBeTruthy();
		expect(controller.feedback.announcement).toBe('Image URL copied.');
	});

	test('copies the watch page for an attached video, contacting nobody', async () => {
		const copied: string[] = [];
		const clipboard: Partial<Clipboard> = {
			writeText: async (text: string) => void copied.push(text)
		};
		vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(clipboard as Clipboard);

		render(SongPanel, {
			controller: withSong({ videoId: 'dQw4w9WgXcQ', artwork: 'https://i.ytimg.com/vi/x/hq.jpg' })
		});

		expect(screen.queryByRole('link', { name: 'Search YouTube' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Copy YouTube link' }));
		await waitFor(() => expect(copied).toEqual(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']));
	});

	test('draws no list for a source that knows only the artist and title', () => {
		const { container } = render(SongPanel, {
			controller: withSong({ songDetails: { artist: 'Mul', title: 'Sensommer' } })
		});

		expect(headings(container)).toContain('Song metadata');
		expect(songSection(container)?.querySelector('.metadata-list')).toBeNull();
		expect(screen.getByRole('link', { name: 'Search YouTube' })).toBeTruthy();
	});

	test('draws nothing for an untitled draft with no song facts or media', () => {
		const controller = { ...withSong({}), title: DEFAULT_DRAFT_TITLE } as WorkbenchController;
		const { container } = render(SongPanel, { controller });

		expect(headings(container)).not.toContain('Song metadata');
		expect(screen.queryByRole('link', { name: 'Search YouTube' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Copy image URL' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Download album art' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Copy YouTube link' })).toBeNull();
	});

	test('lists only the facts the catalogue actually carried', () => {
		const { container } = render(SongPanel, {
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
	 * exactly like working CSS: `space-between` flex pairs push two ends apart
	 * without putting space between them, so the first value long enough to wrap
	 * came back flush against its own term and read as one word.
	 */
	test('keeps a long value clear of its term, in a column with the others', () => {
		const { container } = render(SongPanel, {
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

describe('current line timing controls', () => {
	afterEach(cleanup);
	test('offers keyboard-reachable exact time, nudges, and clear-one while retaining other lines', async () => {
		const { controller, calls } = createTestWorkbench();
		controller.editor.getTimingLine = () => ({ line: 2, text: 'First lyric line' });
		controller.editor.setLineTiming = (line, time) => {
			calls.lineAnchors = calls.lineAnchors.filter((anchor) => anchor.line !== line);
			if (time !== undefined) calls.lineAnchors.push({ line, time });
			return true;
		};
		calls.lineAnchors = [
			{ line: 2, time: 12.34 },
			{ line: 3, time: 20 }
		];
		controller.onLineAnchorsChanged();
		const { container } = render(SongPanel, { controller });
		container.style.width = '300px';
		const field = screen.getByRole('spinbutton', { name: 'Time in seconds' }) as HTMLInputElement;
		const row = field.parentElement!.getBoundingClientRect();
		expect(field.getBoundingClientRect().width).toBeGreaterThan(100);
		expect(
			screen.getByRole('button', { name: 'Set time' }).getBoundingClientRect().right
		).toBeLessThanOrEqual(row.right);
		expect(field.value).toBe('12.34');
		await fireEvent.click(screen.getByRole('button', { name: 'Earlier 0.25s' }));
		expect(controller.currentLineTiming?.time).toBe(12.09);
		await fireEvent.input(field, { target: { value: '15.67' } });
		await fireEvent.submit(field.closest('form')!);
		expect(controller.currentLineTiming?.time).toBe(15.67);
		await fireEvent.click(screen.getByRole('button', { name: 'Clear line time' }));
		expect(calls.lineAnchors).toEqual([{ line: 3, time: 20 }]);
		expect(screen.queryByRole('button', { name: 'Earlier 0.25s' })).toBeNull();
		expect(field.value).toBe('');
	});
});
