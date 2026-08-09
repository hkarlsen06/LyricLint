import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { isLyricLine, parseDocument } from '$lib/core/parser.js';
import type { EditorHandle, PerformerRecord } from '$lib/core/types.js';
import { assignVoiceGroup } from '$lib/performers/transform.js';
import type { EditorDisplayContext, LyricEditorCallbacks } from './contracts.js';
import { tapOffsetSeconds } from './extensions/lyric-sync.js';
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
	/** The transport's playback rate, 1 unless a test says otherwise. */
	mediaRate?: () => number;
	/** Whether the tape is running, true unless a test pauses it. */
	mediaPlaying?: () => boolean;
	/** Mirror the shell: focus the editor when a run starts, as `Workspace` does. */
	focusEditorOnSync?: boolean;
}): Promise<{
	handle: EditorHandle;
	seek: ReturnType<typeof vi.fn>;
	syncChanges: { active: boolean; startAt?: number; scoped?: boolean }[];
	announcements: string[];
	/** What the shell would have drawn as a toast. */
	notices: string[];
	anchorsChanged: ReturnType<typeof vi.fn>;
}> {
	let handle: EditorHandle | undefined;
	const seek = vi.fn();
	const anchorsChanged = vi.fn();
	const syncChanges: { active: boolean; startAt?: number; scoped?: boolean }[] = [];
	const announcements: string[] = [];
	const notices: string[] = [];
	const callbacks: LyricEditorCallbacks = {
		onSnapshot: vi.fn(),
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onAnnouncement: (message: string) => void announcements.push(message),
		onRequestMediaTime: options.mediaTime ?? (() => undefined),
		// The tap's own hook, derived from the same time so the two cannot
		// disagree about whether audio is attached.
		onRequestMediaPlayback: () => {
			const time = options.mediaTime?.();
			if (time === undefined) return undefined;
			return {
				time,
				rate: options.mediaRate?.() ?? 1,
				playing: options.mediaPlaying?.() ?? true
			};
		},
		onSeekMedia: seek,
		onLyricSyncChange: (active: boolean, startAt?: number, scoped?: boolean) => {
			syncChanges.push({ active, startAt, scoped });
			// Deferred a frame exactly as the shell defers it, so this drives the
			// call with the timing it really has.
			if (active && options.focusEditorOnSync) {
				requestAnimationFrame(() => handle?.focus());
			}
		},
		onLyricSyncNotice: (message: string) => void notices.push(message),
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
	return { handle, seek, syncChanges, announcements, notices, anchorsChanged };
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

/**
 * The cell beside a line, counted among the lines that *have* one. Structure —
 * blanks and section headers — is drawn no cell at all, so the cells and the
 * document's lines are not the same list and cannot share an index.
 */
function cellFor(lineText: string): HTMLElement {
	const cells = [...document.querySelectorAll<HTMLElement>('.ll-time-cell')];
	const timeable = [...document.querySelectorAll<HTMLElement>('.cm-content .cm-line')]
		.map((line) => line.textContent ?? '')
		.filter((text) => isLyricLine(text));
	const cell = cells[timeable.indexOf(lineText)];
	if (!cell) throw new Error(`no timestamp cell beside “${lineText}”`);
	return cell;
}

const lyric = ['[Verse 1]', 'first line', 'second line'].join('\n');

/** A two-name roster for the performer-assignment regression below. */
const anchorRoster: PerformerRecord[] = ['A', 'B'].map((displayName, order) => ({
	id: `performer-${order + 1}`,
	displayName,
	normalizedKey: displayName.toLowerCase(),
	aliases: [],
	colorId: `performer-${order + 1}` as PerformerRecord['colorId'],
	order
}));

/** A press on one of a cell's controls, which the gutter reads on `mousedown`. */
function press(cell: HTMLElement, selector: string): void {
	const control = cell.querySelector<HTMLElement>(selector);
	if (!control) throw new Error(`no “${selector}” in this cell`);
	control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

describe('line anchoring while transcribing', () => {
	/*
	 * Typing used to stamp the line being typed with wherever the playhead was.
	 * It was the feature and it was also the thing most able to ruin the data it
	 * collected: what it recorded was the moment you *started typing* a line, which
	 * is after you heard it and after however long you spent working out the words —
	 * a lag with no fixed size and nothing on screen disclosing it. Typing a verse
	 * at one pause put every line of it on one second, and typing along with the
	 * tape put every line late by a different amount.
	 *
	 * Sync mode is the accurate answer to the same job, so this one went. Every
	 * anchor is deliberate now, and typing writes none.
	 */
	it('anchors nothing for typing, whatever the audio is doing', async () => {
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: lyric.length, head: lyric.length },
			mediaTime: () => 42
		});

		handle.focus();
		await userEvent.keyboard('!');

		expect(handle.getSnapshot().text).toBe(`${lyric}!`);
		expect(handle.getLineAnchors?.()).toEqual([]);
	});

	it('leaves an existing anchor alone through an edit to its line', async () => {
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: lyric.length, head: lyric.length },
			mediaTime: () => 300
		});
		handle.setLineAnchors?.([{ line: 3, time: 42 }]);

		handle.focus();
		await userEvent.keyboard('!');

		expect(handle.getLineAnchors?.()).toEqual([{ line: 3, time: 42 }]);
	});

	it('anchors the caret line deliberately with Ctrl+Alt+M', async () => {
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: lyric.length, head: lyric.length },
			mediaTime: () => 300
		});

		handle.focus();
		await userEvent.keyboard('{Control>}{Alt>}m{/Alt}{/Control}');

		expect(handle.getLineAnchors?.()).toEqual([{ line: 3, time: 300 }]);
	});

	it('corrects a line already anchored with Ctrl+Alt+M', async () => {
		const { handle } = await mount({
			text: lyric,
			selection: { anchor: lyric.length, head: lyric.length },
			mediaTime: () => 300
		});
		handle.setLineAnchors?.([{ line: 3, time: 42 }]);

		handle.focus();
		await userEvent.keyboard('{Control>}{Alt>}m{/Alt}{/Control}');

		expect(handle.getLineAnchors?.()).toEqual([{ line: 3, time: 300 }]);
	});

	/*
	 * Wrapping a lyric in performer tags replaces `Gamma` with `<i>Gamma</i>` —
	 * no shared first or last character, so even the narrowed edit covers the
	 * line's whole span, and a wrapper closed several lines down covers every
	 * line between as one change. Both read as the line being erased, so
	 * assigning performers to a selection silently cleared its timestamps. The
	 * change adds no line break, so the lines survived, and their times must.
	 */
	it('keeps the timestamps of lines a performer assignment wraps', async () => {
		const song = ['[Verse 1]', 'first line', 'second line', 'third line'].join('\n');
		const { handle } = await mount({ text: song });
		handle.setLineAnchors?.([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 },
			{ line: 4, time: 30 }
		]);

		const snapshot = handle.getSnapshot();
		const from = song.indexOf('first line');
		const result = assignVoiceGroup({
			revision: snapshot.revision,
			text: snapshot.text,
			document: parseDocument(snapshot.text),
			selection: { anchor: from, head: from + 'first line'.length },
			performerIds: [anchorRoster[0]!.id],
			sectionPerformerIds: [anchorRoster[1]!.id],
			roster: anchorRoster
		});
		expect(result.status).toBe('applied');
		if (result.status !== 'applied') throw new Error(result.reason);
		handle.dispatchAtomic(result.edit);

		expect(handle.getSnapshot().text).toBe(
			['[Verse 1: A & <i>B</i>]', 'first line', '<i>second line', 'third line</i>'].join('\n')
		);
		expect(handle.getLineAnchors?.()).toEqual([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 },
			{ line: 4, time: 30 }
		]);
	});

	it('still drops the timestamp of a line that is deleted', async () => {
		const { handle } = await mount({ text: lyric });
		handle.setLineAnchors?.([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 }
		]);

		const from = lyric.indexOf('first line');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to: lyric.indexOf('second line'), insert: '' }]
		});

		expect(handle.getLineAnchors?.()).toEqual([{ line: 2, time: 20 }]);
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
	it('draws a cell for every timeable line as soon as there is audio, and a dash where no time is set', async () => {
		const { handle } = await mount({ text: lyric, mediaTime: () => 0 });
		expect(document.querySelector('.ll-time-cell')).toBeNull();

		await withColumn(handle);

		expect(document.querySelectorAll('.ll-time-cell')).toHaveLength(2);
		const empty = cellFor('first line').querySelector<HTMLButtonElement>('.ll-time-value');
		expect(empty?.textContent).toBe('–');
		expect(empty?.disabled).toBe(true);
		expect(cellFor('first line').querySelector('.ll-time-stamp')).not.toBeNull();
	});

	// The dash means "a value goes here and is not set yet", which is false on a
	// blank line and on a section header — and saying it there cost a real bug: an
	// untimed lyric line wore the same mark as the structure around it, so a song
	// with one line missing read as finished. Nothing is drawn beside a line no run
	// will ever visit, stamp control included, because there is nothing to time.
	it('draws nothing beside a line that cannot be timed', async () => {
		const text = ['[Verse 1]', 'first line', '', 'second line'].join('\n');
		const { handle } = await mount({ text, mediaTime: () => 0 });
		await withColumn(handle);

		expect(
			[...document.querySelectorAll<HTMLElement>('.ll-time-cell')].map((cell) => cell.textContent)
		).toEqual(['–', '–']);

		// A skipped line leaves no element behind, so the rows that remain keep their
		// place by the margin the gutter gives them. Worth asserting rather than
		// assuming: a column that drew the right cells against the wrong lines would
		// be a worse bug than the dash it replaces.
		const offset = (lineText: string) => {
			const line = [...document.querySelectorAll<HTMLElement>('.cm-content .cm-line')].find(
				(candidate) => candidate.textContent === lineText
			)!;
			return cellFor(lineText).getBoundingClientRect().top - line.getBoundingClientRect().top;
		};
		// Measured against its own neighbour rather than against zero: the cell sits
		// inside a padded row, so what matters is that the row after a skipped line
		// is off by exactly as much as the row before it.
		expect(offset('second line')).toBeCloseTo(offset('first line'), 1);

		// A deliberate anchor is still shown wherever it was put: `Ctrl-Alt-M` may
		// time any line, and a cell that vanished would lose the timing with it.
		handle.setLineAnchors?.([{ line: 1, time: 10 }]);
		await vi.waitFor(() => expect(document.querySelectorAll('.ll-time-cell')).toHaveLength(3));
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

	// A gutter element is as tall as the block it stands beside, so a line long
	// enough to wrap makes this cell two or three lines deep. Centred in that box
	// the time sat in the middle of the block while the line number stayed at the
	// top, and the two facts about one line were drawn on different rows.
	it('keeps a wrapped line’s time level with its line number', async () => {
		const long = `long ${'la '.repeat(120)}line`;
		const text = ['[Verse 1]', 'first line', long].join('\n');
		const { handle } = await mount({ text, mediaTime: () => 0 });
		handle.setLineAnchors?.([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 }
		]);
		await withColumn(handle);

		// Where each column's glyphs start: the box's own top plus whatever it pads
		// by. Both are set in the gutter's own type at the same line height, so a
		// difference here is the time having drifted down the row.
		const numberTop = (element: Element) =>
			element.getBoundingClientRect().top + parseFloat(getComputedStyle(element).paddingTop);
		const timeTop = (lineText: string) =>
			cellFor(lineText).querySelector('.ll-time-value')!.getBoundingClientRect().top;
		const numbers = lineNumberElements();
		const rowHeight = numbers[1].getBoundingClientRect().height;

		// The wrapped assertion is worth nothing unless the row really did wrap.
		expect(numbers[2].getBoundingClientRect().height).toBeGreaterThan(rowHeight * 1.5);

		expect(timeTop('first line')).toBeCloseTo(numberTop(numbers[1]), 0);
		expect(timeTop(long)).toBeCloseTo(numberTop(numbers[2]), 0);
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

	it('anchors an untimed line to the playhead from a press on its own cell', async () => {
		const { handle } = await mount({ text: lyric, mediaTime: () => 75 });
		await withColumn(handle);

		press(cellFor('first line'), '.ll-time-stamp');

		expect(handle.getLineAnchors?.()).toEqual([{ line: 2, time: 75 }]);
	});

	// A line that already carries a time is nearly always a line whose time is
	// nearly right — a tap landed late, or a run was a beat behind — so writing the
	// playhead over it is almost never the correction wanted. The pencil offers the
	// correction that is: a second either way, which is what `m:ss` can show.
	it('offers a nudge either side of the time instead of re-stamping it', async () => {
		const { handle } = await mount({ text: lyric, mediaTime: () => 75 });
		handle.setLineAnchors?.([{ line: 2, time: 10 }]);
		await withColumn(handle);

		const restingLeft = cellFor('first line')
			.querySelector('.ll-time-value')!
			.getBoundingClientRect().left;

		press(cellFor('first line'), '.ll-time-stamp');

		await vi.waitFor(() => {
			const nudges = [...cellFor('first line').querySelectorAll('.ll-time-nudge')];
			expect(nudges.map((button) => button.textContent)).toEqual(['−', '+']);
		});
		// One at each end of the number: `−` off its start, `+` against its last
		// digit. The time itself does not move, because a number sliding sideways
		// when a control opens beside it is the reflow this cell is arranged to
		// avoid — which is what keeps `−` out of flow.
		const box = (selector: string) =>
			cellFor('first line').querySelector(selector)!.getBoundingClientRect();
		expect([...cellFor('first line').querySelectorAll('button')].map((b) => b.textContent)).toEqual(
			['−', '0:10.00', '+']
		);
		expect(box('.ll-time-value').left).toBe(restingLeft);
		expect(box('.ll-time-nudge--back').right).toBeLessThanOrEqual(box('.ll-time-value').left);
		expect(box('.ll-time-nudge--on').left).toBeGreaterThanOrEqual(box('.ll-time-value').right);
		// CodeMirror clips every gutter column, which cut the chip hanging off the
		// start of the number down to a sliver — a control that is there, is
		// pressable, and cannot be seen.
		expect(getComputedStyle(document.querySelector('.ll-time-gutter')!).overflow).toBe('visible');
		expect(handle.getLineAnchors?.()).toEqual([{ line: 2, time: 10 }]);

		press(cellFor('first line'), '[data-anchor-nudge="1"]');
		expect(handle.getLineAnchors?.()).toEqual([{ line: 2, time: 10.25 }]);

		press(cellFor('first line'), '[data-anchor-nudge="-1"]');
		press(cellFor('first line'), '[data-anchor-nudge="-1"]');
		expect(handle.getLineAnchors?.()).toEqual([{ line: 2, time: 9.75 }]);

		// A quarter second is only worth stepping if the cell can answer it, so the
		// open one shows hundredths — `m:ss` alone said nothing for three presses in
		// every four. Every other row is left in whole seconds.
		await vi.waitFor(() =>
			expect(cellFor('first line').querySelector('.ll-time-value')?.textContent).toBe('0:09.75')
		);
		expect(cellFor('second line').querySelector('.ll-time-value')?.textContent).toBe('–');
	});

	/*
	 * This column is the last thing before the scroller's own edge, so whatever
	 * sits at the end of a cell — `+` while the pair is open, the stamp glyph the
	 * rest of the time — is what a vertical scrollbar lands on. An overlay bar
	 * takes no layout space at all and paints over the last dozen or so pixels of
	 * the scrollport, where it also wins the press, so at the eight pixels this
	 * used to reserve, aiming at `+` scrubbed the document instead of moving the
	 * time.
	 *
	 * Measured rather than trusted, and against the scrollport rather than against
	 * the padding it comes from: a cell's own contents can grow into that lane
	 * without the stylesheet changing, which is how the number slid sideways once
	 * already, and the lane going quietly back to a gap looks exactly like working
	 * CSS.
	 */
	it('keeps a scrollbar lane between the cell’s last control and the scrollport', async () => {
		// The widest an overlay scrollbar draws itself, expanded, on the platforms
		// that have them. A classic bar takes its width out of the scrollport
		// instead, so the column simply stops beside it and this is the gap.
		const overlayScrollbarWidth = 16;
		const { handle } = await mount({ text: lyric, mediaTime: () => 75 });
		handle.setLineAnchors?.([{ line: 2, time: 10 }]);
		await withColumn(handle);

		const scrollport = () => document.querySelector('.cm-scroller')!.getBoundingClientRect().right;
		const clearance = (selector: string) =>
			scrollport() - cellFor('first line').querySelector(selector)!.getBoundingClientRect().right;

		expect(clearance('.ll-time-stamp')).toBeGreaterThanOrEqual(overlayScrollbarWidth);

		press(cellFor('first line'), '.ll-time-stamp');
		await vi.waitFor(() => {
			if (!document.querySelector('.ll-time-nudge--on')) throw new Error('the pair never opened');
		});

		expect(clearance('.ll-time-nudge--on')).toBeGreaterThanOrEqual(overlayScrollbarWidth);
	});

	// The precision arrives with the controls that spend it and leaves with them: a
	// column of `m:ss.cc` is two digits per row nobody is reading, and the resting
	// job of this rail is to say where a line sits in the song.
	it('goes back to whole seconds once the pair is closed', async () => {
		const { handle } = await mount({ text: lyric, mediaTime: () => 75 });
		handle.setLineAnchors?.([{ line: 2, time: 9.75 }]);
		await withColumn(handle);

		const value = () => cellFor('first line').querySelector('.ll-time-value')?.textContent;
		expect(value()).toBe('0:09');

		press(cellFor('first line'), '.ll-time-stamp');
		await vi.waitFor(() => expect(value()).toBe('0:09.75'));

		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await vi.waitFor(() => expect(value()).toBe('0:09'));
	});

	// Every transient surface in the workbench closes on a press anywhere else, and
	// this one is no different — the press that opened it is the only thing keeping
	// it up.
	it('dismisses the nudge pair on a press outside it', async () => {
		const { handle } = await mount({ text: lyric, mediaTime: () => 75 });
		handle.setLineAnchors?.([{ line: 2, time: 10 }]);
		await withColumn(handle);

		press(cellFor('first line'), '.ll-time-stamp');
		await vi.waitFor(() => {
			if (!document.querySelector('.ll-time-nudge')) throw new Error('the pair never opened');
		});

		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

		await vi.waitFor(() => {
			if (document.querySelector('.ll-time-nudge')) throw new Error('the pair is still open');
		});
		expect(cellFor('first line').querySelector('.ll-time-stamp')).not.toBeNull();
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

	// The mark is a band across the whole row, not four characters at the far edge
	// of the document: the line's text, its number, and its timestamp cell.
	it('washes the whole playing line, gutters included', async () => {
		const { handle } = await mount({ text: lyric, mediaTime: () => 0 });
		handle.setLineAnchors?.([{ line: 2, time: 10 }]);
		await withColumn(handle, 15);

		await vi.waitFor(() => {
			expect(document.querySelector('.cm-line.ll-current-line')?.textContent).toBe('first line');
			// One per gutter: the line number, the performer bar, the timestamp cell.
			expect(document.querySelectorAll('.cm-gutterElement.ll-current-line-gutter')).toHaveLength(3);
		});
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

describe('line anchors in linked sections', () => {
	// The mirror used to dispatch a peer's whole shared run as one replacement,
	// and `dropErasedAnchors` reads a line wholly inside a replacement as erased
	// — so typing one character in a linked chorus silently deleted every line
	// timing its peers carried. The mirrored edit is narrowed now, so an anchor
	// on a line the edit did not actually change maps through like any other.
	it('keeps the peer sections’ timings when an edit is mirrored into them', async () => {
		const doc = [
			'[Chorus]',
			'Hold on tight',
			'Never let go',
			'',
			'[Chorus 2]',
			'Hold on tight',
			'Never let go'
		].join('\n');
		const { handle } = await mount({ text: doc, mediaTime: () => 0 });
		handle.linkSections?.({ headers: [doc.indexOf('[Chorus]'), doc.indexOf('[Chorus 2]')] });
		handle.setLineAnchors?.([
			{ line: 2, time: 1 },
			{ line: 3, time: 3 },
			{ line: 6, time: 20 },
			{ line: 7, time: 23 }
		]);

		const caret = doc.indexOf('tight');
		handle.focus();
		handle.setSelection({ anchor: caret, head: caret });
		await userEvent.keyboard('x');

		// The edit reached both copies…
		expect(handle.getSnapshot().text.split('xtight')).toHaveLength(3);
		// …and took no timing with it.
		expect(handle.getLineAnchors?.()).toEqual([
			{ line: 2, time: 1 },
			{ line: 3, time: 3 },
			{ line: 6, time: 20 },
			{ line: 7, time: 23 }
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

describe('following the playhead', () => {
	// Sync mode is not the only time the document follows: playing a timed song
	// pulls the marked line to the same reading line, so reading along does not
	// mean scrolling by hand.
	it('parks the marked line a third down as the playhead crosses into it', async () => {
		const long = ['[Verse 1]', ...Array.from({ length: 60 }, (_, i) => `line ${i + 1}`)].join('\n');
		const { handle } = await mount({ text: long, mediaTime: () => 0 });
		handle.setLineAnchors?.(Array.from({ length: 60 }, (_, i) => ({ line: i + 2, time: i + 1 })));

		const pane = document.querySelector<HTMLElement>('.editor-pane')!;
		pane.style.height = '300px';
		const scroller = document.querySelector<HTMLElement>('.cm-scroller')!;
		await vi.waitFor(() => {
			if (scroller.clientHeight < 200) throw new Error('the pane has no height yet');
		});

		handle.setMediaPlayhead?.(1);
		expect(scroller.scrollTop).toBe(0);

		handle.setMediaPlayhead?.(30);

		await vi.waitFor(() => {
			const row = [...document.querySelectorAll<HTMLElement>('.cm-content .cm-line')].find(
				(element) => element.textContent === 'line 30'
			);
			if (!row) throw new Error('the marked row is not rendered');
			const viewport = scroller.getBoundingClientRect();
			const offset = row.getBoundingClientRect().top - viewport.top;
			expect(Math.abs(offset - viewport.height / 3)).toBeLessThan(row.offsetHeight);
		});
	});

	// A scoped run does not scroll — not on entry, not on the playhead follow,
	// not on a tap. The reading-line hold exists for a pass over the whole song,
	// where the caret descends out of view; a scoped run's lines were on screen
	// when the user selected them, and the document jumping to a reading
	// position right after they carefully put a selection where they were
	// looking is a jump nobody asked for. The follow stands down through the
	// `suppressPlayheadFollow` facet, and the run's own moves are a nearest-edge
	// nudge, which scrolls nothing while the line is visible.
	it('holds the document still through a scoped run', async () => {
		const long = ['[Verse 1]', ...Array.from({ length: 60 }, (_, i) => `line ${i + 1}`)].join('\n');
		const { handle } = await mount({ text: long, mediaTime: () => 30 });
		// Timed lines far below the viewport, so the follow would have somewhere
		// dramatic to go when the playhead crosses them — the top-of-document clamp
		// must not be what passes this test.
		handle.setLineAnchors?.([
			{ line: 41, time: 1 },
			{ line: 42, time: 2 }
		]);

		const pane = document.querySelector<HTMLElement>('.editor-pane')!;
		pane.style.height = '300px';
		const scroller = document.querySelector<HTMLElement>('.cm-scroller')!;
		await vi.waitFor(() => {
			if (scroller.clientHeight < 200) throw new Error('the pane has no height yet');
		});
		handle.setMediaPlayhead?.(0.5);

		// Two visible lines low enough in the viewport that the reading-line hold
		// would have pulled them up on entry.
		const from = long.indexOf('line 10');
		handle.setSelection({ anchor: from, head: long.indexOf('line 11') + 'line 11'.length });
		handle.setLyricSync?.(true);
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(scroller.scrollTop).toBe(0);

		// The playhead crossing a marked line is the follow's own trigger, and the
		// marked lines sit forty rows down — suppressed, nothing moves.
		handle.setMediaPlayhead?.(1.5);
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(scroller.scrollTop).toBe(0);

		// A tap lands on a visible line, so the nearest-edge nudge moves nothing.
		handle.tapLyricSync?.();
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(scroller.scrollTop).toBe(0);
	});

	// Typing is not the playhead moving. `currentFrom` is an offset, so an edit
	// above the marked line shifts it — and the follow used to read that raw
	// difference as the mark crossing onto another line, so any keystroke hauled
	// the reader from the line they were editing back to the reading line.
	it('does not scroll for a keystroke that only shifted the marked line', async () => {
		const long = ['[Verse 1]', ...Array.from({ length: 60 }, (_, i) => `line ${i + 1}`)].join('\n');
		const { handle } = await mount({ text: long, mediaTime: () => 30 });
		handle.setLineAnchors?.(Array.from({ length: 60 }, (_, i) => ({ line: i + 2, time: i + 1 })));

		const pane = document.querySelector<HTMLElement>('.editor-pane')!;
		pane.style.height = '300px';
		const scroller = document.querySelector<HTMLElement>('.cm-scroller')!;
		await vi.waitFor(() => {
			if (scroller.clientHeight < 200) throw new Error('the pane has no height yet');
		});

		handle.setMediaPlayhead?.(30);
		await vi.waitFor(() => {
			if (scroller.scrollTop === 0) throw new Error('the follow has not scrolled yet');
		});
		// Let the eased scroll finish, or its remaining frames overwrite the
		// reader's own position below.
		await new Promise((resolve) => setTimeout(resolve, 500));

		// The reader scrolls back up to fix an earlier line and types into it.
		scroller.scrollTop = 0;
		await userEvent.click(page.getByText('line 1', { exact: true }));
		scroller.scrollTop = 0;
		await userEvent.keyboard('!');

		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(scroller.scrollTop).toBe(0);
	});

	// The report this pins: with follow on and the marked line inside a linked
	// section, typing in the *other* linked section scrolled the reader away.
	// The mirror's whole-run replacement erased the peer's anchors, the mark
	// fell back to the last survivor, and the follow read that as the playhead
	// moving. With the mirrored edit narrowed, nothing moves and nothing is lost.
	it('stays put when typing in a linked section while the mark is in its peer', async () => {
		const lines = Array.from({ length: 24 }, (_, i) => `line ${i + 1}`);
		const doc = ['[Chorus]', ...lines, '', '[Chorus 2]', ...lines].join('\n');
		const { handle } = await mount({ text: doc, mediaTime: () => 50 });
		handle.linkSections?.({ headers: [doc.indexOf('[Chorus]'), doc.indexOf('[Chorus 2]')] });
		handle.setLineAnchors?.([
			...lines.map((_, i) => ({ line: 2 + i, time: 1 + i })),
			...lines.map((_, i) => ({ line: 28 + i, time: 40 + i }))
		]);

		const pane = document.querySelector<HTMLElement>('.editor-pane')!;
		pane.style.height = '300px';
		const scroller = document.querySelector<HTMLElement>('.cm-scroller')!;
		await vi.waitFor(() => {
			if (scroller.clientHeight < 200) throw new Error('the pane has no height yet');
		});

		// Playhead at 50 marks a line deep in the second chorus; the follow parks it.
		handle.setMediaPlayhead?.(50);
		await vi.waitFor(() => {
			if (scroller.scrollTop === 0) throw new Error('the follow has not scrolled yet');
		});
		await new Promise((resolve) => setTimeout(resolve, 500));

		// The reader scrolls back up and types into the first chorus.
		handle.focus();
		const caret = doc.indexOf('line 1');
		handle.setSelection({ anchor: caret, head: caret });
		scroller.scrollTop = 0;
		await userEvent.keyboard('!');

		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(scroller.scrollTop).toBe(0);
		// And the second chorus kept every timing it had.
		expect(handle.getLineAnchors?.()).toHaveLength(48);
	});

	it('stops following once the shell turns it off', async () => {
		const long = ['[Verse 1]', ...Array.from({ length: 60 }, (_, i) => `line ${i + 1}`)].join('\n');
		const { handle } = await mount({ text: long, mediaTime: () => 0 });
		handle.setLineAnchors?.(Array.from({ length: 60 }, (_, i) => ({ line: i + 2, time: i + 1 })));

		const pane = document.querySelector<HTMLElement>('.editor-pane')!;
		pane.style.height = '300px';
		const scroller = document.querySelector<HTMLElement>('.cm-scroller')!;
		await vi.waitFor(() => {
			if (scroller.clientHeight < 200) throw new Error('the pane has no height yet');
		});

		handle.setFollowPlayhead?.(false);
		handle.setMediaPlayhead?.(30);

		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(scroller.scrollTop).toBe(0);
	});
});

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

		expect(syncChanges).toEqual([{ active: true, startAt: 0, scoped: false }]);
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
		expect(anchor?.time).toBeCloseTo(30 - tapOffsetSeconds, 5);
		expect(handle.getSnapshot().selection.head).toBe(song.indexOf('first line'));
	});

	// The transport's tap control, for a pointer with no `Space`. It runs the same
	// command the key does — that is the whole reason it is a command and not a
	// synthesised key event — so a run driven entirely from the strip has to time
	// the same lines, at the same offset, in the same order, with the editor never
	// focused.
	it('times a line from the transport control, with the editor unfocused', async () => {
		const { handle } = await mount({
			text: song,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 30
		});
		handle.setLyricSync?.(true);

		handle.tapLyricSync?.();
		handle.tapLyricSync?.();

		const anchors = handle.getLineAnchors?.() ?? [];
		expect(anchors.map((anchor) => anchor.line)).toEqual([2, 5]);
		expect(anchors[0]?.time).toBeCloseTo(30 - tapOffsetSeconds, 5);
		expect(handle.getSnapshot().selection.head).toBe(song.indexOf('second line'));
	});

	// Outside a run it is a no-op, exactly like the binding it stands in for: a
	// control the shell leaves wired must not write an anchor when nothing asked
	// for one.
	it('does nothing from the transport control while no run is under way', async () => {
		const { handle } = await mount({
			text: song,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 30
		});

		handle.tapLyricSync?.();

		expect(handle.getLineAnchors?.() ?? []).toEqual([]);
	});

	// The tap offset is a wall-clock fact about a hand, so what it costs in track
	// time scales with the playback rate: at 0.5× the tape moves half as far
	// during the same human lateness, and a fixed 50ms would stamp every anchor
	// written at a practice rate early. Slowing the tape down is exactly what a
	// transcriber does when the lines come too fast, so the practice rate is where
	// a run's accuracy matters most.
	it('scales the tap offset by the playback rate', async () => {
		const { handle } = await mount({
			text: song,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 30,
			mediaRate: () => 0.5
		});
		handle.setLyricSync?.(true);

		handle.tapLyricSync?.();

		const [anchor] = handle.getLineAnchors?.() ?? [];
		expect(anchor?.time).toBeCloseTo(30 - tapOffsetSeconds * 0.5, 5);
	});

	// Pausing holds the run rather than ending it — the transcription loop is
	// listen, pause, think, and the transport keys are bound to the window — and a
	// tap made against the parked tape is refused out loud instead of spent. Spent,
	// it would write the pause's own moment onto the next line, wrong by the length
	// of the pause with nothing on screen saying so. Refusing changes nothing
	// visible either, so the sentence goes out on both channels.
	it('refuses a tap while the tape is paused and keeps the run armed', async () => {
		let time = 30;
		let playing = true;
		const { handle, syncChanges, announcements, notices } = await mount({
			text: song,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => time,
			mediaPlaying: () => playing
		});
		handle.setLyricSync?.(true);

		handle.tapLyricSync?.();
		playing = false;
		handle.tapLyricSync?.();

		// The refused tap wrote nothing and moved nothing.
		expect(handle.getLineAnchors?.() ?? []).toHaveLength(1);
		expect(handle.getSnapshot().selection.head).toBe(song.indexOf('first line'));
		expect(announcements.at(-1)).toBe('Sync is paused. Press play to keep tapping.');
		expect(notices.at(-1)).toBe('Sync is paused. Press play to keep tapping.');
		// And the mode never turned off: nothing reported an exit to the shell.
		expect(syncChanges.every((change) => change.active)).toBe(true);

		// Resuming needs no re-entry — the next tap is an ordinary tap, advancing
		// onto the next line exactly as if the pause had never happened.
		playing = true;
		time = 42;
		handle.tapLyricSync?.();
		const anchors = handle.getLineAnchors?.() ?? [];
		expect(anchors.map((anchor) => anchor.line)).toEqual([2, 5]);
		expect(anchors[1]?.time).toBeCloseTo(42 - tapOffsetSeconds, 5);
	});

	// A selection scopes a run: entering collapses it, the first tap times the
	// selection's first line, and timing its last ends the run — the selection is
	// the one gesture that deliberately names a region, so the run covers it and
	// nothing else. With no timed line above it the editor names no start moment
	// at all (`startAt` undefined), because wherever the user parked the tape is
	// the only position anybody chose — and a tap stamps `liveTime()`, so it is
	// true whenever it is made.
	it('scopes a run to the selection and finishes on its last line', async () => {
		const verse = ['[Verse 1]', 'first line', 'second line', '', '[Chorus]', 'third line'].join(
			'\n'
		);
		const from = verse.indexOf('first line');
		const { handle, syncChanges, announcements } = await mount({
			text: verse,
			selection: { anchor: from, head: verse.indexOf('second line') + 'second line'.length },
			mediaTime: () => 30
		});

		handle.setLyricSync?.(true);

		expect(syncChanges.at(-1)).toEqual({ active: true, startAt: undefined, scoped: true });
		expect(handle.getSnapshot().selection.head).toBe(from);
		expect(announcements.at(-1)).toBe('Syncing the selection. The tape is where you left it.');

		handle.tapLyricSync?.();
		handle.tapLyricSync?.();

		// Both selected lines are timed, the chorus line is not this run's to
		// time, and the run said so on its way out.
		const anchors = handle.getLineAnchors?.() ?? [];
		expect(anchors.map((anchor) => anchor.line)).toEqual([2, 3]);
		expect(syncChanges.at(-1)?.active).toBe(false);
		expect(announcements.at(-1)).toContain('Last selected line timed');
	});

	// Where the stampable line directly above the selection already has a time,
	// a scoped run enters resume-style — caret on that line, armed, tape sent to
	// its anchor — so there is a whole line of run-up to tap against, exactly as
	// a resumed pass gives itself.
	it('enters a scoped run with a run-up from the timed line above the selection', async () => {
		const verse = ['[Verse 1]', 'first line', 'second line', 'third line'].join('\n');
		const { handle, syncChanges } = await mount({ text: verse, mediaTime: () => 50 });
		handle.setLineAnchors?.([{ line: 2, time: 12 }]);
		const from = verse.indexOf('second line');
		handle.setSelection({ anchor: from, head: from + 'second line'.length });

		handle.setLyricSync?.(true);

		expect(syncChanges.at(-1)).toEqual({ active: true, startAt: 12, scoped: true });
		expect(handle.getSnapshot().selection.head).toBe(verse.indexOf('first line'));

		// The first tap advances off the run-up line and times the selection's own
		// first line, which is what the arming is for — and that line is also the
		// selection's last, so the run is done.
		handle.tapLyricSync?.();
		expect((handle.getLineAnchors?.() ?? []).map((anchor) => anchor.line)).toEqual([2, 3]);
		expect(syncChanges.at(-1)?.active).toBe(false);
	});

	// The run's first tap is a keystroke, so entry must leave the editor holding
	// focus even when the press that started the run was made with focus parked
	// somewhere else — on the scrubber the user just aimed, most likely, since
	// parking the tape is exactly what a scoped run's own design tells them to
	// do. The shell focuses on entry; this drives that call from where it really
	// runs, inside the dispatch that turned the mode on.
	it('taps from the keyboard immediately after a scoped entry made with focus elsewhere', async () => {
		const verse = ['[Verse 1]', 'first line', 'second line'].join('\n');
		const from = verse.indexOf('first line');
		const { handle } = await mount({
			text: verse,
			selection: { anchor: from, head: verse.length },
			mediaTime: () => 30,
			focusEditorOnSync: true
		});
		const outside = document.createElement('button');
		document.body.append(outside);
		try {
			outside.focus();
			expect(document.activeElement).toBe(outside);

			handle.setLyricSync?.(true);
			// The shell's focus lands one frame after the press has played out.
			await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
			await userEvent.keyboard(' ');

			const anchors = handle.getLineAnchors?.() ?? [];
			expect(anchors.map((anchor) => anchor.line)).toEqual([2]);
		} finally {
			outside.remove();
		}
	});

	// A selection touching no lyric line at all is not a scope: the press falls
	// back to the ordinary pass, which is also what the strip's label promised in
	// that state — both read the same `isLyricLine` underneath.
	it('falls back to a full pass when the selection covers no lyric line', async () => {
		const { handle, syncChanges } = await mount({
			text: song,
			selection: { anchor: 0, head: '[Verse 1]'.length },
			mediaTime: () => 30
		});

		handle.setLyricSync?.(true);

		expect(syncChanges.at(-1)).toEqual({ active: true, startAt: 0, scoped: false });
		expect(handle.getSnapshot().selection.head).toBe(song.indexOf('first line'));
	});

	// A scoped run stops the linked fill at its own boundary, exactly as the fill
	// already stops at a peer's first gap: the user selected these lines and no
	// others, and a shortcut that dated lines outside the selection would break
	// the one promise the scope makes. Truncated rather than refused, so the
	// selected part of the copy still times itself in one tap.
	it('truncates a linked fill at the selection boundary', async () => {
		const doc = [
			'[Chorus]',
			'Hold on tight',
			'Never let go',
			'Stay with me',
			'',
			'[Chorus 2]',
			'Hold on tight',
			'Never let go',
			'Stay with me'
		].join('\n');
		const { handle, notices, syncChanges } = await mount({ text: doc, mediaTime: () => 60 });
		handle.linkSections?.({ headers: [doc.indexOf('[Chorus]'), doc.indexOf('[Chorus 2]')] });
		handle.setLineAnchors?.([
			{ line: 2, time: 10 },
			{ line: 3, time: 13 },
			{ line: 4, time: 16 }
		]);
		// The second chorus's first two lines only.
		const from = doc.lastIndexOf('Hold on tight');
		handle.setSelection({
			anchor: from,
			head: doc.lastIndexOf('Never let go') + 'Never let go'.length
		});
		handle.setLyricSync?.(true);

		handle.tapLyricSync?.();

		// The tap timed line 7, the fill dated line 8 from the peer's interval and
		// stopped there — line 9 is outside the selection and stays untimed — and
		// landing on the boundary ended the run.
		expect((handle.getLineAnchors?.() ?? []).map((anchor) => anchor.line)).toEqual([2, 3, 4, 7, 8]);
		expect(notices.at(-1)).toContain('2 lines');
		expect(syncChanges.at(-1)?.active).toBe(false);
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

	// The document is no longer held read-only, so the run's own keymap is the
	// whole of what keeps its keys out of the text. Each of these commands returns
	// true down every path it has while a run is under way, so none of them ever
	// reaches the document — a run that typed a space into the lyric on its first
	// tap would be worse than no run at all.
	it('keeps the run’s own keys out of the document', async () => {
		const { handle, syncChanges } = await mount({ text: song, mediaTime: () => 30 });
		handle.setLyricSync?.(true);
		handle.focus();

		await userEvent.keyboard(' {Backspace}{ArrowUp}');

		expect(handle.getSnapshot().text).toBe(song);
		expect(syncChanges.at(-1)?.active).toBe(true);
	});

	// Typing is the fourth way out, and the only one that arrives without having
	// been asked for. A mode that answered a mis-keyed letter with nothing at all
	// left the user typing at a line they could see was wrong, with no sign of why
	// it would not take — so the keystroke ends the run and then lands, exactly
	// where it was typed.
	it('ends the run on a typed character, and takes the character', async () => {
		const { handle, syncChanges, announcements } = await mount({
			text: song,
			mediaTime: () => 30
		});
		handle.setLyricSync?.(true);
		handle.focus();

		await userEvent.keyboard(' x');

		expect(syncChanges.at(-1)?.active).toBe(false);
		// The caret is on the line the tap just timed, which is where the character
		// belongs: the user is fixing the line they are hearing.
		expect(handle.getSnapshot().text).toBe(song.replace('first line', 'xfirst line'));
		expect(announcements.at(-1)).toBe('Sync stopped: the document changed.');
		// The run's work survives it. Ending is not undoing.
		expect((handle.getLineAnchors?.() ?? []).map(({ line }) => line)).toEqual([2]);
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

	// The caret alone is half a step back: a run is one pass over the document
	// against one pass of the audio, so leaving the tape where the fumble happened
	// would have the user reading the line before it while hearing the line after,
	// and the next tap would land as wrong as the one just taken back.
	it('backs the tape up to the previous line on Backspace', async () => {
		const longer = [...song.split('\n'), 'third line'].join('\n');
		// Two distinguishable taps, so the seek can be checked against the earlier
		// one rather than against whatever the tape happens to say now.
		let now = 30;
		const { handle, seek } = await mount({
			text: longer,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => now
		});
		handle.setLyricSync?.(true);
		handle.focus();

		await userEvent.keyboard(' ');
		now = 45;
		await userEvent.keyboard(' ');
		seek.mockClear();

		await userEvent.keyboard('{Backspace}');

		// The first line's own anchor, offset and all, so the line the caret is on
		// starts a beat after playback resumes.
		expect(seek).toHaveBeenCalledWith(30 - tapOffsetSeconds);
	});

	// The first tap of a run has no line behind it, so there is no moment to go
	// back to. The tap comes off and the tape is left where it is, rather than
	// being sent somewhere invented.
	it('leaves the tape alone stepping back off the first line of a run', async () => {
		const { handle, seek } = await mount({
			text: song,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => 30
		});
		handle.setLyricSync?.(true);
		handle.focus();

		await userEvent.keyboard(' ');
		seek.mockClear();
		await userEvent.keyboard('{Backspace}');

		expect(seek).not.toHaveBeenCalled();
		expect(handle.getLineAnchors?.()).toEqual([]);
		expect(handle.getSnapshot().selection.head).toBe(song.indexOf('first line'));
	});

	/*
	 * The save path, and the reason it needs one of its own: no way of setting an
	 * anchor changes any text, so the shell's snapshot — which is what schedules a
	 * write — never fires. Without this hook a whole synced song was lost on
	 * reload.
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

	/*
	 * The wash and the caret are read against each other on every tap, and they
	 * were not moving together. The marked line is the last anchor at or before the
	 * *playhead*, and the playhead the editor holds is `currentTime` — a
	 * `timeupdate`-fed mirror, up to a tick stale — while a tap stamps its line
	 * from `liveTime`. Whenever the mirror was more than the tap offset itself
	 * behind, the line just timed sorted after the playhead on record: the caret
	 * moved and the yellow band stayed a line behind it until the next tick.
	 *
	 * The mirror is deliberately never pushed here, so the only thing that can put
	 * the band on the right line is the tap publishing the reading it took.
	 */
	it('moves the wash with the caret, without waiting for the next playhead tick', async () => {
		let now = 30;
		const { handle } = await mount({
			text: song,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => now
		});
		// A tick from a second ago, which is what the shell would still be holding.
		await withColumn(handle, 29);

		handle.setLyricSync?.(true);
		handle.tapLyricSync?.();

		const washed = () => document.querySelector('.cm-line.ll-current-line')?.textContent;
		await vi.waitFor(() => expect(washed()).toBe('first line'));

		now = 40;
		handle.tapLyricSync?.();

		await vi.waitFor(() => expect(washed()).toBe('second line'));
		// One band, not two: the previous line gives the mark up in the same
		// transaction it hands the caret on.
		expect(document.querySelectorAll('.cm-line.ll-current-line')).toHaveLength(1);
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

	// The document follows the run, and every advance parks the line being timed at
	// the reading line a third down — including a run resumed mid-song, which used
	// to sit wherever the document happened to be scrolled and never come down.
	it('parks the line being timed a third down, wherever the run started', async () => {
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

		// Near the top there is nowhere to scroll to: the target is negative and the
		// browser clamps it away.
		await userEvent.keyboard('   ');
		expect(scroller.scrollTop).toBe(0);

		await userEvent.keyboard('            ');
		await vi.waitFor(() => {
			if (scroller.scrollTop === 0) throw new Error('the document has not moved yet');
		});

		const rowFor = (head: number) => {
			const text = handle.getSnapshot().text;
			const from = text.lastIndexOf('\n', head - 1) + 1;
			const to = text.indexOf('\n', head);
			const caretText = text.slice(from, to === -1 ? undefined : to);
			return [...document.querySelectorAll<HTMLElement>('.cm-content .cm-line')].find(
				(element) => element.textContent === caretText
			);
		};

		await vi.waitFor(() => {
			const row = rowFor(handle.getSnapshot().selection.head);
			if (!row) throw new Error('the caret row is not rendered');
			const viewport = scroller.getBoundingClientRect();
			const offset = row.getBoundingClientRect().top - viewport.top;
			expect(Math.abs(offset - viewport.height / 3)).toBeLessThan(row.offsetHeight);
		});
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
		// The space went to the document rather than timing a line, which is the
		// other half of the same claim.
		expect(handle.getLineAnchors?.()).toEqual([]);
	});

	/*
	 * A song synced once and then edited — a line split into two, in several
	 * places — is timed everywhere except the new lines. A resumed run only knows
	 * how to pick up before the *first* gap; the skip is how the run reaches the
	 * later ones without re-listening through verses that are already right.
	 */
	describe('skipping past timed lines', () => {
		// Line 3 (`second line`) and line 6 (`fifth line`) are the halves a split
		// left untimed; everything else already carries a time.
		const gapped = [
			'[Verse 1]',
			'first line',
			'second line',
			'third line',
			'fourth line',
			'fifth line',
			'sixth line'
		].join('\n');
		const gappedAnchors = [
			{ line: 2, time: 10 },
			{ line: 4, time: 30 },
			{ line: 5, time: 40 },
			{ line: 7, time: 60 }
		];

		it('lands the run on the last timed line before the next untimed one, tape rewound to it', async () => {
			let now = 20;
			const { handle, seek, announcements } = await mount({
				text: gapped,
				selection: { anchor: 0, head: 0 },
				mediaTime: () => now
			});
			handle.setLineAnchors?.(gappedAnchors);

			// The run resumes before the first gap and the tap times it, exactly as
			// it always has. The second gap is now three timed lines away.
			handle.setLyricSync?.(true);
			handle.tapLyricSync?.();
			expect(handle.getSnapshot().selection.head).toBe(gapped.indexOf('second line'));
			seek.mockClear();

			handle.skipLyricSync?.();

			// The landing is `fourth line` — timed, directly before the untimed
			// `fifth line` — and the tape goes to its own anchor, so there is a whole
			// line of run-up to tap against.
			expect(handle.getSnapshot().selection.head).toBe(gapped.indexOf('fourth line'));
			expect(seek).toHaveBeenCalledWith(40);
			expect(announcements.at(-1)).toBe(
				'Skipped the timed lines to 0:40. The next line is untimed.'
			);

			// Armed by the jump: the next tap belongs to the untimed line below.
			now = 50;
			handle.tapLyricSync?.();
			const anchors = handle.getLineAnchors?.() ?? [];
			expect(anchors.find((anchor) => anchor.line === 6)?.time).toBeCloseTo(
				50 - tapOffsetSeconds,
				5
			);
		});

		// The next tap is already aimed at the gap, so a jump would move nothing —
		// and a jump anywhere further would leave an untimed line behind the caret,
		// which is a line the run never comes back to.
		it('refuses when the next untimed line is the one the next tap already times', async () => {
			const { handle, seek } = await mount({
				text: gapped,
				selection: { anchor: 0, head: 0 },
				mediaTime: () => 20
			});
			handle.setLineAnchors?.(gappedAnchors);
			handle.setLyricSync?.(true);
			const resumed = handle.getSnapshot().selection.head;
			seek.mockClear();

			handle.skipLyricSync?.();

			expect(handle.getSnapshot().selection.head).toBe(resumed);
			expect(seek).not.toHaveBeenCalled();
		});

		// Outside a run it is a no-op, exactly like the tap it sits beside.
		it('does nothing while no run is under way', async () => {
			const { handle, seek } = await mount({
				text: gapped,
				selection: { anchor: 0, head: 0 },
				mediaTime: () => 20
			});
			handle.setLineAnchors?.(gappedAnchors);

			handle.skipLyricSync?.();

			expect(handle.getSnapshot().selection.head).toBe(0);
			expect(seek).not.toHaveBeenCalled();
		});
	});
});

/*
 * A chorus is typed once and sung three times, and a link is the document saying
 * so. A run that has already timed one copy therefore knows the shape of the
 * next: the words are the same words, and all that is left to establish is where
 * in the song this repeat starts — which is exactly what the tap walking into it
 * says. So the tap dates the first line and the peer's own intervals date the
 * rest, the tape moves past what it just answered, and a toast says what happened
 * and how to refuse it.
 */
describe('sync mode across linked sections', () => {
	const linkedLines = [
		'[Verse 1]', // 1
		'first line', // 2
		'', // 3
		'[Chorus]', // 4
		'hold on tight', // 5
		'we go again', // 6
		'all night long', // 7
		'', // 8
		'[Verse 2]', // 9
		'second line', // 10
		'', // 11
		'[Chorus 2]', // 12
		'hold on tight', // 13
		'we go again', // 14
		'all night long', // 15
		'', // 16
		'[Outro]', // 17
		'fade away' // 18
	];
	const linkedSong = linkedLines.join('\n');

	/** The first chorus timed by hand, the verses with it, the repeat still bare. */
	const timedFirstCopy = [
		{ line: 2, time: 5 },
		{ line: 5, time: 10 },
		{ line: 6, time: 12 },
		{ line: 7, time: 14.5 },
		{ line: 10, time: 20 }
	];

	async function halfTimed(now: () => number) {
		const mounted = await mount({
			text: linkedSong,
			selection: { anchor: 0, head: 0 },
			mediaTime: now
		});
		// The column only draws once the shell has said where the audio is, and the
		// line numbers only answer a press while it has.
		await withColumn(mounted.handle, 0);
		mounted.handle.setLineAnchors?.(timedFirstCopy);
		mounted.handle.setSectionLinks?.([{ lines: [4, 12] }]);
		return mounted;
	}

	function times(handle: EditorHandle): Record<number, number> {
		return Object.fromEntries(
			(handle.getLineAnchors?.() ?? []).map(({ line, time }) => [line, time])
		);
	}

	// The times themselves are never copied — a peer's anchors belong to its own
	// moment in the song, and carried over outright every jump into the second
	// chorus would land in the first. What repeats is the distance between lines.
	it('times a linked repeat from the intervals of the copy already timed', async () => {
		let now = 0;
		const { handle, seek, syncChanges, notices, announcements } = await halfTimed(() => now);

		handle.setLyricSync?.(true);
		// The run resumes on the last line that already has a time, so its first tap
		// advances onto the repeat exactly as any other tap would.
		expect(syncChanges.at(-1)).toEqual({ active: true, startAt: 20, scoped: false });

		now = 100;
		handle.tapLyricSync?.();

		const anchored = times(handle);
		// The tap dates the first line, biased early by the usual offset.
		expect(anchored[13]).toBeCloseTo(100 - tapOffsetSeconds, 5);
		// And the peer's own 2s and 4.5s gaps date the two after it.
		expect(anchored[14]).toBeCloseTo(102 - tapOffsetSeconds, 5);
		expect(anchored[15]).toBeCloseTo(104.5 - tapOffsetSeconds, 5);
		// The copy it was taken from is untouched.
		expect(anchored[5]).toBe(10);

		// The caret is on the last line of the repeat, so the next tap starts the
		// section after it.
		expect(handle.getSnapshot().selection.head).toBe(linkedSong.lastIndexOf('all night long'));
		// And the wash is on that same line rather than on the one the tap landed
		// on: a fill publishes where the tape is being sent, or the band would sit at
		// the top of the section the caret has just left. Read off the marked
		// timestamp, which is unique where the lyric is not — the repeat's last line
		// reads the same words as the first copy's.
		await vi.waitFor(() => {
			expect(
				[...document.querySelectorAll<HTMLElement>('.ll-time-value--current')].map(
					(value) => value.textContent
				)
			).toEqual(['1:44']);
			expect(document.querySelector('.cm-line.ll-current-line')?.textContent).toBe(
				'all night long'
			);
		});
		// And the tape goes with it: listening through a chorus that is already timed
		// is waiting for a tap nobody is going to make.
		expect(seek).toHaveBeenCalledTimes(1);
		expect(seek.mock.calls[0]?.[0]).toBeCloseTo(104.5 - tapOffsetSeconds, 5);

		const message =
			'Chorus 2 timed from Chorus — 3 lines. Press a line number to time it by hand instead.';
		// Both audiences: the toast region is not a live region, and either alone
		// loses one of them.
		expect(notices).toEqual([message]);
		expect(announcements).toContain(message);

		// The run carries on into the outro rather than ending on the fill.
		expect(syncChanges.at(-1)?.active).toBe(true);
		now = 120;
		handle.tapLyricSync?.();
		expect(times(handle)[18]).toBeCloseTo(120 - tapOffsetSeconds, 5);
	});

	// The way out, and the only one. Pressing the repeat's first line number sends
	// the tape back to it and the run's caret with it — the two ends of a run
	// cannot be in different places — and the section is not written a second time,
	// or the shortcut would take the correction away on the very press it exists
	// for.
	it('hands the section back on a press of its line number, and does not refill it', async () => {
		let now = 0;
		const { handle, seek, notices } = await halfTimed(() => now);
		handle.setLyricSync?.(true);
		now = 100;
		handle.tapLyricSync?.();

		const first = lineNumberElements().find((element) => element.textContent === '13');
		expect(first?.classList.contains('ll-line-seek')).toBe(true);
		first?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

		// The press plays from the line, as it does outside a run.
		expect(seek.mock.calls.at(-1)?.[0]).toBeCloseTo(100 - tapOffsetSeconds, 5);
		expect(handle.getSnapshot().selection.head).toBe(linkedSong.lastIndexOf('hold on tight'));

		// Armed, exactly as a resumed run is: the press landed on a line that already
		// carries a time — the user's own tap, in this case — so the next tap belongs
		// to the line after it, which is the first one the fill wrote. A press that
		// cost a dead tap here is what this run was reported as doing.
		now = 200;
		handle.tapLyricSync?.();
		expect(times(handle)[13]).toBeCloseTo(100 - tapOffsetSeconds, 5);
		expect(times(handle)[14]).toBeCloseTo(200 - tapOffsetSeconds, 5);
		// And it stays a plain tap, with nothing written below it.
		expect(times(handle)[15]).toBeCloseTo(104.5 - tapOffsetSeconds, 5);
		expect(notices).toHaveLength(1);

		now = 210;
		handle.tapLyricSync?.();
		expect(times(handle)[15]).toBeCloseTo(210 - tapOffsetSeconds, 5);
	});

	// The complaint this arrived as: hit sync, press a numbered line that already
	// has a time, and the first tap went nowhere. It could not have gone anywhere —
	// the press seeks to that line's own stored anchor, so a tap against it rewrites
	// the moment it just rewound to and the caret does not move.
	it('times the next line on the first tap after a jump', async () => {
		let now = 0;
		const { handle } = await halfTimed(() => now);
		handle.setLyricSync?.(true);

		const second = lineNumberElements().find((element) => element.textContent === '6');
		second?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(handle.getSnapshot().selection.head).toBe(linkedSong.indexOf('we go again'));

		now = 50;
		handle.tapLyricSync?.();
		// One press, one line timed: the line pressed keeps the time that sent the
		// tape there, and the tap lands on the one below it.
		expect(times(handle)[6]).toBeCloseTo(12, 5);
		expect(times(handle)[7]).toBeCloseTo(50 - tapOffsetSeconds, 5);
	});

	// Only from a copy that comes earlier. A later peer is the same words and would
	// date this section just as well, but a section written by the one below it
	// reads as the document filling itself in backwards — and the run has not been
	// there yet, so those are the times the user is on their way to correcting.
	it('never fills a copy from the one below it', async () => {
		let now = 0;
		const { handle, notices } = await mount({
			text: linkedSong,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => now
		});
		await withColumn(handle, 0);
		// This time the *second* chorus is the one already timed.
		handle.setLineAnchors?.([
			{ line: 13, time: 60 },
			{ line: 14, time: 62 },
			{ line: 15, time: 64.5 }
		]);
		handle.setSectionLinks?.([{ lines: [4, 12] }]);

		handle.setLyricSync?.(true);
		now = 10;
		handle.tapLyricSync?.();
		now = 20;
		handle.tapLyricSync?.();

		// The first chorus's opening line is timed by the tap and nothing else is.
		expect(times(handle)[5]).toBeCloseTo(20 - tapOffsetSeconds, 5);
		expect(times(handle)[6]).toBeUndefined();
		expect(handle.getSnapshot().selection.head).toBe(linkedSong.indexOf('hold on tight'));
		expect(notices).toEqual([]);
	});

	// A link the user has not made says nothing about the words, so two choruses
	// that happen to match are still tapped one line at a time.
	it('says nothing about a repeat that is not linked', async () => {
		let now = 0;
		const { handle, seek, notices } = await mount({
			text: linkedSong,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => now
		});
		await withColumn(handle, 0);
		handle.setLineAnchors?.(timedFirstCopy);

		handle.setLyricSync?.(true);
		now = 100;
		handle.tapLyricSync?.();

		expect(times(handle)[13]).toBeCloseTo(100 - tapOffsetSeconds, 5);
		expect(times(handle)[14]).toBeUndefined();
		expect(handle.getSnapshot().selection.head).toBe(linkedSong.lastIndexOf('hold on tight'));
		expect(seek).not.toHaveBeenCalled();
		expect(notices).toEqual([]);
	});

	/*
	 * The fill pairs lines by index, and the link model deliberately allows the
	 * copies to differ — a chorus carrying a line its peer lacks is the shape the
	 * merge model was rebuilt for. Pairing past such a line dates every later line
	 * with the *next* peer line's offset: times that still increase, so the
	 * monotonicity guard passes, and nothing on screen says they are wrong. So the
	 * fill stops where the line structures part ways, exactly as it stops at a
	 * peer's first gap, and the tapping is handed back.
	 */
	it('refuses to fill past a line the timed copy does not have', async () => {
		const divergedLines = [
			'[Verse 1]', // 1
			'first line', // 2
			'', // 3
			'[Chorus]', // 4
			'hold on tight', // 5
			'we go again', // 6
			'all night long', // 7
			'', // 8
			'[Verse 2]', // 9
			'second line', // 10
			'', // 11
			'[Chorus 2]', // 12
			'hold on tight', // 13
			'oh yeah', // 14 — this copy's own line, second from the top
			'we go again', // 15
			'all night long' // 16
		];
		const divergedSong = divergedLines.join('\n');
		let now = 0;
		const { handle, seek, notices } = await mount({
			text: divergedSong,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => now
		});
		await withColumn(handle, 0);
		handle.setLineAnchors?.(timedFirstCopy);
		handle.setSectionLinks?.([{ lines: [4, 12] }]);

		handle.setLyricSync?.(true);
		now = 100;
		handle.tapLyricSync?.();

		// The structures part ways one line in, so there is nothing left for the
		// peer to date and the tap is a plain tap: positional pairing would have put
		// 'we go again' — +2s in the copy it repeats — at +4.5s, and left the last
		// line untimed behind a caret that had moved past it.
		expect(times(handle)[13]).toBeCloseTo(100 - tapOffsetSeconds, 5);
		expect(times(handle)[14]).toBeUndefined();
		expect(times(handle)[15]).toBeUndefined();
		expect(times(handle)[16]).toBeUndefined();
		expect(handle.getSnapshot().selection.head).toBe(divergedSong.lastIndexOf('hold on tight'));
		expect(seek).not.toHaveBeenCalled();
		expect(notices).toEqual([]);

		// The run carries on by hand, and the copy's own line is timed like any
		// other.
		now = 110;
		handle.tapLyricSync?.();
		expect(times(handle)[14]).toBeCloseTo(110 - tapOffsetSeconds, 5);
	});

	// The commonest divergence is a trailing line one copy adds, and there the
	// fill still earns its keep: everything before the difference is dated, and
	// the tapping is handed back exactly at the line the peer cannot vouch for.
	it('fills up to a trailing difference and hands the rest back', async () => {
		const trailingLines = [
			'[Verse 1]', // 1
			'first line', // 2
			'', // 3
			'[Chorus]', // 4
			'hold on tight', // 5
			'we go again', // 6
			'all night long', // 7
			'', // 8
			'[Verse 2]', // 9
			'second line', // 10
			'', // 11
			'[Chorus 2]', // 12
			'hold on tight', // 13
			'we go again', // 14
			'all night long', // 15
			'and never let go' // 16 — this copy's own closing line
		];
		const trailingSong = trailingLines.join('\n');
		let now = 0;
		const { handle, seek, notices } = await mount({
			text: trailingSong,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => now
		});
		await withColumn(handle, 0);
		handle.setLineAnchors?.(timedFirstCopy);
		handle.setSectionLinks?.([{ lines: [4, 12] }]);

		handle.setLyricSync?.(true);
		now = 100;
		handle.tapLyricSync?.();

		// The shared lines take the peer's intervals; the copy's own line does not.
		expect(times(handle)[13]).toBeCloseTo(100 - tapOffsetSeconds, 5);
		expect(times(handle)[14]).toBeCloseTo(102 - tapOffsetSeconds, 5);
		expect(times(handle)[15]).toBeCloseTo(104.5 - tapOffsetSeconds, 5);
		expect(times(handle)[16]).toBeUndefined();
		// The caret and the tape stop on the last line the peer could date, so the
		// next tap belongs to the line the fill refused.
		expect(handle.getSnapshot().selection.head).toBe(trailingSong.lastIndexOf('all night long'));
		expect(seek.mock.calls.at(-1)?.[0]).toBeCloseTo(104.5 - tapOffsetSeconds, 5);
		expect(notices).toEqual([
			'Chorus 2 timed from Chorus — 3 lines. Press a line number to time it by hand instead.'
		]);

		now = 110;
		handle.tapLyricSync?.();
		expect(times(handle)[16]).toBeCloseTo(110 - tapOffsetSeconds, 5);
	});

	// A word-level difference moves no line boundary, so it must not cost the
	// fill: two choruses kept deliberately apart on one word are still the same
	// rhythm, which is all the fill copies.
	it('fills across a difference that stays inside its line', async () => {
		const wordedLines = [...linkedLines];
		wordedLines[14] = 'all night here';
		const wordedSong = wordedLines.join('\n');
		let now = 0;
		const { handle, notices } = await mount({
			text: wordedSong,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => now
		});
		await withColumn(handle, 0);
		handle.setLineAnchors?.(timedFirstCopy);
		handle.setSectionLinks?.([{ lines: [4, 12] }]);

		handle.setLyricSync?.(true);
		now = 100;
		handle.tapLyricSync?.();

		expect(times(handle)[13]).toBeCloseTo(100 - tapOffsetSeconds, 5);
		expect(times(handle)[14]).toBeCloseTo(102 - tapOffsetSeconds, 5);
		expect(times(handle)[15]).toBeCloseTo(104.5 - tapOffsetSeconds, 5);
		expect(notices).toHaveLength(1);
	});

	// A peer this run derived is a rhythm at one remove, and a chain of fills
	// would carry any error of the first one down the whole song — so a peer the
	// user actually tapped outranks a nearer one the run wrote itself. The label
	// in the notice is what says which peer won.
	it('fills a third copy from the tapped peer, not the derived one', async () => {
		const threeLines = [
			'[Verse 1]', // 1
			'first line', // 2
			'', // 3
			'[Chorus]', // 4
			'hold on tight', // 5
			'we go again', // 6
			'', // 7
			'[Chorus 2]', // 8
			'hold on tight', // 9
			'we go again', // 10
			'', // 11
			'[Chorus 3]', // 12
			'hold on tight', // 13
			'we go again' // 14
		];
		const threeSong = threeLines.join('\n');
		let now = 0;
		const { handle, notices } = await mount({
			text: threeSong,
			selection: { anchor: 0, head: 0 },
			mediaTime: () => now
		});
		await withColumn(handle, 0);
		handle.setLineAnchors?.([
			{ line: 2, time: 5 },
			{ line: 5, time: 10 },
			{ line: 6, time: 12 }
		]);
		handle.setSectionLinks?.([{ lines: [4, 8, 12] }]);

		handle.setLyricSync?.(true);
		now = 50;
		handle.tapLyricSync?.();
		expect(notices).toEqual([
			'Chorus 2 timed from Chorus — 2 lines. Press a line number to time it by hand instead.'
		]);

		now = 150;
		handle.tapLyricSync?.();
		// Nearest-first alone would name Chorus 2 here.
		expect(notices[1]).toBe(
			'Chorus 3 timed from Chorus — 2 lines. Press a line number to time it by hand instead.'
		);
		expect(times(handle)[13]).toBeCloseTo(150 - tapOffsetSeconds, 5);
		expect(times(handle)[14]).toBeCloseTo(152 - tapOffsetSeconds, 5);
	});
});
