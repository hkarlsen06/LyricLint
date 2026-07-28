import {
	EditorState,
	MapMode,
	RangeSet,
	RangeValue,
	StateEffect,
	StateField
} from '@codemirror/state';
import type { ChangeDesc, Extension, Range } from '@codemirror/state';
import {
	Decoration,
	EditorView,
	GutterMarker,
	ViewPlugin,
	gutter,
	gutterLineClass,
	lineNumberMarkers
} from '@codemirror/view';
import type { BlockInfo } from '@codemirror/view';
import { isLyricLine } from '$lib/core/parser.js';
import type { Line } from '@codemirror/state';
import type { LineAnchor } from '$lib/core/types.js';

export type { LineAnchor };

/**
 * Whether this line is one of the ones that gets timed.
 *
 * The answer is the parser's, not a rule of the editor's: sync mode taps through
 * these lines and the column draws a cell only for them, so the two disagreeing
 * would offer a stamp control for a line a run refuses to visit.
 */
export function isStampableLine(line: Line): boolean {
	return isLyricLine(line.text);
}

/**
 * The anchor's own value: a time, over the line's text.
 *
 * `MapMode.TrackDel` is the whole reason this is a `RangeValue` and not a plain
 * array — deleting the line an anchor sits on has to delete the anchor, and
 * mapping is what knows that happened. An array of line numbers would quietly
 * point at whatever text slid up into the gap.
 *
 * It spans the line rather than marking its start, and that distinction is
 * load-bearing. A point at `line.from` sits on the *boundary* of the deletion
 * that removes the line, and a boundary is not inside anything — so deleting a
 * line left its anchor behind, sharing the next line with that line's own
 * anchor, and a jump went to whichever of the two came first. An anchor belongs
 * to the line's text, so it covers the line's text and dies with it.
 */
class AnchorValue extends RangeValue {
	override mapMode = MapMode.TrackDel;

	constructor(readonly time: number) {
		super();
	}

	override eq(other: AnchorValue): boolean {
		return other.time === this.time;
	}
}

/** Replace every anchor, for a draft being opened. */
export const setLineAnchorsEffect = StateEffect.define<readonly LineAnchor[]>();

/**
 * Anchor the line containing `pos` to `time`, replacing whatever was there.
 *
 * Every anchor is deliberate — `Ctrl-Alt-M`, the column's own control, or a tap
 * in sync mode — so there is nothing to arbitrate: correcting a wrong time is
 * most of what all three are for. There used to be a second, automatic kind
 * that never overwrote, and the flag telling them apart went when it did.
 */
export const anchorLineEffect = StateEffect.define<{ pos: number; time: number }>();

/** Drop the anchor on the line containing `pos`. */
export const clearLineAnchorEffect = StateEffect.define<{ pos: number }>();

/**
 * Open the nudge pair on the line containing `pos`, or close it with `undefined`.
 *
 * The stamp control on an *anchored* line no longer writes the playhead over its
 * time. A line that already carries one is usually a line whose time is nearly
 * right — a tap landed late, or a run was a beat behind — so re-stamping it from
 * wherever the tape happens to be sitting is almost never the correction wanted.
 * The pencil opens `−` and `+` beside the time instead.
 */
export const setAnchorAdjustEffect = StateEffect.define<number | undefined>();

/**
 * One press of `−` or `+`.
 *
 * A quarter second, which is about the smallest correction a transcriber can
 * actually hear the difference of, and the size a late tap is usually out by. It
 * is why the column shows hundredths: a step nothing on screen answers is a
 * press that reads as broken. Exact in binary, so a run of presses does not
 * drift.
 */
export const anchorNudgeSeconds = 0.25;

/**
 * Tell the column where the audio is, or `undefined` when nothing is attached.
 *
 * This moves nothing. It marks one cell, and that is the entire extent of what
 * playback is allowed to do to the document — outside sync mode, which is a
 * mode the user deliberately entered and is not typing in.
 */
export const setPlayheadEffect = StateEffect.define<number | undefined>();

/** Whether the document follows the playhead. On until the shell says otherwise. */
export const setFollowPlayheadEffect = StateEffect.define<boolean>();

export const followPlayheadField = StateField.define<boolean>({
	create: () => true,
	update(value, transaction) {
		let next = value;
		for (const effect of transaction.effects) {
			if (effect.is(setFollowPlayheadEffect)) next = effect.value;
		}
		return next;
	}
});

interface LineAnchorState {
	anchors: RangeSet<AnchorValue>;
	/**
	 * Where the audio is, and — because the shell pushes `undefined` whenever
	 * nothing is attached — whether there is any audio at all. The timestamp
	 * column draws off exactly this: a workbench with no song has no times to
	 * show and no line worth stamping, so the whole column stays out of the
	 * editor rather than standing there as an empty rail.
	 */
	playhead: number | undefined;
	/** Start position of the anchor the playhead is currently inside. */
	currentFrom: number | undefined;
	/**
	 * A position on the one line showing its nudge pair, or `undefined`.
	 *
	 * One at a time, like every other transient surface in the workbench: the
	 * pair is a question about one time, and two of them open at once would be
	 * two questions with one answer between them.
	 */
	adjusting: number | undefined;
}

/**
 * `m:ss`, duplicated from the media player on purpose.
 *
 * The editor may not import from `$lib/ui` — it is the rule that keeps the
 * shell replaceable — and four lines of arithmetic is a cheaper price than the
 * dependency.
 */
export function formatAnchorTime(seconds: number): string {
	const whole = Math.max(0, Math.floor(seconds));
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * `m:ss.cc`, for a cell whose nudge pair is open and nothing else.
 *
 * The anchors are not whole seconds and never were — a sync tap is written 120ms
 * early, and the pair moves a quarter second at a time — so `m:ss` alone answers
 * three presses in every four with no visible change. At rest it is the right
 * readout and this one is noise, which is why the two are separate functions
 * rather than a flag. The announcements stay whole for the same reason:
 * hundredths read aloud say nothing anyone asked.
 */
export function formatAnchorTimePrecise(seconds: number): string {
	// Rounded to hundredths first and split afterwards, so a time a hair under a
	// second cannot round its fraction up to `00` while the seconds still read low.
	const hundredths = Math.round(Math.max(0, seconds) * 100);
	return `${formatAnchorTime(Math.floor(hundredths / 100))}.${String(hundredths % 100).padStart(2, '0')}`;
}

/**
 * One cell of the timestamp column.
 *
 * Everything in it is a pointer affordance and only that, because CodeMirror
 * puts `aria-hidden="true"` on the whole `.cm-gutters` container and a descendant
 * cannot opt back in — `aria-hidden="false"` under a hidden ancestor does
 * nothing. So nothing here carries an accessible name: a name nothing can read is
 * a claim to accessibility rather than the thing itself, and `tabIndex = -1`
 * follows from the same fact, since a focusable control inside an `aria-hidden`
 * subtree is a genuine violation and a hundred anchored lines would otherwise be
 * a hundred tab stops before the first word.
 *
 * The equivalent path for everyone else is `Ctrl-Alt-Enter` (play from this
 * line), `Ctrl-Alt-M` (anchor it), and sync mode, all of which announce what they
 * did and need no aiming.
 *
 * The alternative was a line-decoration widget at the end of each line, which
 * *would* be in the accessible tree. It is disqualified because a widget in the
 * content flow participates in selection and copy, and clean lyrics on the
 * clipboard are this application's entire output. A timestamp in somebody's paste
 * is the worst bug it could ship.
 */
class TimeGutterMarker extends GutterMarker {
	constructor(
		readonly time: number | undefined,
		readonly current: boolean,
		readonly adjusting: boolean
	) {
		super();
	}

	override eq(other: TimeGutterMarker): boolean {
		return (
			other.time === this.time &&
			other.current === this.current &&
			other.adjusting === this.adjusting
		);
	}

	override toDOM(): HTMLElement {
		const cell = document.createElement('div');
		cell.className = this.adjusting ? 'll-time-cell ll-time-cell--adjusting' : 'll-time-cell';

		// One at each end of the number, lifted off the rail: `−` hangs outside the
		// cell entirely and `+` follows the last digit. Set as two glyphs after the
		// time they change, they read as a suffix of it — `0:12.88 −+` — which is
		// three things in a row where there is one control, one value and one
		// control.
		if (this.adjusting) cell.append(nudgeButton(-1));

		// The time is the play control. A visible timestamp is the most obvious
		// thing in the world to press to hear that moment, so it needs no icon of
		// its own — and a separate play glyph would be a second control for the
		// gesture the pointer is already on.
		const time = document.createElement('button');
		time.type = 'button';
		time.tabIndex = -1;
		time.className = 'll-time-value';
		if (this.time === undefined) {
			// A dash, not a blank. A column of empty cells is an invisible column —
			// there is nothing on screen to say the rail exists, what it holds, or
			// that a line can be timed at all, so the feature reads as absent until
			// the pointer happens to cross the one cell that answers. A dash is the
			// quietest mark that says "a value goes here and is not set yet", which is
			// exactly true, and it costs one muted glyph per line against a column
			// that is a full timestamp per line the moment the song is synced.
			time.textContent = '–';
			time.classList.add('ll-time-value--empty');
			time.disabled = true;
		} else {
			if (this.current) time.classList.add('ll-time-value--current');
			// Hundredths only while the pair is open. A column of `m:ss.cc` is a
			// column of two digits nobody is reading — the resting job of this rail is
			// to say where a line sits in the song, which whole seconds answer — but
			// they are exactly what a quarter-second step needs on screen, and a press
			// nothing answers reads as broken. So the precision arrives with the
			// controls that spend it and leaves with them.
			time.textContent = this.adjusting
				? formatAnchorTimePrecise(this.time)
				: formatAnchorTime(this.time);
			time.title = `Play from ${formatAnchorTime(this.time)}`;
			time.dataset.anchorSeek = String(this.time);
		}
		cell.append(time);

		// `+` stays in flow, so it hugs the last digit however wide the number is,
		// and the cell packs from the left while the pair is open rather than
		// spreading its children to both ends. `−` is out of flow, so neither of
		// them moves the number: the whole open cell is the closed one plus two
		// things drawn beside it.
		if (this.adjusting) {
			cell.append(nudgeButton(1));
			return cell;
		}

		// One control for the write, whichever write it is: on an empty line it
		// stamps the playhead, on a timed one it opens the pair above. It carries no
		// time in its tooltip on purpose — the playhead moves several times a second
		// and a title that named it would rebuild this column on every tick.
		const stamp = document.createElement('button');
		stamp.type = 'button';
		stamp.tabIndex = -1;
		stamp.className = 'll-time-stamp';
		stamp.title = this.time === undefined ? 'Anchor this line' : 'Adjust this line’s time';
		stamp.dataset.anchorStamp = 'true';
		stamp.append(stampGlyph(this.time !== undefined));
		cell.append(stamp);

		return cell;
	}
}

/**
 * Marks an anchored line's *number* as pressable.
 *
 * It carries `elementClass` and deliberately no `toDOM`: `lineNumbers` drops its
 * own number marker for any line whose markers include one that draws
 * (`others.some(m => m.toDOM)`), so a marker with a body here would replace the
 * line number rather than decorate it.
 *
 * It rides the `lineNumberMarkers` facet rather than `gutterLineClass`, because
 * the latter classes the matching element in *every* gutter — the timestamp cell
 * and the performer bar included — for a fact that is only about this one.
 */
const seekableLineMarker = new (class extends GutterMarker {
	override elementClass = 'll-line-seek';
})();

/**
 * The line the audio is inside, washed end to end.
 *
 * Tinting the timestamp alone asked the eye to follow four muted characters at
 * one edge of the document while reading the words at the other. The lyric gets
 * a band and its rails go yellow with it, and that is the one thing playback is
 * allowed to draw on the document — it still moves nothing.
 *
 * This is the case `gutterLineClass` is for and `seekableLineMarker` is not: the
 * row includes its line number and its timestamp cell, so classing the matching
 * element in *every* gutter is exactly the fact being stated.
 */
const currentLine = Decoration.line({ class: 'll-current-line' });

const currentLineGutterMarker = new (class extends GutterMarker {
	override elementClass = 'll-current-line-gutter';
})();

function currentLineStart(state: EditorState): number | undefined {
	const { currentFrom } = state.field(lineAnchorField);
	return currentFrom === undefined ? undefined : state.doc.lineAt(currentFrom).from;
}

/** The start of the line whose nudge pair is open, if one is. */
function adjustingLineStart(state: EditorState): number | undefined {
	const { adjusting } = state.field(lineAnchorField);
	if (adjusting === undefined) return undefined;
	return state.doc.lineAt(Math.min(adjusting, state.doc.length)).from;
}

/**
 * Play from a line by pressing its number.
 *
 * The line number is a wider, always-drawn target than a timestamp that is four
 * characters of muted text, and it is on the side of the document the eye is
 * already using to find a line. It is safe to make it seek for the same reason
 * the timestamp is: a gutter sits outside `.cm-content`, so a press there never
 * places a caret, and the rule that keeps seeking out of the text — clicking a
 * line is how a caret is placed, and is the most frequent gesture in the editor —
 * does not reach here.
 *
 * It answers only on a line that has a time. Returning false leaves the press
 * unclaimed, and only anchored lines are given the pointer cursor, because an
 * affordance that works on some rows and silently not on others is worse than no
 * affordance at all.
 */
export function anchorSeekOnLineNumber(
	options: LineAnchorOptions
): (view: EditorView, line: BlockInfo, event: Event) => boolean {
	return (view, line) => {
		const time = anchorTimeAt(view.state, line.from);
		if (time === undefined) return false;
		options.onSeek(time);
		return true;
	};
}

/**
 * One half of the nudge pair, as a character rather than a drawn glyph.
 *
 * `−` and `+` are one `ch` each in the gutter's mono font, which is what keeps
 * the open cell inside the width every row already reserves.
 */
function nudgeButton(direction: 1 | -1): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.tabIndex = -1;
	button.className = `ll-time-nudge ll-time-nudge--${direction < 0 ? 'back' : 'on'}`;
	button.textContent = direction < 0 ? '−' : '+';
	button.title = `${anchorNudgeSeconds}s ${direction < 0 ? 'earlier' : 'later'}`;
	button.dataset.anchorNudge = String(direction);
	return button;
}

/** A pin for an empty line, a pencil for one already carrying a time. */
function stampGlyph(anchored: boolean): SVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('width', '13');
	svg.setAttribute('height', '13');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '1.5');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('d', anchored ? 'm10 2.5 3.5 3.5-8 8H2v-3.5Z' : 'M8 3.5v9M3.5 8h9');
	svg.append(path);
	return svg;
}

function rangesForLines(
	state: EditorState,
	times: ReadonlyMap<number, number>
): RangeSet<AnchorValue> {
	const ranges: Range<AnchorValue>[] = [];
	for (const lineNumber of [...times.keys()].sort((left, right) => left - right)) {
		const line = state.doc.line(lineNumber);
		ranges.push(new AnchorValue(times.get(lineNumber) as number).range(line.from, line.to));
	}
	return RangeSet.of(ranges, true);
}

function anchorsFromLines(
	state: EditorState,
	anchors: readonly LineAnchor[]
): RangeSet<AnchorValue> {
	const times = new Map<number, number>();
	for (const anchor of [...anchors].sort((left, right) => left.line - right.line)) {
		if (
			!Number.isInteger(anchor.line) ||
			anchor.line < 1 ||
			anchor.line > state.doc.lines ||
			!Number.isFinite(anchor.time) ||
			anchor.time < 0 ||
			times.has(anchor.line)
		) {
			continue;
		}
		times.set(anchor.line, anchor.time);
	}
	return rangesForLines(state, times);
}

/**
 * Drop the anchors whose line was wholly erased, before anything is mapped.
 *
 * Mapping cannot answer this on its own, and the reason is worth keeping: after
 * a line is deleted its anchor and the following line's anchor both land on the
 * same line, which is *also* exactly what happens when backspace merges two
 * lines. The two are indistinguishable from the result and want opposite
 * answers — the deleted line's anchor should go, the merged line's earlier
 * anchor should stay — so only the change set can separate them.
 *
 * `touchesRange` is the obvious tool and the wrong one. Its `'cover'` verdict is
 * strict on both sides (`pos < from && end > to`), and deleting a line produces
 * a change that starts *at* the anchor's own `from`, so it answers `true` like
 * any ordinary edit. What actually distinguishes the two is whether the line's
 * span survived: map its start forward and its end backward, and if they meet,
 * every character the anchor described is gone.
 *
 * The `to > from` guard is for an anchor on an empty line, whose span is a point
 * and would otherwise always look collapsed. Those are left to `MapMode.TrackDel`.
 */
function dropErasedAnchors(
	anchors: RangeSet<AnchorValue>,
	changes: ChangeDesc
): RangeSet<AnchorValue> {
	const survivors: Range<AnchorValue>[] = [];
	const cursor = anchors.iter();
	while (cursor.value) {
		const erased =
			cursor.to > cursor.from && changes.mapPos(cursor.from, 1) >= changes.mapPos(cursor.to, -1);
		if (!erased) survivors.push(cursor.value.range(cursor.from, cursor.to));
		cursor.next();
	}
	return RangeSet.of(survivors, true);
}

/**
 * Re-seat every anchor on the line it now covers, one anchor per line.
 *
 * Mapping keeps an anchor with its text but not necessarily flush with the
 * line's bounds, and it cannot prevent two anchors arriving on one line — press
 * backspace at the start of a line and two of them merge along with the text.
 * Where that happens the earlier time wins, because the merged line begins with
 * the earlier line's words and that is the moment its audio starts.
 */
function normalize(state: EditorState, anchors: RangeSet<AnchorValue>): RangeSet<AnchorValue> {
	const times = new Map<number, number>();
	const cursor = anchors.iter();
	while (cursor.value) {
		const lineNumber = state.doc.lineAt(cursor.from).number;
		const existing = times.get(lineNumber);
		if (existing === undefined || cursor.value.time < existing) {
			times.set(lineNumber, cursor.value.time);
		}
		cursor.next();
	}
	return rangesForLines(state, times);
}

/** The anchor whose line contains `pos`, if there is one. */
function anchorOnLine(
	state: EditorState,
	anchors: RangeSet<AnchorValue>,
	pos: number
): { from: number; time: number } | undefined {
	const line = state.doc.lineAt(pos);
	let found: { from: number; time: number } | undefined;
	anchors.between(line.from, line.to, (from, _to, value) => {
		found = { from, time: value.time };
		return false;
	});
	return found;
}

function withAnchor(
	state: EditorState,
	anchors: RangeSet<AnchorValue>,
	pos: number,
	time: number
): RangeSet<AnchorValue> {
	const line = state.doc.lineAt(pos);
	const existing = anchorOnLine(state, anchors, pos);
	return anchors.update({
		filter: (from) => from !== (existing?.from ?? -1),
		add: [new AnchorValue(time).range(line.from, line.to)],
		sort: true
	});
}

/**
 * Which anchor the playhead is inside.
 *
 * An anchor owns the audio from its own time until the next anchor's, so this
 * is the last anchor at or before the playhead — not the nearest one, which
 * would jump the marker forward halfway through a line.
 */
function currentAnchorFrom(
	anchors: RangeSet<AnchorValue>,
	playhead: number | undefined
): number | undefined {
	if (playhead === undefined) return undefined;
	let best: { from: number; time: number } | undefined;
	const cursor = anchors.iter();
	while (cursor.value) {
		if (cursor.value.time <= playhead && (!best || cursor.value.time >= best.time)) {
			best = { from: cursor.from, time: cursor.value.time };
		}
		cursor.next();
	}
	return best?.from;
}

function derive(
	anchors: RangeSet<AnchorValue>,
	playhead: number | undefined,
	adjusting: number | undefined
): LineAnchorState {
	return { anchors, playhead, currentFrom: currentAnchorFrom(anchors, playhead), adjusting };
}

export const lineAnchorField = StateField.define<LineAnchorState>({
	create: () => derive(RangeSet.empty, undefined, undefined),
	update(value, transaction) {
		let anchors = transaction.docChanged
			? normalize(
					transaction.state,
					dropErasedAnchors(value.anchors, transaction.changes).map(transaction.changes)
				)
			: value.anchors;
		let playhead = value.playhead;
		// The open pair belongs to a line, so it travels with the text like an
		// anchor does — and it closes with the draft being read back.
		let adjusting =
			value.adjusting !== undefined && transaction.docChanged
				? transaction.changes.mapPos(value.adjusting)
				: value.adjusting;

		for (const effect of transaction.effects) {
			if (effect.is(setLineAnchorsEffect)) {
				anchors = anchorsFromLines(transaction.state, effect.value);
				adjusting = undefined;
			} else if (effect.is(setAnchorAdjustEffect)) {
				adjusting = effect.value;
			} else if (effect.is(anchorLineEffect)) {
				anchors = withAnchor(
					transaction.state,
					anchors,
					Math.min(effect.value.pos, transaction.state.doc.length),
					effect.value.time
				);
			} else if (effect.is(clearLineAnchorEffect)) {
				const existing = anchorOnLine(
					transaction.state,
					anchors,
					Math.min(effect.value.pos, transaction.state.doc.length)
				);
				if (existing) {
					anchors = anchors.update({ filter: (from) => from !== existing.from });
					adjusting = undefined;
				}
			} else if (effect.is(setPlayheadEffect)) {
				playhead = effect.value;
			}
		}

		if (anchors === value.anchors && playhead === value.playhead && adjusting === value.adjusting) {
			return value;
		}
		return derive(anchors, playhead, adjusting);
	}
});

/** Whether there is audio behind this document at all. */
export function hasAudio(state: EditorState): boolean {
	return state.field(lineAnchorField, false)?.playhead !== undefined;
}

/** Every anchor, as line numbers, ready to be written down. */
export function lineAnchorsFor(state: EditorState): LineAnchor[] {
	const field = state.field(lineAnchorField, false);
	if (!field) return [];
	const anchors: LineAnchor[] = [];
	const cursor = field.anchors.iter();
	while (cursor.value) {
		anchors.push({ line: state.doc.lineAt(cursor.from).number, time: cursor.value.time });
		cursor.next();
	}
	return anchors;
}

/** The time anchored to the line containing `pos`, if any. */
export function anchorTimeAt(state: EditorState, pos: number): number | undefined {
	const field = state.field(lineAnchorField, false);
	if (!field) return undefined;
	return anchorOnLine(state, field.anchors, pos)?.time;
}

/** Whether the line containing `pos` already carries an anchor. */
export function hasAnchorAt(state: EditorState, pos: number): boolean {
	return anchorTimeAt(state, pos) !== undefined;
}

/**
 * Where the line being timed sits in the viewport once the document is moving.
 *
 * A third from the top: far enough down that the lines already timed stay
 * readable above it, and high enough that the two thirds below show what is
 * coming — which is what the user is reading ahead into while they wait for the
 * next line to start.
 */
export const readingLineFraction = 1 / 3;

/**
 * Park the line being timed at the reading line.
 *
 * Every advance targets the third, wherever the run started. It used to leave the
 * caret alone anywhere between the top and the reading line, so a run resumed
 * mid-song never came down to it — the caret just sat wherever the document
 * happened to be scrolled. Near the top of the document the browser clamps the
 * negative target away at zero, which is the behaviour that band was really
 * providing.
 *
 * `scrollTo` rather than `scrollIntoView`, because CodeMirror's own scroll is a
 * nearest-edge nudge with no notion of a fixed reading position. Smooth, because
 * the document moving a line at a time under someone reading along is easier to
 * follow than a jump — a new `scrollTo` supersedes an in-flight one, so taps
 * faster than the animation just retarget it, and each tap recomputes from live
 * positions so any mid-animation drift corrects itself on the next one.
 */
export function holdReadingLine(view: EditorView, pos: number): void {
	const coords = view.coordsAtPos(pos);
	if (!coords) return;
	const scroller = view.scrollDOM;
	const box = scroller.getBoundingClientRect();
	const to = scroller.scrollTop + (coords.top - box.top) - box.height * readingLineFraction;
	tweenScroll(scroller, to);
}

/** Roughly one line's worth of travel, eased. */
const readingScrollMs = 380;

/** `cubic-bezier(0.65, 0, 0.35, 1)` — the standard ease-in-out, solved directly. */
function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

let running: { scroller: Element; frame: number } | undefined;

/**
 * Scroll on an eased curve instead of `behavior: 'smooth'`.
 *
 * The native smooth scroll has no easing control and restarts abruptly when a
 * new target arrives, which is what made following the playhead read as a series
 * of jerks rather than one movement. This starts from wherever the scroller is,
 * so a retarget mid-flight continues from the current position.
 */
function tweenScroll(scroller: HTMLElement, to: number): void {
	if (running) cancelAnimationFrame(running.frame);
	running = undefined;

	const from = scroller.scrollTop;
	const distance = to - from;
	if (prefersReducedMotion() || Math.abs(distance) < 1) {
		scroller.scrollTop = to;
		return;
	}

	const start = performance.now();
	const step = (now: number) => {
		const progress = Math.min(1, (now - start) / readingScrollMs);
		scroller.scrollTop = from + distance * easeInOutCubic(progress);
		if (progress < 1) running = { scroller, frame: requestAnimationFrame(step) };
		else running = undefined;
	};
	running = { scroller, frame: requestAnimationFrame(step) };
}

function prefersReducedMotion(): boolean {
	return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Close the nudge pair on a press anywhere else.
 *
 * The same rule every transient surface in the workbench follows, and the same
 * two decisions behind `dismissOnOutside`: `pointerdown` in the capture phase,
 * because waiting for `click` leaves the pair up through the press and the
 * bubble phase never arrives for a press CodeMirror cancels; and nothing here
 * moves focus, because the press has already said where the user is going.
 *
 * It listens on the document rather than the editor, since most of what is
 * "anywhere else" — the panel, the toolbar, the transport — is outside it. The
 * cell's own two controls are exempt: the pair has to survive being pressed, and
 * the pencil is its own way back out.
 */
const dismissAdjustOnOutside = ViewPlugin.fromClass(
	class {
		constructor(private readonly view: EditorView) {
			document.addEventListener('pointerdown', this.onPointerDown, true);
		}

		private readonly onPointerDown = (event: PointerEvent): void => {
			if (this.view.state.field(lineAnchorField).adjusting === undefined) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest('[data-anchor-nudge],[data-anchor-stamp]')) return;
			this.view.dispatch({ effects: setAnchorAdjustEffect.of(undefined) });
		};

		destroy(): void {
			document.removeEventListener('pointerdown', this.onPointerDown, true);
		}
	}
);

export interface LineAnchorOptions {
	/**
	 * Seek the audio. Called only from a press on a timestamp — never from a caret
	 * move, a click in the text, or a selection.
	 */
	onSeek(time: number): void;
	/**
	 * The moment the audio is at, or undefined when nothing is attached.
	 *
	 * Read from a press on the column's stamp control, so it must never throw.
	 */
	currentTime(): number | undefined;
	/**
	 * The set of anchors changed, so the shell can write them down.
	 *
	 * No anchor is ever a side effect of typing, and none of the three ways one
	 * is set changes any text: a sync tap writes an anchor and moves the caret,
	 * and `Ctrl-Alt-M` and this column's own control move nothing. A shell that
	 * saved only on a document change would therefore lose every anchor there is.
	 */
	onAnchorsChanged?(): void;
}

/**
 * The timestamp column, on the far side of the text.
 *
 * It is the whole of what line anchoring draws. There was a dot in a left gutter
 * before this, and it lost on both counts: the left side already carries line
 * numbers and the performer voice bars, so a third lane crowded it, and a dot
 * says only *that* a line is anchored — never to when. A column of times says
 * both, and it is where the eye already goes to check timings.
 *
 * It draws whenever audio is attached, anchors or not, because an empty cell that
 * offers a control on hover is how anyone discovers that lines can be anchored at
 * all. With no audio there is nothing to anchor to, and the column goes entirely.
 *
 * Nothing here scrolls, focuses, or moves the selection. A press on a timestamp
 * moves the audio and only the audio: clicking a line is how a caret is placed
 * and is the most frequent gesture in the editor, so seeking lives in the gutter
 * where no ordinary click can reach it.
 */
export function lineAnchors(options: LineAnchorOptions): Extension {
	return [
		lineAnchorField,
		dismissAdjustOnOutside,
		// A class on the editor rather than a reconfigured gutter: attachment flips
		// rarely and a compartment swap would rebuild the gutter's DOM, while a
		// class costs one attribute and lets CSS collapse the column.
		EditorView.editorAttributes.of((view) =>
			hasAudio(view.state) ? { class: 'll-has-audio' } : null
		),
		// Which line numbers are pressable. Gated on there being audio at all, so
		// the cursor never promises a seek a draft with no song cannot perform.
		lineNumberMarkers.compute([lineAnchorField], (state) => {
			const field = state.field(lineAnchorField);
			if (field.playhead === undefined) return RangeSet.empty;
			const marks: Range<GutterMarker>[] = [];
			const cursor = field.anchors.iter();
			while (cursor.value) {
				marks.push(seekableLineMarker.range(cursor.from));
				cursor.next();
			}
			return RangeSet.of(marks, true);
		}),
		EditorView.decorations.compute([lineAnchorField], (state) => {
			const from = currentLineStart(state);
			return from === undefined ? Decoration.none : Decoration.set(currentLine.range(from));
		}),
		gutterLineClass.compute([lineAnchorField], (state) => {
			const from = currentLineStart(state);
			return from === undefined ? RangeSet.empty : RangeSet.of(currentLineGutterMarker.range(from));
		}),
		// The playhead moving onto another anchored line pulls the document with it,
		// parked at the same reading line sync mode uses. This is the one thing
		// playback is allowed to do to the document outside sync mode, and it is
		// keyed on `currentFrom` — the marked line — so a tick that stays inside one
		// line costs nothing.
		followPlayheadField,
		EditorView.updateListener.of((update) => {
			if (!update.state.field(followPlayheadField)) return;
			const before = update.startState.field(lineAnchorField).currentFrom;
			const after = update.state.field(lineAnchorField).currentFrom;
			if (after !== undefined && after !== before) holdReadingLine(update.view, after);
		}),
		EditorView.updateListener.of((update) => {
			// A restore is the draft being read back, not a change worth writing. Left
			// in, opening a draft would schedule a save of what had just been loaded.
			const restoring = update.transactions.some((transaction) =>
				transaction.effects.some((effect) => effect.is(setLineAnchorsEffect))
			);
			if (restoring) return;
			if (
				update.startState.field(lineAnchorField).anchors !==
				update.state.field(lineAnchorField).anchors
			) {
				options.onAnchorsChanged?.();
			}
		}),
		gutter({
			class: 'll-time-gutter',
			side: 'after',
			// `lineMarker` rather than a marker `RangeSet`, because every line gets a
			// cell — an unanchored one is an empty slot holding the column's width
			// and offering the control that fills it.
			lineMarker: (view, line) => {
				const field = view.state.field(lineAnchorField);
				if (field.playhead === undefined) return null;
				const found = anchorOnLine(view.state, field.anchors, line.from);
				// A line that will never be timed is drawn nothing: no dash, and no
				// control to time it with. The dash means "a value goes here and is not
				// set yet", which is false on a blank line and on a section header — and
				// it cost a real bug, because an untimed lyric line wore the same mark as
				// the structure around it and read as finished work. A cell still draws
				// where a time exists, since `Ctrl-Alt-M` may put one anywhere and a
				// deliberate anchor must not vanish.
				if (found === undefined && !isStampableLine(view.state.doc.lineAt(line.from))) {
					return null;
				}
				return new TimeGutterMarker(
					found?.time,
					found?.from === field.currentFrom,
					found !== undefined && adjustingLineStart(view.state) === line.from
				);
			},
			// The playhead arrives several times a second and almost never crosses an
			// anchor. Keying the rebuild on `currentFrom` rather than on the time is
			// the difference between a rebuild per tick and a rebuild per line.
			lineMarkerChange: (update) => {
				const before = update.startState.field(lineAnchorField);
				const after = update.state.field(lineAnchorField);
				return (
					before.anchors !== after.anchors ||
					before.currentFrom !== after.currentFrom ||
					before.adjusting !== after.adjusting ||
					(before.playhead === undefined) !== (after.playhead === undefined)
				);
			},
			// No `initialSpacer`. The column's width is a constant in the theme, so a
			// spacer reserves nothing CSS has not already reserved — and it is a real
			// marker, drawn with its own controls, in the gutter of a document that
			// may have no anchors at all.
			domEventHandlers: {
				mousedown: (view, line, event) => {
					const target = event.target as HTMLElement | null;

					const seek = target?.closest<HTMLElement>('[data-anchor-seek]');
					if (seek) {
						// The press must not reach CodeMirror, which would otherwise move
						// the caret to this line for a gesture that was about the audio.
						event.preventDefault();
						options.onSeek(Number(seek.dataset.anchorSeek));
						return true;
					}

					const nudge = target?.closest<HTMLElement>('[data-anchor-nudge]');
					if (nudge) {
						event.preventDefault();
						const anchored = anchorTimeAt(view.state, line.from);
						if (anchored === undefined) return true;
						view.dispatch({
							effects: anchorLineEffect.of({
								pos: line.from,
								time: Math.max(0, anchored + Number(nudge.dataset.anchorNudge) * anchorNudgeSeconds)
							})
						});
						return true;
					}

					if (!target?.closest('[data-anchor-stamp]')) return false;

					// A timed line's pencil opens the pair rather than writing anything,
					// and pressing it again is the way back out — the same press that
					// asked the question answers it.
					if (hasAnchorAt(view.state, line.from)) {
						event.preventDefault();
						const open = adjustingLineStart(view.state) === line.from;
						view.dispatch({ effects: setAnchorAdjustEffect.of(open ? undefined : line.from) });
						return true;
					}

					const time = options.currentTime();
					if (time === undefined || !Number.isFinite(time)) return false;
					event.preventDefault();
					// This is the pointer's `Ctrl-Alt-M`, for a line that has no time yet.
					view.dispatch({ effects: anchorLineEffect.of({ pos: line.from, time }) });
					return true;
				}
			}
		})
	];
}

export const lineAnchorTheme = EditorView.baseTheme({
	// Collapsed until there is a song. `display: none` rather than a zero width,
	// so the column contributes nothing to the content's measure either.
	'.cm-editor:not(.ll-has-audio) .ll-time-gutter': {
		display: 'none'
	},
	// CodeMirror clips every gutter column (`.cm-gutter { overflow: hidden }`),
	// which cut the `−` hanging off the start of the number down to a sliver. This
	// one column may spill: everything in it is ours, the only thing that ever
	// leaves it is a control that lives for the length of one correction, and it
	// spills inwards over the text rather than outwards past the scroller.
	'.ll-time-gutter': {
		overflow: 'visible'
	},
	'.ll-time-gutter .cm-gutterElement': {
		display: 'flex',
		// The width every row reserves, in `ch` against the gutter's own mono font,
		// and it is the *widest* state written out rather than a number that happens
		// to fit: seven for `m:ss.cc`, the gap, and two for the nudge pair. The stamp
		// glyph is narrower than the pair, so it fits the same slot. It is the same on
		// an empty row as on an anchored one, and the same open as closed, so neither
		// anchoring a song nor correcting a time moves a wrap point in the document.
		// It is a `min-width` on a `border-box` element, so it has to cover the
		// element's own inline padding as well — reserving only the content leaves
		// the row's contents governing the width, which is how the number slid
		// sideways once already: `+` is a shade wider than the glyph it replaces,
		// and with no slack the gutter grew by exactly that.
		minWidth: 'calc(9ch + var(--space-5))',
		padding: 'var(--space-0-5) var(--space-2) 0',
		gap: 'var(--space-1)',
		alignItems: 'center',
		justifyContent: 'flex-end'
	},
	'.ll-time-value': {
		padding: '0',
		border: 'none',
		background: 'transparent',
		color: 'var(--color-text-muted)',
		font: 'inherit',
		fontVariantNumeric: 'tabular-nums',
		cursor: 'pointer'
	},
	'.ll-time-value:disabled': {
		cursor: 'default'
	},
	// The placeholder is a step quieter than a real time, so a synced document
	// reads as times with gaps rather than as two kinds of mark competing.
	'.ll-time-value--empty': {
		color: 'var(--color-text-disabled)'
	},
	'.ll-time-value:hover:not(:disabled)': {
		color: 'var(--color-text)'
	},
	// Where the audio is. Yellow rather than the accent, because the accent is the
	// caret's own tint and the two are on screen together — a blue wash under a
	// blue-washed active line says one thing twice and neither clearly.
	'.ll-time-value--current': {
		color: 'var(--color-playhead)'
	},
	// The wash is the text's alone. A gutter is a rail of marks a few characters
	// wide, and a band behind one is mostly empty tint at the edge of the row —
	// so the number and the time take the color themselves and the band stops at
	// the content's edge.
	'.cm-line.ll-current-line': {
		backgroundColor: 'var(--color-playhead-soft)'
	},
	// Written two classes deep on purpose: `.cm-activeLineGutter` sets the text
	// color at one, and `StyleModule` does not promise this theme comes out after
	// that one, so a tie on specificity would be a coin toss.
	'.cm-gutterElement.ll-current-line-gutter': {
		color: 'var(--color-playhead)'
	},
	// Hidden rather than transparent, and `visibility` rather than `opacity`:
	// opacity is never a state carrier here, and `visibility: hidden` keeps the
	// slot's width so revealing the control moves nothing.
	'.ll-time-stamp': {
		display: 'flex',
		visibility: 'hidden',
		padding: '0',
		border: 'none',
		background: 'transparent',
		color: 'var(--color-text-muted)',
		cursor: 'pointer'
	},
	// Three ways it shows, and the first is the one that makes it findable: the
	// caret's own line always offers it. Hover alone meant the control existed only
	// where the pointer happened to already be, which is nowhere until you know to
	// look — a control discovered by hovering a blank column is a control nobody
	// discovers. `highlightActiveLineGutter` is what puts the class here.
	'.cm-activeLineGutter .ll-time-stamp': {
		visibility: 'visible'
	},
	'.ll-time-cell:hover .ll-time-stamp': {
		visibility: 'visible'
	},
	'.ll-time-stamp:hover': {
		color: 'var(--color-text)'
	},
	// Packed from the left while the pair is open, so `+` lands against the last
	// digit instead of being spread to the far side of the reserved slot.
	'.ll-time-cell--adjusting': {
		justifyContent: 'flex-start'
	},
	// Each one is a small lifted surface rather than a glyph in the rail: they are
	// on screen for as long as one correction takes, over a column of quiet text
	// that they must not read as part of. Border, fill and shadow are what say
	// "pressable and temporary" — the same three the workbench's other popovers
	// use, at the size the gutter has room for.
	'.ll-time-nudge': {
		// One `ch` of glyph, stated rather than left to the font: `−` is not in
		// every mono face and a fallback one is wider, which would push `+` past the
		// slot it fits into and slide the whole column sideways.
		width: '1ch',
		padding: 'var(--space-0-5)',
		border: 'var(--border-width) solid var(--color-border)',
		borderRadius: 'var(--radius-xs)',
		boxShadow: 'var(--shadow-popover)',
		background: 'var(--color-surface)',
		boxSizing: 'content-box',
		color: 'var(--color-text-muted)',
		font: 'inherit',
		lineHeight: '1',
		textAlign: 'center',
		cursor: 'pointer'
	},
	// `−` hangs off the start of the number, outside the cell and therefore out of
	// flow: in flow it would push the number right by its own width, which is the
	// one thing this cell is arranged never to do. `+` needs no such treatment —
	// it follows the last digit, where the reserved slot already has room.
	'.ll-time-nudge--back': {
		position: 'absolute',
		top: '50%',
		right: 'calc(100% + var(--space-1))',
		transform: 'translateY(-50%)'
	},
	'.ll-time-nudge:hover': {
		color: 'var(--color-text)',
		borderColor: 'var(--color-border-strong)'
	},
	// The gutter's own active-line wash is turned off: the row is already marked
	// in the content by `.cm-activeLine`, and a second band starting at the text's
	// edge would draw the row as two pieces.
	'.cm-activeLineGutter': {
		backgroundColor: 'transparent'
	},
	// Only the line numbers that will actually play something. An untimed line is
	// left exactly as it was, so the cursor is the whole of the distinction.
	'.cm-lineNumbers .ll-line-seek': {
		cursor: 'pointer'
	},
	'.cm-lineNumbers .ll-line-seek:hover': {
		color: 'var(--color-text)'
	},
	'.ll-time-cell': {
		display: 'flex',
		// The containing block for the `−` hanging off its start.
		position: 'relative',
		width: '100%',
		gap: 'var(--space-1)',
		alignItems: 'center',
		justifyContent: 'space-between'
	}
});
