import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { tick } from 'svelte';
import youtubeIcon from '#lib/assets/youtube-icon.svg';
import type { WorkbenchController } from '../state/workbench.svelte.js';
import type { MediaPlayer, SongDetails } from '../state/media-player.svelte.js';
import type { MediaStore } from '../state/media-store.svelte.js';
import { createTestWorkbench, diagnostic, performer } from '../test-utils.js';
import { importDocument } from '#lib/conversion/import.js';
import { renderProfile } from '#lib/conversion/index.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import { createLyricEditor } from '#lib/editor/create-editor.js';
import SongPanel from './SongPanel.svelte';
import { DEFAULT_DRAFT_TITLE } from '#lib/persistence/draft-repository.js';

describe('SongPanel recovery originals', () => {
	afterEach(cleanup);

	test.each([
		{ kind: 'conversionRecovery', available: false },
		{ kind: 'conversionRecovery', available: true },
		{ kind: 'originalRecovery', available: false },
		{ kind: 'originalRecovery', available: true }
	] as const)(
		'shows $kind original export only with local ownership ($available)',
		async ({ kind, available }) => {
			const text = '[Verse]\nExact latest lyric';
			const result = importDocument({ text, profile: 'genius', language: 'en' });
			if (!result.ok) throw new Error(result.refusal.message);
			const checkpoint = createConversionEnvelope(result.value, 'genius', profilePolicyVersions);
			const { controller, repository, initialDraft } = createTestWorkbench();
			const reference = {
				sourceDraftId: initialDraft.id,
				localSourceDraftId: available ? initialDraft.id : null,
				reason: 'These latest lyrics need their retained details restored.'
			};
			await repository.create({
				...initialDraft,
				id: 'protected-recovery-ui',
				title: 'Protected recovery',
				text,
				...(kind === 'conversionRecovery'
					? { conversion: checkpoint, conversionRecovery: { ...reference, text, checkpoint } }
					: { originalRecovery: reference })
			});
			await controller.openDraft('protected-recovery-ui');
			await render(SongPanel, { controller });
			expect(screen.getByRole('button', { name: 'Export recovery Scribe' })).toBeTruthy();
			expect(controller.snapshot.text).toBe(text);
			expect(controller.snapshot[kind]).toMatchObject(reference);
			const original = screen.queryByRole('button', { name: 'Export original data' });
			const unavailable = screen.queryByText(/The original data is unavailable in this workspace/u);
			if (available) {
				expect(original).toBeTruthy();
				expect(unavailable).toBeNull();
			} else {
				expect(original).toBeNull();
				expect(unavailable).toBeTruthy();
			}
		}
	);
});

/*
 * The song half of the split tab. It carries only what is about the
 * transcription in front of the user (its metadata and the files it exports)
 * so the app-scoped sections (backup, local data, preferences) must never
 * appear here. Their home is `PreferencesPanel`.
 */
describe('SongPanel skimmability', () => {
	afterEach(cleanup);

	test('leaves only song-scoped sections here, with portable and project exports', async () => {
		const { controller } = createTestWorkbench();
		const { container } = await render(SongPanel, { controller });

		// A locally named draft can search for its song before anything is attached.
		expect([...container.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
			'Document',
			'Passage language',
			'Song metadata',
			'Genius page'
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

	test('says nothing about audio for a draft with none', async () => {
		const { controller } = createTestWorkbench();
		await render(SongPanel, { controller });

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
		await render(SongPanel, { controller });

		await fireEvent.click(
			screen.getByRole('button', {
				name: 'Load Apple Music audio'
			})
		);
		expect(reconnect).toHaveBeenCalledOnce();
		// The picker opens from the workbench tray, so this tab names no second way into it.
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

	test('pluralizes the counts, singular at one', async () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		const { container } = await render(SongPanel, { controller });

		expect(documentSection(container)?.textContent).toContain('1 line · 1 stanza');
		expect(documentSection(container)?.textContent).not.toContain('1 lines');
		expect(documentSection(container)?.textContent).not.toContain('1 sections');
	});

	// The counts are one run of facts with interpuncts between them, exactly as
	// a diagnostic's meta line is; the performer count joins the run rather
	// than sitting in a spaced-apart group of its own.
	test('joins the performer count into the one interpunct run', async () => {
		const { controller } = createTestWorkbench({
			text: '[Verse]\nA lyric',
			performers: [performer('p1', 'Ari', 0)]
		});
		const { container } = await render(SongPanel, { controller });

		expect(documentSection(container)?.textContent).toContain('1 line · 1 stanza · 1 performer');
	});

	// This document has lines and sections but no performers, so the roster half
	// of the run is absent rather than reporting a zero. The voice-group count
	// is gone outright: it summed legend entries over the whole document
	// (offset-keyed, so three identical choruses counted three), which is a
	// number nobody could read anything from. Re-adding it is the specific
	// regression.
	test('omits a count until it has something to report', async () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		const { container } = await render(SongPanel, { controller });

		const text = documentSection(container)?.textContent ?? '';
		expect(text).not.toContain('0 performers');
		expect(text).not.toContain('voice group');
	});

	// The line count is of sung text only. Blank lines and bracket-shaped lines
	// (headers, an unclosed `[Bridge`) are structure, and the parser keeps
	// them out of `section.lines`; this pins that the counts inherit the
	// distinction rather than counting rows. A lone `[?]` is the exception the
	// parser makes: it wears the header's brackets but stands where a line
	// nobody could make out was sung, so it counts as the lyric it marks.
	test('counts only lyric lines', async () => {
		const { controller } = createTestWorkbench({
			text: '[Verse 1]\nOne\nTwo\n\n[Chorus]\nThree\n   \n[?]\n[Bridge'
		});
		const { container } = await render(SongPanel, { controller });

		expect(documentSection(container)?.textContent).toContain('4 lines');
	});

	test.each(['\n', '\r\n'])(
		'does not count adjacent Genius headings or empty musical sections as stanzas with %j',
		async (newline) => {
			const { controller } = createTestWorkbench({
				text: ['[Verse]', 'One', '[Chorus]', 'Two', '', '[Outro]'].join(newline)
			});
			const { container } = await render(SongPanel, { controller });
			expect(documentSection(container)?.textContent).toContain('2 lines · 1 stanza');
		}
	);

	test('states no counts at all for an empty document', async () => {
		const { controller } = createTestWorkbench({ text: '' });
		const { container } = await render(SongPanel, { controller });

		// Nothing counts anything, so nothing in the tab is a number, which is
		// a stricter claim than naming the counts that went.
		expect(documentSection(container)?.textContent).not.toMatch(/\d/u);
	});
});

/*
 * Line timings are a document-scoped delete, so they live here, in the section
 * about the timings they clear, next to the export, not beside `Delete all
 * local data`, which is a different scope and now a different tab. The two were
 * only ever together because both are destructive.
 */
describe('SongPanel line timings', () => {
	afterEach(cleanup);

	test('offers the draft’s line timings only while it has some, and clears them', async () => {
		const { controller, calls } = createTestWorkbench();
		const { container } = await render(SongPanel, { controller });

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
 * comes and goes with one, and each control comes and goes with its own fact.
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

	test('offers each control only where its own fact exists', async () => {
		const { container } = await render(SongPanel, {
			controller: withSong({
				artwork: 'https://i.scdn.co/image/640',
				songDetails: { isrc: 'USUG11500642' }
			})
		});

		expect(headings(container)).toContain('Song metadata');
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
		expect(search.querySelector('img[alt=""]')?.getAttribute('src')).toBe(youtubeIcon);

		const section = songSection(container)!;
		const actions = section.querySelector('.tool-actions') as HTMLElement;
		expect(getComputedStyle(actions).marginTop).toBe('16px');
	});

	test.each([360, 390, 600])(
		'keeps file output reachable with long song facts at %ipx',
		async (width) => {
			const controller = withSong({
				songDetails: {
					album: 'A very long album name that wraps across several lines in a narrow phone panel',
					writers:
						'Åsa Andersson, Bjørn Berg, A very long credited songwriter name & Another writer',
					label: 'A long record label and distribution credit that must wrap',
					releaseDate: '2026-03-20',
					isrc: 'NOABC2600001'
				}
			});
			controller.setGeniusUrl('https://genius.com/Asa-a-long-song-name-lyrics');
			const { container } = await render(SongPanel, { controller });
			container.style.width = `${width}px`;
			const top = container.getBoundingClientRect().top;
			const exports = ['Export .txt', 'Export Scribe'].map((name) =>
				screen.getByRole('button', { name })
			);
			const before = exports.map((button) => button.getBoundingClientRect().toJSON());
			for (const rect of before) expect(rect.bottom - top).toBeLessThan(300);
			expect(
				screen.getByText('A long record label and distribution credit that must wrap')
			).toBeVisible();
			await fireEvent.click(screen.getByText('Clear this transcription', { exact: true }));
			expect(exports.map((button) => button.getBoundingClientRect().toJSON())).toEqual(before);
			expect(screen.getAllByRole('button', { name: 'Export .txt' })).toHaveLength(1);
			expect(screen.getAllByRole('button', { name: 'Export Scribe' })).toHaveLength(1);
		}
	);

	test('copies the known artwork URL without downloading it', async () => {
		const copied: string[] = [];
		const clipboard: Partial<Clipboard> = {
			writeText: async (text: string) => void copied.push(text)
		};
		vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(clipboard as Clipboard);

		const controller = withSong({ artwork: 'https://i.scdn.co/image/640' });
		await render(SongPanel, { controller });

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

		await render(SongPanel, {
			controller: withSong({ videoId: 'dQw4w9WgXcQ', artwork: 'https://i.ytimg.com/vi/x/hq.jpg' })
		});

		expect(screen.queryByRole('link', { name: 'Search YouTube' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Copy YouTube link' }));
		await waitFor(() => expect(copied).toEqual(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']));
	});

	test('draws no list for a source that knows only the artist and title', async () => {
		const { container } = await render(SongPanel, {
			controller: withSong({ songDetails: { artist: 'Mul', title: 'Sensommer' } })
		});

		expect(headings(container)).toContain('Song metadata');
		expect(songSection(container)?.querySelector('.metadata-list')).toBeNull();
		expect(screen.getByRole('link', { name: 'Search YouTube' })).toBeTruthy();
	});

	test('draws nothing for an untitled draft with no song facts or media', async () => {
		const controller = { ...withSong({}), title: DEFAULT_DRAFT_TITLE } as WorkbenchController;
		const { container } = await render(SongPanel, { controller });

		expect(headings(container)).not.toContain('Song metadata');
		expect(screen.queryByRole('link', { name: 'Search YouTube' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Copy image URL' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Download album art' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Copy YouTube link' })).toBeNull();
	});

	test('lists only the facts the catalogue actually carried', async () => {
		const { container } = await render(SongPanel, {
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
	test('keeps a long value clear of its term, in a column with the others', async () => {
		const { container } = await render(SongPanel, {
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
	test.each([undefined, 12.34])(
		'keeps an unsaved time through same-line snapshots (saved time %s)',
		async (time) => {
			const { controller, calls } = createTestWorkbench();
			controller.editor.getTimingLine = () => ({ line: 2, text: 'First lyric line' });
			controller.editor.setLineTiming = (line, value) => {
				calls.lineAnchors = value === undefined ? [] : [{ line, time: value }];
				return true;
			};
			calls.lineAnchors = time === undefined ? [] : [{ line: 2, time }];
			controller.onLineAnchorsChanged();
			await render(SongPanel, { controller });
			const field = screen.getByRole('spinbutton', { name: 'Time in seconds' });
			await fireEvent.input(field, { target: { value: '5' } });
			controller.onSnapshot({ ...controller.snapshot, selection: { anchor: 1, head: 1 } });
			await tick();
			await waitFor(() => expect(field).toHaveValue(5));
			expect(screen.getByRole('button', { name: 'Set time' })).toBeEnabled();
			await fireEvent.submit(field.closest('form')!);
			expect(calls.lineAnchors).toEqual([{ line: 2, time: 5 }]);
		}
	);

	test('resets unsaved time when the lyric line, its text, saved time, or draft changes', async () => {
		const { controller, calls, repository, initialDraft } = createTestWorkbench();
		controller.editor.getTimingLine = (position) =>
			position < 8
				? { line: 2, text: controller.snapshot.text }
				: { line: 3, text: 'Another lyric line' };
		calls.lineAnchors = [{ line: 3, time: 20 }];
		controller.onLineAnchorsChanged();
		await render(SongPanel, { controller });
		const field = screen.getByRole('spinbutton', { name: 'Time in seconds' });
		await fireEvent.input(field, { target: { value: '5' } });
		controller.onSnapshot({ ...controller.snapshot, selection: { anchor: 9, head: 9 } });
		await waitFor(() => expect(field).toHaveValue(20));
		await fireEvent.input(field, { target: { value: '6' } });
		controller.onSnapshot({ ...controller.snapshot, selection: { anchor: 0, head: 0 } });
		await waitFor(() => expect(field).toHaveValue(null));
		await fireEvent.input(field, { target: { value: '7' } });
		controller.onSnapshot({ ...controller.snapshot, text: '[Verse]\nEdited lyric' });
		await waitFor(() => expect(field).toHaveValue(null));
		await fireEvent.input(field, { target: { value: '8' } });
		calls.lineAnchors = [{ line: 2, time: 10 }];
		controller.onLineAnchorsChanged();
		await waitFor(() => expect(field).toHaveValue(10));
		await fireEvent.input(field, { target: { value: '9' } });
		await repository.create({
			...initialDraft,
			id: 'another-timing-draft',
			text: controller.snapshot.text,
			lineAnchors: [{ line: 2, time: 10 }]
		});
		await controller.openDraft('another-timing-draft');
		await waitFor(() => expect(field).toHaveValue(10));
	});

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
		const { container } = await render(SongPanel, { controller });
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

describe('Genius page link', () => {
	afterEach(cleanup);

	test.each([300, 600])(
		'stores, opens, and clears a link without shifting content at %ipx',
		async (width) => {
			const { controller } = createTestWorkbench({ text: '' });
			const { container } = await render(SongPanel, { controller });
			container.style.width = `${width}px`;
			const field = screen.getByRole('textbox', { name: 'Genius page link' }) as HTMLInputElement;
			const document = screen.getByRole('heading', { name: 'Document' });
			const before = document.getBoundingClientRect().top;
			const url = `https://genius.com/Artist-${'long-song-title-'.repeat(20)}lyrics`;
			await fireEvent.input(field, { target: { value: url } });
			await fireEvent.change(field);
			expect(controller.geniusUrl).toBe(url);
			expect(screen.getByRole('link', { name: 'Open Genius page' }).getAttribute('href')).toBe(url);
			expect(document.getBoundingClientRect().top).toBe(before);
			expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(
				container.getBoundingClientRect().right
			);
			expect(parseFloat(getComputedStyle(field).fontSize)).toBeGreaterThanOrEqual(16);
			const draftId = controller.draftId;
			await controller.createDraft();
			await waitFor(() => expect(field.isConnected).toBe(false));
			const nextField = screen.getByRole('textbox', {
				name: 'Genius page link'
			}) as HTMLInputElement;
			expect(nextField.value).toBe('');
			await controller.openDraft(draftId);
			await waitFor(() => expect(controller.geniusUrl).toBe(url));
			const restored = screen.getByRole('textbox', {
				name: 'Genius page link'
			}) as HTMLInputElement;
			expect(restored.value).toBe(url);
			await fireEvent.input(restored, { target: { value: 'https://example.com/song' } });
			await fireEvent.change(restored);
			expect(controller.geniusUrl).toBe(url);
			expect(restored.validity.valid).toBe(false);
			await fireEvent.input(restored, { target: { value: '' } });
			await fireEvent.change(restored);
			expect(controller.geniusUrl).toBeUndefined();
			expect(screen.queryByRole('link', { name: 'Open Genius page' })).toBeNull();
		}
	);
});

/*
 * Song is a record of the song, not a list of jobs. Listening decisions and
 * repeat expansion draw only once Review has asked for them through a
 * diagnostic's Review action; clearing lives with the document it clears
 * rather than in the header.
 */
describe('SongPanel conversion restraint', () => {
	afterEach(cleanup);

	function withConversion(source = '[Verse]\nTwo stars') {
		const imported = importDocument({ text: source, profile: 'genius', language: 'en' });
		if (!imported.ok) throw new Error(imported.refusal.message);
		const rendered = renderProfile(imported.value, 'musixmatch');
		if (!rendered.ok) throw new Error(rendered.refusal.message);
		const workbench = createTestWorkbench({
			text: rendered.value.text,
			selection: { anchor: 0, head: 0 }
		});
		workbench.controller.onSnapshot({
			...workbench.controller.snapshot,
			conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions)
		});
		return workbench;
	}

	async function withLiveConversion(source: string) {
		const { controller } = createTestWorkbench({ text: source });
		const host = document.createElement('div');
		document.body.append(host);
		const editor = createLyricEditor(host, {
			initialText: source,
			context: { language: 'en', performers: [], ruleSetVersion: 'test' },
			callbacks: {
				onSnapshot: (snapshot) => controller.onSnapshot(snapshot),
				onAssignRequest: vi.fn(),
				onSectionHeaderRequest: vi.fn(),
				onDiagnosticActivate: vi.fn(),
				onAnnouncement: vi.fn()
			}
		});
		controller.setEditorHandle(editor.handle);
		editor.handle.switchProfile!('musixmatch');
		const view = await render(SongPanel, { controller });
		return {
			controller,
			view,
			dispose() {
				editor.destroy();
				host.remove();
			}
		};
	}

	test.each([300, 600])(
		'groups document language and classification without changing lyrics at %ipx',
		async (width) => {
			const run = await withLiveConversion('[Verse: Mira]\nHéllo 🌙\nOther words stay exact');
			try {
				run.view.container.style.width = `${width}px`;
				const documentSection = screen
					.getByRole('heading', { name: 'Document' })
					.closest('section');
				if (!documentSection) throw new Error('Document section missing');
				const documentControls = within(documentSection);
				const summary = documentControls.getByText('Language and content type', { exact: true });
				const settings = summary.closest('details');
				expect(settings?.open).toBe(false);
				await fireEvent.click(summary);
				const picker = documentControls.getByRole('button', {
					name: 'Document language: English'
				});
				const classification = documentControls.getByRole('combobox', {
					name: 'Content type'
				});
				expect(screen.getAllByRole('combobox', { name: 'Content type' })).toHaveLength(1);
				expect(screen.queryByText('Document settings', { exact: true })).toBeNull();
				for (const control of [picker, classification])
					expect(control.getBoundingClientRect().right).toBeLessThanOrEqual(
						run.view.container.getBoundingClientRect().right
					);
				expect(classification.getBoundingClientRect().top).toBeGreaterThanOrEqual(
					picker.getBoundingClientRect().bottom
				);
				const text = run.controller.snapshot.text;
				await fireEvent.click(picker);
				await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'Spanish' } });
				await fireEvent.click(screen.getByRole('button', { name: 'Spanish' }));
				expect(run.controller.language).toBe('es');
				const model = structuredClone(run.controller.snapshot.conversion?.model);
				await fireEvent.change(classification, { target: { value: 'translation' } });
				expect(run.controller.snapshot.conversion?.model).toEqual({
					...model,
					contentKind: 'translation'
				});
				expect(run.controller.snapshot.text).toBe(text);
				run.controller.undo();
				expect(run.controller.snapshot.conversion?.model).toEqual(model);
				run.controller.undo();
				expect(run.controller.language).toBe('en');
				run.controller.redo();
				run.controller.redo();
				expect(run.controller.language).toBe('es');
				expect(run.controller.snapshot.conversion?.model.contentKind).toBe('translation');
				expect(run.controller.snapshot.text).toBe(text);
			} finally {
				run.dispose();
			}
		}
	);

	test.each(['previous', 'next'] as const)(
		'keeps the surviving section selected and focused after merging into %s, with exact Undo',
		async (direction) => {
			const source = '[Verse]\nOne [silver](123456) line\n[Chorus]\nTwo';
			const { controller, dispose } = await withLiveConversion(source);
			try {
				const before = controller.snapshot.conversion;
				const sections = before!.model.sections;
				const chosen = sections[direction === 'next' ? 0 : 1]!;
				const survivor = sections[direction === 'next' ? 1 : 0]!;
				const chooser = screen.getByRole('combobox', { name: 'Choose a section' });
				await fireEvent.change(chooser, { target: { value: chosen.id } });
				await fireEvent.click(screen.getByText('More section options'));
				const merge = screen.getByRole('button', { name: `Merge into ${direction} section` });
				merge.focus();
				await fireEvent.click(merge);
				await waitFor(() =>
					expect(
						screen.getByRole('heading', { name: `Section 1 · ${survivor.name}` })
					).toHaveFocus()
				);
				expect(chooser).toHaveValue(survivor.id);
				expect(controller.geniusText).toBe(survivor.header + 'One [silver](123456) line\nTwo');
				controller.undo();
				await waitFor(() => expect(controller.snapshot.conversion).toEqual(before));
				expect(controller.geniusText).toBe(source);
				controller.redo();
				await waitFor(() => expect(controller.snapshot.conversion!.model.sections).toHaveLength(1));
				expect(chooser).toHaveValue(survivor.id);
			} finally {
				dispose();
			}
		}
	);

	test('keeps action focus after a section move and parent refresh, while new navigation still focuses the heading', async () => {
		const run = await withLiveConversion('[Verse]\nOne\n[Chorus]\nTwo');
		try {
			const section = run.controller.snapshot.conversion!.model.sections[1]!;
			run.controller.editor.setSelection({ anchor: 0, head: 0 });
			run.controller.openSectionDetails(section.id, 'review');
			const heading = await screen.findByRole('heading', { name: 'Section 2 · Chorus' });
			await waitFor(() => expect(heading).toHaveFocus());
			await fireEvent.click(screen.getByText('More section options'));
			const move = screen.getByRole('button', { name: 'Move to cursor' });
			move.focus();
			await fireEvent.click(move);
			await run.view.rerender({ controller: run.controller });

			expect(run.controller.snapshot.conversion!.model.content).toBe('One\nTwo');
			expect(
				run.controller.snapshot.conversion!.model.sections.find((entry) => entry.id === section.id)
					?.at
			).toBe(0);
			expect(move).toHaveFocus();
			run.controller.openSectionDetails(section.id, 'review');
			await waitFor(() => expect(heading).toHaveFocus());
		} finally {
			run.dispose();
		}
	});

	test('returns focus to the chooser after removing the last boundary and restores its prompt', async () => {
		const { controller, dispose } = await withLiveConversion('[Verse]\nWords');
		try {
			const chooser = screen.getByRole('combobox', { name: 'Choose a section' });
			const sectionId = controller.snapshot.conversion!.model.sections[0]!.id;
			await fireEvent.change(chooser, { target: { value: sectionId } });
			await fireEvent.click(screen.getByText('More section options'));
			const remove = screen.getByRole('button', { name: 'Remove boundary' });
			remove.focus();
			await fireEvent.click(remove);
			await waitFor(() => expect(chooser).toHaveFocus());
			expect(chooser).toHaveValue('');
			expect((chooser as HTMLSelectElement).selectedOptions[0]!.textContent).toContain(
				'0 musical sections'
			);
			expect(controller.geniusText).toBe('Words');
		} finally {
			dispose();
		}
	});

	test('keeps the chosen section and action focus when different performer voices refuse a merge', async () => {
		const source = '[Verse: Mira]\nOne\n[Chorus: Noor]\nTwo';
		const { controller, dispose } = await withLiveConversion(source);
		try {
			const chooser = screen.getByRole('combobox', { name: 'Choose a section' });
			const sectionId = controller.snapshot.conversion!.model.sections[1]!.id;
			await fireEvent.change(chooser, { target: { value: sectionId } });
			await fireEvent.click(screen.getByText('More section options'));
			const merge = screen.getByRole('button', { name: 'Merge into previous section' });
			merge.focus();
			await fireEvent.click(merge);
			expect(merge).toHaveFocus();
			expect(chooser).toHaveValue(sectionId);
			expect(controller.feedback.announcement).toContain('different voice styles');
			expect(controller.geniusText).toBe(source);
		} finally {
			dispose();
		}
	});

	test.each([360, 960])(
		'creates and immediately opens a typed musical section with distinct stanza counts at %ipx',
		async (width) => {
			const lyrics = 'A paper moon\nAbove the road\n\nStay beside me';
			const { controller } = createTestWorkbench({ text: lyrics });
			const host = document.createElement('div');
			document.body.append(host);
			const editor = createLyricEditor(host, {
				initialText: lyrics,
				context: { language: 'en', performers: [], ruleSetVersion: 'test' },
				callbacks: {
					onSnapshot: (snapshot) => controller.onSnapshot(snapshot),
					onAssignRequest: vi.fn(),
					onSectionHeaderRequest: vi.fn(),
					onDiagnosticActivate: vi.fn(),
					onAnnouncement: vi.fn()
				}
			});
			try {
				controller.setEditorHandle(editor.handle);
				editor.handle.switchProfile!('musixmatch');
				const { container } = await render(SongPanel, { controller });
				container.style.width = `${width}px`;
				expect(screen.getByRole('option', { name: '0 musical sections' })).toBeTruthy();
				expect(container.textContent).toContain('2 stanzas');
				await fireEvent.click(screen.getByText('Add a section', { exact: true }));
				const insert = screen.getByRole('button', { name: 'Insert boundary at cursor' });
				expect(insert).toBeDisabled();
				await fireEvent.change(screen.getByRole('combobox', { name: 'New section type' }), {
					target: { value: 'Verse' }
				});
				await fireEvent.click(insert);
				await waitFor(() =>
					expect(screen.getByRole('heading', { name: 'Section 1 · Verse' })).toHaveFocus()
				);
				expect(screen.getByRole('option', { name: '1 musical section' })).toBeTruthy();
				expect(container.textContent).toContain('2 stanzas');
				const type = screen.getByRole('combobox', { name: 'Section type' });
				const before = type.getBoundingClientRect();
				await fireEvent.click(screen.getByText('More section options'));
				expect(type.getBoundingClientRect().top).toBe(before.top);
				const label = screen.getByRole('textbox', { name: 'Genius section label' });
				expect(label.getBoundingClientRect().right).toBeLessThanOrEqual(
					container.getBoundingClientRect().right
				);
				expect(parseFloat(getComputedStyle(label).fontSize)).toBeGreaterThanOrEqual(16);
				await fireEvent.change(label, { target: { value: 'Verse 2' } });
				await fireEvent.change(label, { target: { value: '[Chorus]' } });
				expect(controller.feedback.announcement).toContain('without brackets');
				expect(label).toHaveValue('Verse 2');
				editor.handle.switchProfile!('genius');
				expect(controller.snapshot.text).toBe('[Verse 2]\n' + lyrics);
			} finally {
				editor.destroy();
				host.remove();
			}
		}
	);

	test('lists metadata without the listening tasks until Review asks', async () => {
		const { controller } = withConversion();
		const { container } = await render(SongPanel, { controller });

		expect([...container.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
			'Document',
			'Passage language',
			'Song metadata',
			'Genius page',
			'Sections'
		]);
		expect(screen.queryByText('Decisions that need listening')).toBeNull();
		expect(screen.queryByText('Expand a repeated passage')).toBeNull();
		// Clearing is here, quiet, because the draft has lyrics.
		expect(screen.getByRole('button', { name: 'Clear lyrics and retained details…' })).toBeTruthy();
	});

	test.each([300, 600])(
		'shows one section editor with structural actions disclosed at %ipx',
		async (width) => {
			const { controller } = withConversion(
				'[Verse: A very long performer name that wraps across the section]\nOne very long lyric preview that must never stretch the panel beyond the visible viewport or clip a field at its right edge\n\n[Chorus]\nTwo'
			);
			const { container } = await render(SongPanel, { controller });
			container.style.width = `${width}px`;
			expect(screen.queryByRole('combobox', { name: 'Section type' })).toBeNull();
			const first = screen.getByRole('combobox', { name: 'Choose a section' });
			const options = [...first.querySelectorAll('option')];
			const top = first.getBoundingClientRect().top;
			expect(first.getBoundingClientRect().right).toBeLessThanOrEqual(
				container.getBoundingClientRect().right
			);
			await fireEvent.change(first, { target: { value: options[1]!.value } });
			expect(first.getBoundingClientRect().top).toBe(top);
			expect(screen.getAllByRole('combobox', { name: 'Section type' })).toHaveLength(1);
			expect(screen.getByRole('button', { name: 'Move to cursor' })).not.toBeVisible();
			const field = screen.getByRole('combobox', { name: 'Section type' });
			expect(parseFloat(getComputedStyle(field).fontSize)).toBeGreaterThanOrEqual(16);
			expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(
				container.getBoundingClientRect().right
			);
			await fireEvent.click(screen.getByText('More section options'));
			expect(screen.getByRole('button', { name: 'Move to cursor' })).toBeVisible();
			await fireEvent.change(first, { target: { value: options[2]!.value } });
			expect(screen.queryByRole('heading', { name: /Section 1/ })).toBeNull();
			expect(screen.getAllByRole('combobox', { name: 'Section type' })).toHaveLength(1);
		}
	);

	test('opens and focuses section creation when Review requests missing boundaries', async () => {
		const { controller } = withConversion('Under the moon');
		await render(SongPanel, { controller });
		expect(screen.getByRole('button', { name: 'Insert boundary at cursor' })).not.toBeVisible();
		controller.openSectionDetails('new', 'review');
		await waitFor(() => expect(screen.getByText('Add a section', { exact: true })).toHaveFocus());
		expect(screen.getByRole('button', { name: 'Insert boundary at cursor' })).toBeVisible();
		await fireEvent.click(screen.getByRole('button', { name: 'Back to Review' }));
		expect(controller.activeTab).toBe('linter');
	});

	test('keeps diagnostic tasks out of Song', async () => {
		const { controller } = withConversion('[Verse]\nI saw 2 stars');
		controller.openConversionReview(
			diagnostic({
				ruleId: 'mxm.numbers.context',
				severity: 'suggestion',
				message: 'Confirm how the quantity is sung.'
			})
		);
		// The stub editor holds its own selection; publish it the way a real
		// editor's snapshot would so the passage form draws.
		controller.onSnapshot({ ...controller.snapshot, selection: { anchor: 0, head: 5 } });
		await render(SongPanel, { controller });

		expect(screen.queryByRole('heading', { name: 'Quantity in the selected passage' })).toBeNull();
		expect(controller.activeTab).toBe('linter');
		expect(screen.queryByText('Expand a repeated passage')).toBeNull();
	});

	test('offers no clearing for an empty draft', async () => {
		const { controller } = createTestWorkbench({ text: '' });
		await render(SongPanel, { controller });

		expect(screen.queryByRole('button', { name: /Clear lyrics/u })).toBeNull();
	});

	test('confirms clearing in place and carries it out', async () => {
		const { controller, editor } = withConversion();
		const dispatch = vi.fn(() => ({ ok: true }) as const);
		editor.dispatchConversionAction = dispatch;
		await render(SongPanel, { controller });

		await fireEvent.click(screen.getByText('Clear this transcription', { exact: true }));
		const trigger = screen.getByRole('button', { name: 'Clear lyrics and retained details…' });
		const top = trigger.getBoundingClientRect().top;
		await fireEvent.click(trigger);
		expect(screen.getByRole('button', { name: 'Delete lyrics and details' })).toBe(trigger);
		expect(trigger.getBoundingClientRect().top).toBe(top);
		expect(screen.getByRole('button', { name: 'Delete lyrics and details' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete lyrics and details' }));
		expect(dispatch).toHaveBeenCalledOnce();
		expect(dispatch).toHaveBeenCalledWith({ kind: 'clearDocument' }, expect.any(Number), undefined);
	});

	test('cancel abandons the clearing without touching the document', async () => {
		const { controller, editor } = withConversion();
		const dispatch = vi.fn(() => ({ ok: true }) as const);
		editor.dispatchConversionAction = dispatch;
		await render(SongPanel, { controller });

		await fireEvent.click(screen.getByText('Clear this transcription', { exact: true }));
		await fireEvent.click(
			screen.getByRole('button', { name: 'Clear lyrics and retained details…' })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(dispatch).not.toHaveBeenCalled();
		expect(screen.queryByRole('button', { name: 'Delete lyrics and details' })).toBeNull();
	});
});
