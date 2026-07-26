import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EditorHandle } from '$lib/core/types.js';
import type { EditorDisplayContext, LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';

function context(): EditorDisplayContext {
	return {
		language: 'en',
		performers: [],
		ruleSetVersion: 'anchor-test',
		diagnostics: { revision: 0, items: [] }
	};
}

async function mount(options: {
	text: string;
	selection?: { anchor: number; head: number };
	/** What the shell's audio would answer, or undefined for "nothing attached". */
	mediaTime?: () => number | undefined;
}): Promise<{
	handle: EditorHandle;
	seek: ReturnType<typeof vi.fn>;
	syncChanges: { active: boolean; startAt?: number }[];
	announcements: string[];
	anchorsChanged: ReturnType<typeof vi.fn>;
}> {
	let handle: EditorHandle | undefined;
	const seek = vi.fn();
	const anchorsChanged = vi.fn();
	const syncChanges: { active: boolean; startAt?: number }[] = [];
	const announcements: string[] = [];
	const callbacks: LyricEditorCallbacks = {
		onSnapshot: vi.fn(),
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onAnnouncement: (message: string) => void announcements.push(message),
		onRequestMediaTime: options.mediaTime ?? (() => undefined),
		onSeekMedia: seek,
		onLyricSyncChange: (active: boolean, startAt?: number) =>
			void syncChanges.push({ active, startAt }),
		onLineAnchorsChanged: anchorsChanged
	};

	await render(EditorPane, {
		props: {
			initialText: options.text,
			initialSelection: options.selection,
			context: context(),
			callbacks,
			onready: (ready: EditorHandle) => {
				handle = ready;
			}
		}
	});
	await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	if (!handle) throw new Error('CodeMirror did not publish its editor handle.');
	return { handle, seek, syncChanges, announcements, anchorsChanged };
}

/**
 * The timestamp column only draws once the shell has said where the audio is —
 * `setMediaPlayhead(undefined)` is also how "nothing is attached" is stated, so
 * the push is what brings the column into existence.
 */
async function withColumn(handle: EditorHandle, time = 0): Promise<void> {
	handle.setMediaPlayhead?.(time);
	await vi.waitFor(() => {
		if (!document.querySelector('.ll-time-cell')) throw new Error('no timestamp column yet');
	});
}

/**
 * The drawn line numbers. `lineNumbers` keeps a hidden spacer element in the
 * same gutter to reserve its width, so a bare `querySelectorAll` counts one more
 * row than the document has.
 */
function lineNumberElements(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>('.cm-lineNumbers .cm-gutterElement')].filter(
		(element) => element.style.visibility !== 'hidden'
	);
}

function cellFor(lineText: string): HTMLElement {
	const cells = [...document.querySelectorAll<HTMLElement>('.ll-time-cell')];
	const lines = [...document.querySelectorAll<HTMLElement>('.cm-content .cm-line')];
	const index = lines.findIndex((line) => line.textContent === lineText);
	const cell = cells[index];
	if (!cell) throw new Error(`no timestamp cell beside “${lineText}”`);
	return cell;
}

const lyric = ['[Verse 1]', 'first line', 'second line'].join('\n');

describe('line anchoring while transcribing', () => {
	it('anchors the line being typed to the moment it was typed at', async () => {
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: lyric.length, head: lyric.length },
			mediaTime: () => 42
		});

		handle.focus();
		await userEvent.keyboard('!');

		expect(handle.getLineAnchors?.()).toEqual([{ line: 3, time: 42 }]);
	});

	it('anchors nothing while no audio is attached', async () => {
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: lyric.length, head: lyric.length }
		});

		handle.focus();
		await userEvent.keyboard('!');

		expect(handle.getLineAnchors?.()).toEqual([]);
	});

	// The automatic stamp is the feature; it is also the thing most able to ruin
	// the data it collects. Coming back to a finished line half an hour later must
	// leave that line's time exactly where it was.
	it('never drags an existing anchor to wherever the audio now is', async () => {
		let time = 42;
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: lyric.length, head: lyric.length },
			mediaTime: () => time
		});

		handle.focus();
		await userEvent.keyboard('!');
		time = 300;
		await userEvent.keyboard('?');

		expect(handle.getLineAnchors?.()).toEqual([{ line: 3, time: 42 }]);
	});

	/*
	 * The stamp fires on `input.type`, and the precision is the whole point.
	 *
	 * It was `input` once, and `Transaction.isUserEvent` matches by prefix — so
	 * `input.atomic`, which every programmatic edit is annotated with, counted as
	 * typing. Accepting a handful of linter suggestions therefore stamped each line
	 * it repaired, at whatever the playhead happened to be sitting on.
	 */
	it('does not stamp a line an applied fix rewrote', async () => {
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 42
		});

		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: lyric.indexOf('first'), to: lyric.indexOf('first') + 5, insert: 'FIRST' }]
		});

		expect(handle.getSnapshot().text).toContain('FIRST');
		expect(handle.getLineAnchors?.()).toEqual([]);
	});

	// A line anchored to 0:00 by a machine is almost always audio that is attached
	// and has never been moved. It looks like data and it sends the user to the
	// start of the song, which is worse than having no time at all.
	it('does not stamp at zero, where the playhead has never been moved', async () => {
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: lyric.length, head: lyric.length },
			mediaTime: () => 0
		});

		handle.focus();
		await userEvent.keyboard('!');

		expect(handle.getLineAnchors?.()).toEqual([]);
	});

	it('costs no extra undo step for the typing that caused it', async () => {
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: lyric.length, head: lyric.length },
			mediaTime: () => 42
		});

		handle.focus();
		await userEvent.keyboard('!');
		expect(handle.getSnapshot().text).toBe(`${lyric}!`);

		handle.undo();

		expect(handle.getSnapshot().text).toBe(lyric);
	});

	it('corrects a line deliberately with Ctrl+Alt+M', async () => {
		let time = 42;
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: lyric.length, head: lyric.length },
			mediaTime: () => time
		});

		handle.focus();
		await userEvent.keyboard('!');
		time = 300;
		await userEvent.keyboard('{Control>}{Alt>}m{/Alt}{/Control}');

		expect(handle.getLineAnchors?.()).toEqual([{ line: 3, time: 300 }]);
	});

	it('plays from the caret line with Ctrl+Alt+Enter', async () => {
		const { handle, seek } = await mount({ text: lyric, mediaTime: () => 0 });
		handle.setLineAnchors?.([{ line: 3, time: 96 }]);
		handle.setSelection({ anchor: lyric.length, head: lyric.length });

		handle.focus();
		await userEvent.keyboard('{Control>}{Alt>}{Enter}{/Alt}{/Control}');

		expect(seek).toHaveBeenCalledWith(96);
	});

	it('says so rather than seeking when the caret line has no anchor', async () => {
		const { handle, seek } = await mount({ text: lyric, mediaTime: () => 0 });
		handle.setLineAnchors?.([{ line: 3, time: 96 }]);
		handle.setSelection({ anchor: 0, head: 0 });

		handle.focus();
		await userEvent.keyboard('{Control>}{Alt>}{Enter}{/Alt}{/Control}');

		expect(seek).not.toHaveBeenCalled();
	});
});

describe('line anchoring stays out of the way', () => {
	// The rule the whole design hangs on. Clicking a line is how a caret is
	// placed, and it is the single most frequent gesture in the editor — a click
	// that also moved the audio would make the document unusable for the one
	// activity this feature exists to serve.
	it('does not seek when the text of an anchored line is clicked', async () => {
		const { handle, seek } = await mount({ text: lyric, mediaTime: () => 0 });
		handle.setLineAnchors?.([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 }
		]);

		await userEvent.click(page.getByText('second line'));

		expect(seek).not.toHaveBeenCalled();
	});

	it('does not seek when the caret is moved across anchored lines', async () => {
		const { handle, seek } = await mount({
			text: lyric,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 0
		});
		handle.setLineAnchors?.([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 }
		]);

		handle.focus();
		await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}');

		expect(seek).not.toHaveBeenCalled();
	});

	it('seeks only from a press on a timestamp', async () => {
		const { handle, seek } = await mount({ text: lyric, mediaTime: () => 0 });
		handle.setLineAnchors?.([{ line: 2, time: 10 }]);
		await withColumn(handle);

		const time = cellFor('first line').querySelector<HTMLElement>('.ll-time-value');
		expect(time?.textContent).toBe('0:10');
		expect(time?.title).toBe('Play from 0:10');
		time?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

		expect(seek).toHaveBeenCalledWith(10);
	});

	/*
	 * The column is queried through the DOM rather than by role, and that is the
	 * finding rather than a convenience: CodeMirror sets `aria-hidden="true"` on
	 * the whole `.cm-gutters` container, and `aria-hidden` cannot be undone by a
	 * descendant. Nothing in any gutter is reachable by assistive technology.
	 *
	 * So nothing in a cell carries an accessible name to be found by — the whole
	 * column is a pointer affordance, and the equivalent for everyone else is
	 * `Ctrl-Alt-Enter`, `Ctrl-Alt-M`, and sync mode, all tested here. Nothing in it
	 * is focusable either, because a focusable control inside an `aria-hidden`
	 * subtree is a real violation, and because a hundred anchored lines would
	 * otherwise be two hundred tab stops before the first word.
	 */
	it('keeps the column out of the tab sequence and claims no accessible name', async () => {
		const { handle } = await mount({ text: lyric, mediaTime: () => 0 });
		handle.setLineAnchors?.([{ line: 2, time: 10 }]);
		await withColumn(handle);

		const controls = [...cellFor('first line').querySelectorAll<HTMLElement>('button')];
		expect(controls).toHaveLength(2);
		for (const control of controls) {
			expect(control.getAttribute('tabindex')).toBe('-1');
			expect(control.getAttribute('aria-label')).toBeNull();
			expect(control.closest('[aria-hidden="true"]')).not.toBeNull();
		}
	});
});

describe('the timestamp column', () => {
	// The column is how anchoring is discovered at all, so it does not wait for a
	// first anchor the way the transport waits for a first file — and an untimed
	// line draws a dash rather than nothing. A column of blank cells is an
	// invisible column: there is no mark on screen to say the rail exists or that a
	// line can be timed, so the feature reads as absent until the pointer happens
	// to cross the one cell that answers.
	it('draws a cell for every line as soon as there is audio, and a dash where no time is set', async () => {
		const { handle } = await mount({ text: lyric, mediaTime: () => 0 });
		expect(document.querySelector('.ll-time-cell')).toBeNull();

		await withColumn(handle);

		expect(document.querySelectorAll('.ll-time-cell')).toHaveLength(3);
		const empty = cellFor('first line').querySelector<HTMLButtonElement>('.ll-time-value');
		expect(empty?.textContent).toBe('–');
		expect(empty?.disabled).toBe(true);
		expect(cellFor('first line').querySelector('.ll-time-stamp')).not.toBeNull();
	});

	/*
	 * The line number is the second way to play a line, and a wider target than
	 * four characters of muted time. It is safe for the same reason the timestamp
	 * is: a gutter sits outside `.cm-content`, so a press there never places a
	 * caret, and CodeMirror binds nothing to the line-number gutter itself.
	 */
	it('plays from a line when its number is pressed', async () => {
		const { handle, seek } = await mount({ text: lyric, mediaTime: () => 0 });
		handle.setLineAnchors?.([{ line: 2, time: 10 }]);
		await withColumn(handle);

		const anchored = lineNumberElements().find((element) =>
			element.classList.contains('ll-line-seek')
		);
		// The marker classes the element and must not draw: `lineNumbers` drops its
		// own number for any line whose markers include one with a `toDOM`.
		expect(anchored?.textContent).toBe('2');
		expect(getComputedStyle(anchored!).cursor).toBe('pointer');

		anchored?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(seek).toHaveBeenCalledWith(10);
	});

	// An affordance that works on some rows and silently not on others is worse
	// than none, so an untimed line number is left exactly as it was and its press
	// goes unclaimed.
	it('leaves an untimed line number alone', async () => {
		const { handle, seek } = await mount({ text: lyric, mediaTime: () => 0 });
		handle.setLineAnchors?.([{ line: 2, time: 10 }]);
		await withColumn(handle);

		const untimed = lineNumberElements().filter(
			(element) => !element.classList.contains('ll-line-seek')
		);
		expect(untimed).toHaveLength(2);
		expect(getComputedStyle(untimed[0]!).cursor).not.toBe('pointer');

		const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
		untimed[0]?.dispatchEvent(press);

		expect(seek).not.toHaveBeenCalled();
		expect(press.defaultPrevented).toBe(false);
	});

	// Hover alone put the control only where the pointer already was, which is
	// nowhere until you know to look. The caret's own line offers it at rest, so
	// the way to find it is to click into a line — which is what a user does first.
	it('offers the stamp control at rest on the caret’s own line', async () => {
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: lyric.length, head: lyric.length },
			mediaTime: () => 0
		});
		await withColumn(handle);

		const shown = (lineText: string) =>
			getComputedStyle(cellFor(lineText).querySelector('.ll-time-stamp')!).visibility;
		expect(shown('second line')).toBe('visible');
		expect(shown('first line')).toBe('hidden');
	});

	// With no song there is nothing to show a time for and nothing to anchor to,
	// so the column goes rather than standing there as an empty rail — which is
	// also what keeps it out of the landing page's demo editor.
	it('goes entirely when the audio is detached', async () => {
		const { handle } = await mount({ text: lyric, mediaTime: () => 0 });
		await withColumn(handle);

		handle.setMediaPlayhead?.(undefined);

		await vi.waitFor(() => {
			if (document.querySelector('.ll-time-cell')) throw new Error('the column is still drawn');
		});
	});

	it('anchors the line from a press on its own cell, overwriting what was there', async () => {
		const { handle } = await mount({ text: lyric, mediaTime: () => 75 });
		handle.setLineAnchors?.([{ line: 2, time: 10 }]);
		await withColumn(handle);

		cellFor('first line')
			.querySelector<HTMLElement>('.ll-time-stamp')
			?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

		expect(handle.getLineAnchors?.()).toEqual([{ line: 2, time: 75 }]);
	});

	// Where the audio is, read off the same rail as the times themselves. It is
	// the last anchor at or before the playhead, so it does not jump to the next
	// line halfway through the current one.
	it('marks the anchor the playhead is inside and no other', async () => {
		const { handle } = await mount({ text: lyric, mediaTime: () => 0 });
		handle.setLineAnchors?.([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 }
		]);
		await withColumn(handle, 15);

		const current = () =>
			[...document.querySelectorAll<HTMLElement>('.ll-time-value--current')].map(
				(value) => value.textContent
			);
		expect(current()).toEqual(['0:10']);

		handle.setMediaPlayhead?.(21);
		await vi.waitFor(() => expect(current()).toEqual(['0:20']));
	});

	// The playhead arrives several times a second for the length of a song. It
	// marks one cell. It does not move the caret, and it does not put a step in the
	// history for something the user never did.
	it('moves nothing when the playhead is pushed in', async () => {
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: 4, head: 4 },
			mediaTime: () => 0
		});
		handle.setLineAnchors?.([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 }
		]);

		for (const time of [5, 11, 15, 21, 25]) {
			handle.setMediaPlayhead?.(time);
		}

		expect(handle.getSnapshot().selection).toEqual({ anchor: 4, head: 4 });
		expect(handle.getSnapshot().text).toBe(lyric);

		handle.undo();
		expect(handle.getSnapshot().text).toBe(lyric);
		expect(handle.getLineAnchors?.()).toEqual([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 }
		]);
	});
});

/*
 * Timing a whole lyric by tapping along with the song.
 *
 * The document under test has both kinds of line the run has to walk past: a
 * blank one, and a section header, which sits in the gap before its verse — so a
 * tap that landed on it would be spent at the exact moment the verse's first
 * line starts.
 */
const song = ['[Verse 1]', 'first line', '', '[Chorus]', 'second line'].join('\n');

describe('sync mode', () => {
	// A run is one pass over the whole lyric against one pass of the audio, and the
	// shell rewinds the song to 0:00 at this same moment — so the caret goes to the
	// top whatever it was doing, or the first press would time the last line the
	// user happened to click against the opening bar.
	it('starts at the top of the document, wherever the caret was', async () => {
		const { handle, syncChanges } = await mount({
			text: song,
			selection: { anchor: song.length, head: song.length },
			mediaTime: () => 30
		});

		handle.setLyricSync?.(true);

		expect(syncChanges).toEqual([{ active: true, startAt: 0 }]);
		// Line 2, not line 1 — the top of a lyric is usually a section header, and a
		// tap spent on one is a tap thrown away.
		expect(handle.getSnapshot().selection.head).toBe(song.indexOf('first line'));
	});

	// A tap is a claim about the line starting *now*, so the caret stays on the
	// line it just timed rather than jumping ahead of the music. That row is what
	// the user is reading while it plays, and it is the whole of the feedback for
	// the press — read on the next line it is feedback about the wrong thing.
	it('times the caret’s own line and stays on it', async () => {
		const { handle } = await mount({
			text: song,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 30
		});
		handle.setLyricSync?.(true);
		handle.focus();

		await userEvent.keyboard(' ');

		const [anchor] = handle.getLineAnchors?.() ?? [];
		expect(anchor?.line).toBe(2);
		// Biased early by the tap offset, because every human tap lands late and
		// starting a moment before the line is the forgiving direction.
		expect(anchor?.time).toBeCloseTo(29.88, 5);
		expect(handle.getSnapshot().selection.head).toBe(song.indexOf('first line'));
	});

	// The advance is deferred to the front of the next tap, which is the moment it
	// stops being wrong — and it walks past the blank line and `[Chorus]` in one
	// step, so no tap is spent on structure nobody sings.
	it('advances at the start of the following tap, past the structure between verses', async () => {
		const { handle } = await mount({
			text: song,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 30
		});
		handle.setLyricSync?.(true);
		handle.focus();

		await userEvent.keyboard('  ');

		expect((handle.getLineAnchors?.() ?? []).map(({ line }) => line)).toEqual([2, 5]);
		expect(handle.getSnapshot().selection.head).toBe(song.indexOf('second line'));
	});

	it('takes the document out of service so the tap key is free', async () => {
		const { handle } = await mount({ text: song, mediaTime: () => 30 });
		handle.setLyricSync?.(true);
		handle.focus();

		await userEvent.keyboard(' x');

		expect(handle.getSnapshot().text).toBe(song);
	});

	// Without a way back, one fumbled tap means restarting the run: every later
	// press lands on the wrong line. Backspace undoes the last tap — it clears the
	// line it leaves rather than merely stepping off it, so that line is genuinely
	// un-timed and the next tap writes it fresh.
	it('undoes the last tap on Backspace', async () => {
		// A third lyric line, so the run is still going after two taps: timing the
		// last line ends it, and Backspace after that is an ordinary edit.
		const longer = [...song.split('\n'), 'third line'].join('\n');
		const { handle } = await mount({
			text: longer,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 30
		});
		handle.setLyricSync?.(true);
		handle.focus();

		await userEvent.keyboard('  ');
		expect((handle.getLineAnchors?.() ?? []).map(({ line }) => line)).toEqual([2, 5]);

		await userEvent.keyboard('{Backspace}');

		// The second line is un-timed and the caret is back on the first, which is
		// still timed — so the next tap advances and writes the second one again.
		expect((handle.getLineAnchors?.() ?? []).map(({ line }) => line)).toEqual([2]);
		expect(handle.getSnapshot().selection.head).toBe(longer.indexOf('first line'));

		await userEvent.keyboard(' ');
		expect((handle.getLineAnchors?.() ?? []).map(({ line }) => line)).toEqual([2, 5]);
		expect(handle.getSnapshot().text).toBe(longer);
	});

	/*
	 * The save path, and the reason it needs one of its own: a run changes no text
	 * at all, so the shell's snapshot — which is what schedules a write — never
	 * fires. Without this hook a whole synced song was lost on reload, and the only
	 * anchors that survived were the ones the automatic stamp happened to write
	 * alongside a keystroke.
	 */
	it('tells the shell to write the anchors down, since no text changed', async () => {
		const { handle, anchorsChanged } = await mount({
			text: song,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 30
		});
		handle.setLyricSync?.(true);
		handle.focus();
		anchorsChanged.mockClear();

		await userEvent.keyboard(' ');
		expect(anchorsChanged).toHaveBeenCalled();
		expect(handle.getSnapshot().text).toBe(song);
	});

	// A restore is the draft being read back, not a change worth writing. Left in,
	// opening a draft would schedule a save of what had just been loaded.
	it('says nothing when the anchors are being restored', async () => {
		const { handle, anchorsChanged } = await mount({ text: song, mediaTime: () => 30 });
		anchorsChanged.mockClear();

		handle.setLineAnchors?.([{ line: 2, time: 10 }]);

		expect(anchorsChanged).not.toHaveBeenCalled();
	});

	it('has nothing to undo before the first tap', async () => {
		const { handle } = await mount({
			text: song,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 30
		});
		handle.setLyricSync?.(true);
		handle.focus();

		await userEvent.keyboard('{Backspace}');

		expect(handle.getLineAnchors?.()).toEqual([]);
		expect(handle.getSnapshot().text).toBe(song);
		expect(handle.getSnapshot().selection.head).toBe(song.indexOf('first line'));
	});

	it('ends itself on the last line, and says so', async () => {
		const { handle, syncChanges, announcements } = await mount({
			text: song,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 30
		});
		handle.setLyricSync?.(true);
		handle.focus();

		await userEvent.keyboard('  ');

		expect(handle.getLineAnchors?.()).toHaveLength(2);
		expect(syncChanges.map(({ active }) => active)).toEqual([true, false]);
		expect(announcements.at(-1)).toContain('Sync finished');
		// The document takes typing again the moment the run is over.
		handle.setSelection({ anchor: song.length, head: song.length });
		await userEvent.keyboard('!');
		expect(handle.getSnapshot().text).toBe(`${song}!`);
	});

	/*
	 * The document follows the run, and this is the only place in the workbench
	 * where it follows anything — but it does not start until the line being timed
	 * has descended to the reading line a third of the way down. A run begins at
	 * the top of the lyric, where the first lines are naturally above that point,
	 * and scrolling on the first tap would throw the page down to reposition a line
	 * the user could already see perfectly well.
	 */
	it('holds the line being timed a third down, and not before it gets there', async () => {
		const long = ['[Verse 1]', ...Array.from({ length: 60 }, (_, i) => `line ${i + 1}`)].join('\n');
		const { handle } = await mount({
			text: long,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 30
		});

		// A real viewport to measure against: the pane is `height: 100%` of a
		// container the test harness gives no height of its own.
		const pane = document.querySelector<HTMLElement>('.editor-pane')!;
		pane.style.height = '300px';
		const scroller = document.querySelector<HTMLElement>('.cm-scroller')!;
		await vi.waitFor(() => {
			if (scroller.clientHeight < 200) throw new Error('the pane has no height yet');
		});

		handle.setLyricSync?.(true);
		handle.focus();

		// The first lines sit above the reading line, so the document stays put.
		await userEvent.keyboard('   ');
		expect(scroller.scrollTop).toBe(0);

		// Far enough down and it starts moving, holding the caret's line at the
		// third rather than nudging it to whichever edge it left.
		await userEvent.keyboard('            ');
		expect(scroller.scrollTop).toBeGreaterThan(0);

		// CodeMirror renders only the visible lines, so the caret's row is found by
		// its text rather than by index into `.cm-line`.
		// The caret sits at the line's start, so slicing up to it yields the previous
		// line — take the whole line the head is inside instead.
		const snapshot = handle.getSnapshot();
		const head = snapshot.selection.head;
		const from = snapshot.text.lastIndexOf('\n', head - 1) + 1;
		const to = snapshot.text.indexOf('\n', head);
		const caretText = snapshot.text.slice(from, to === -1 ? undefined : to);
		const row = [...document.querySelectorAll<HTMLElement>('.cm-content .cm-line')].find(
			(element) => element.textContent === caretText
		);
		expect(row).toBeDefined();

		const viewport = scroller.getBoundingClientRect();
		const offset = row!.getBoundingClientRect().top - viewport.top;
		expect(Math.abs(offset - viewport.height / 3)).toBeLessThan(row!.offsetHeight);

		// The load-bearing half of "not before it gets there", and the only one the
		// browser does not give for free: near the top of the document a premature
		// scroll is clamped away at zero, so the guard is only observable once the
		// document is already scrolled. Stepping back puts the caret just *above* the
		// reading line, and a version without the guard hauls the document up to
		// re-centre a row that is already in plain view.
		const settled = scroller.scrollTop;
		await userEvent.keyboard('{Backspace}');
		expect(scroller.scrollTop).toBe(settled);
	});

	/*
	 * A half-timed song picks up where it was left, and it picks up on the last
	 * line that *has* a time rather than the first that does not — armed, so the
	 * first tap advances onto the untimed line exactly as any other tap would.
	 *
	 * Landing directly on the untimed line would mean tapping its opening syllable
	 * from a standing start; a whole line of run-up is what makes the rhythm
	 * findable again.
	 */
	it('resumes a half-timed song on the last line that has a time', async () => {
		const { handle, syncChanges, announcements } = await mount({
			text: song,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 90
		});
		// Line 2 timed, line 5 not.
		handle.setLineAnchors?.([{ line: 2, time: 31 }]);

		handle.setLyricSync?.(true);

		expect(handle.getSnapshot().selection.head).toBe(song.indexOf('first line'));
		// The tape is told to start on that same line, not at 0:00.
		expect(syncChanges).toEqual([{ active: true, startAt: 31 }]);
		expect(announcements.at(-1)).toBe('Sync resumed at 0:31.');

		// Armed, so the first tap advances rather than re-timing the resumed line.
		handle.focus();
		await userEvent.keyboard(' ');
		expect(handle.getLineAnchors?.()).toEqual([
			{ line: 2, time: 31 },
			{ line: 5, time: 89.88 }
		]);
	});

	it('starts from the top when nothing is timed yet', async () => {
		const { handle, syncChanges, announcements } = await mount({
			text: song,
			selection: { anchor: song.length, head: song.length },
			mediaTime: () => 90
		});

		handle.setLyricSync?.(true);

		expect(syncChanges).toEqual([{ active: true, startAt: 0 }]);
		expect(announcements.at(-1)).toBe('Sync started from the top.');
		expect(handle.getSnapshot().selection.head).toBe(song.indexOf('first line'));
	});

	// Pressing sync on finished work has nothing to resume, so it is a fresh pass.
	it('starts over when the song is timed all the way through', async () => {
		const { handle, syncChanges } = await mount({
			text: song,
			selection: { anchor: song.length, head: song.length },
			mediaTime: () => 90
		});
		handle.setLineAnchors?.([
			{ line: 2, time: 31 },
			{ line: 5, time: 62 }
		]);

		handle.setLyricSync?.(true);

		expect(syncChanges).toEqual([{ active: true, startAt: 0 }]);
		expect(handle.getSnapshot().selection.head).toBe(song.indexOf('first line'));
	});

	it('leaves on Escape', async () => {
		const { handle, syncChanges } = await mount({ text: song, mediaTime: () => 30 });
		handle.setLyricSync?.(true);
		handle.focus();

		await userEvent.keyboard('{Escape}');

		expect(syncChanges.map(({ active }) => active)).toEqual([true, false]);
	});

	// Space, Enter, Backspace and Up all belong to somebody else the rest of the
	// time, and a mode that kept them afterwards would be a document that had
	// quietly stopped working.
	it('gives the keys back when it is not running', async () => {
		const { handle } = await mount({
			text: song,
			selection: { anchor: song.length, head: song.length },
			mediaTime: () => 30
		});

		handle.focus();
		await userEvent.keyboard(' still typing');

		expect(handle.getSnapshot().text).toBe(`${song} still typing`);
		expect(handle.getLineAnchors?.()).toEqual([{ line: 5, time: 30 }]);
	});
});
