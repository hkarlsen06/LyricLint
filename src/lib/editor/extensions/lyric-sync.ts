import { EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import type { Extension, Line } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { Section } from '$lib/core/types.js';
import {
	anchorLineEffect,
	anchorTimeAt,
	clearLineAnchorEffect,
	formatAnchorTime,
	holdReadingLine,
	isStampableLine,
	setPlayheadEffect,
	suppressPlayheadFollow
} from './line-anchors.js';
import { parsedDocumentForState } from './editor-state.js';
import { linePairingLimits, linkedPeerHeaders } from './section-links.js';

/**
 * Timing a whole lyric by tapping along with the song.
 *
 * Automatic stamping only ever anchors lines typed *while* the audio runs, so a
 * draft pasted in from somewhere else has nothing — which is most drafts. This is
 * the way to time one: press play, tap a key at the start of each line, and the
 * caret walks down the document ahead of you.
 *
 * It is a mode, and that is deliberate. The whole value is one key hit in rhythm
 * without thinking about it, which rules out a chord; and a bare `Space` is only
 * free while the run owns it, which the mode's own keymap sees to at the highest
 * precedence. Every way out is loud: `Escape`, the strip's own control, running
 * off the end of the document — and writing a word, which ends the run and lets
 * the character land where it was typed.
 *
 * **This is the one place the audio is allowed to move the document.** Everywhere
 * else, following the playhead with the caret or the scroll position is the
 * fastest way to ruin a transcription tool. It is safe here because the user
 * pressed a button to enter a mode in which they are not typing.
 */

/**
 * How far ahead of the press the anchor is written, in seconds.
 *
 * Every human tap lands late. Without this, jumping to a line starts just after
 * its first syllable — the annoying direction, because the word you came back to
 * check is the one you miss. A small constant biases the error the other way,
 * where it costs a moment of the previous line's tail and nothing else.
 *
 * It is small because one number is serving two jobs that want opposite things.
 * A *seek* wants a lead; a *follow* wants none, and the marked cell and the
 * document scroll that hangs off it are read against the audio continuously
 * rather than once. At 120ms — where this started — the mark landed visibly
 * ahead of the line being sung, which is roughly where a visual event leading
 * audio stops reading as simultaneous. 50ms is under that and still keeps a
 * jump off the first syllable.
 *
 * If the lead is ever wanted back for seeking, the answer is a second constant
 * spent at the four places that seek to an anchor — the timestamp press, the
 * line-number press, `Ctrl-Alt-Enter` and `stepBack` — and not this one growing.
 * An anchor is a claim about when a line started, and it should stay one.
 *
 * **It is a wall-clock quantity, so the tap spends it in track time by
 * multiplying by the playback rate.** The lateness it compensates belongs to a
 * hand, and a hand is no later at 0.5× — but the track only advances half as
 * far during that lateness, so the fixed 50ms would over-correct every anchor
 * written at a practice rate and stamp them early. Slowing the tape down is
 * exactly what a transcriber does when the lines come too fast to tap, so the
 * practice rate is where a run's accuracy matters most, not a corner case.
 */
export const tapOffsetSeconds = 0.05;

export const setLyricSyncEffect = StateEffect.define<boolean>();

/** Internal: the caret's line has been timed by this run, or it has not. */
const armEffect = StateEffect.define<boolean>();

/** Internal: this section has had its timings written from a linked peer. */
const markFilledEffect = StateEffect.define<number>();

/** Internal: this run ends on the line starting here — it covers a selection. */
const scopeEffect = StateEffect.define<number>();

interface LyricSyncState {
	active: boolean;
	/**
	 * Whether the line the caret is on has already been timed by this run.
	 *
	 * This is the whole of what makes the caret sit on the line being *heard*
	 * rather than the line coming next. A tap stamps where the caret is and leaves
	 * it there, so the row that lights up is the row whose time just changed; the
	 * advance is deferred to the front of the following tap, which is the moment it
	 * stops being wrong. Without the flag there is no way to tell the first tap on
	 * a line from the second.
	 */
	armed: boolean;
	/**
	 * The headers this run has already filled from a linked peer.
	 *
	 * One fill per section per run, and that is what makes the way out real: a
	 * user who does not want the copied rhythm presses the section's first line
	 * number, which sends the tape and the caret back there — and a tap that
	 * filled the section a second time would take the escape hatch away on the
	 * very press it exists for. Bare offsets rather than mapped positions,
	 * because a document change ends the run and clears this with it.
	 */
	filled: readonly number[];
	/**
	 * Where this run stops: the start of the last line it may time, or undefined
	 * for a pass over the whole song.
	 *
	 * A run entered over a selection covers the selection and nothing else — the
	 * selection is the one gesture that deliberately names a region, so the run
	 * ends the moment that line is timed, exactly as an unscoped run ends on the
	 * document's last stampable line. A bare offset for `filled`'s reason: a
	 * document change ends the run and clears this with it.
	 */
	until?: number;
}

export const lyricSyncField = StateField.define<LyricSyncState>({
	create: () => ({ active: false, armed: false, filled: [] }),
	update(value, transaction) {
		let next = value;
		for (const effect of transaction.effects) {
			// Entering or leaving always disarms and drops the scope: a new run
			// starts by timing the line it starts on, over whatever region its own
			// entry names.
			if (effect.is(setLyricSyncEffect)) next = { active: effect.value, armed: false, filled: [] };
			else if (effect.is(armEffect)) next = { ...next, armed: effect.value };
			else if (effect.is(scopeEffect)) next = { ...next, until: effect.value };
			else if (effect.is(markFilledEffect)) {
				next = { ...next, filled: [...next.filled, effect.value] };
			}
		}
		return next;
	}
});

export function lyricSyncActive(state: EditorState): boolean {
	return state.field(lyricSyncField, false)?.active ?? false;
}

/** The first stampable line at or after `number`, if the document has one. */
function stampableFrom(state: EditorState, number: number): Line | undefined {
	for (let candidate = Math.max(1, number); candidate <= state.doc.lines; candidate += 1) {
		const line = state.doc.line(candidate);
		if (isStampableLine(line)) return line;
	}
	return undefined;
}

/** The last stampable line at or before `number`, if the document has one. */
function stampableBefore(state: EditorState, number: number): Line | undefined {
	for (let candidate = Math.min(number, state.doc.lines); candidate >= 1; candidate -= 1) {
		const line = state.doc.line(candidate);
		if (isStampableLine(line)) return line;
	}
	return undefined;
}

export interface LyricSyncOptions {
	/**
	 * One reading of the transport, or undefined when nothing is attached.
	 *
	 * A tap asks three things at the moment of the press: where the tape is
	 * (`liveTime()`, the source's own playhead rather than the mirrored readout),
	 * how fast it is running (the offset is a wall-clock quantity, spent in track
	 * time), and whether it is running at all — a paused tape still reports its
	 * parked position, and a tap spent against that would stamp the pause's own
	 * moment onto the next line, wrong by the length of the pause.
	 */
	playback(): { time: number; rate: number; playing: boolean } | undefined;
	/**
	 * Put the tape at `time`.
	 *
	 * Stepping back is the one thing in a run that moves the audio, and it moves
	 * it the same way every other seek in the workbench does — which is to say it
	 * plays from there, because a run that is being backed up is a run in
	 * progress.
	 */
	onSeek(time: number): void;
	/**
	 * The mode turned on or off, however it happened.
	 *
	 * `startAt` is where the audio has to be for the run to line up with the caret
	 * — 0 for a fresh pass, the resumed line's own time for a half-timed song, and
	 * absent when the tape must be left where the user parked it: a
	 * selection-scoped run with no timed line above the selection has no moment of
	 * its own to name, and the user's own placement is the only honest answer.
	 * It is the editor's answer because the anchors are the editor's. `scoped`
	 * says the run covers a selection rather than the song.
	 */
	onChange(active: boolean, startAt?: number, scoped?: boolean): void;
	announce(message: string): void;
	/**
	 * Something happened in the run that the user has to be able to *see*.
	 *
	 * `announce` reaches the `sr-only` live region and nothing else, which is the
	 * right channel for every other thing a run says: entering, resuming, stepping
	 * back and stopping are all loud on screen already — the rail, the caret and
	 * the times say them. Filling a section from a linked peer is not. Several
	 * lines are dated at once, the caret jumps past them, and the tape moves,
	 * without a press having asked for any of it, so the one thing it owes is a
	 * sentence saying what it did and how to undo the decision.
	 *
	 * Both are called, because the toast region is not a live region and either
	 * alone loses an audience — the same split `report` in `editor-session` makes.
	 */
	notify(message: string): void;
}

/** Every line of one section a run would tap, in order. */
function stampableLines(state: EditorState, section: Section): Line[] {
	const lines: Line[] = [];
	const first = state.doc.lineAt(Math.min(section.from, state.doc.length)).number;
	const last = state.doc.lineAt(Math.min(section.to, state.doc.length)).number;
	for (let number = first; number <= last; number += 1) {
		const line = state.doc.line(number);
		if (isStampableLine(line)) lines.push(line);
	}
	return lines;
}

/** A header as the reader wrote it, ordinal and all: `Chorus 2`. */
function headerLabel(section: Section | undefined): string {
	return (section?.header?.rawNamePart.trim() || section?.header?.raw.trim()) ?? '';
}

/** What a run writes when it walks into a section it has already timed elsewhere. */
interface LinkedFill {
	/** The filled section's header, so one run fills it at most once. */
	header: number;
	label: string;
	peerLabel: string;
	/** Every line after the tapped one this peer can date, and when. */
	anchors: readonly { pos: number; time: number }[];
	/** The last line the fill reached, which is where the run carries on from. */
	last: Line;
	lastTime: number;
}

/**
 * Time the rest of a linked section from the copy that is already timed.
 *
 * A chorus is typed once and sung three times, so a run that has timed the first
 * one already knows the shape of the other two: the words are the same words —
 * that is what a link *is* — and what is left to establish is where in the song
 * this repeat starts, which is exactly what the tap that walks into it says. So
 * the tap dates the first line and the peer's own intervals date the rest.
 *
 * **What is carried is the shape, never the times.** A peer's absolute anchors
 * belong to its own moment in the song; copied outright they would send every
 * jump into the second chorus back to the first. Each line is written at the
 * tap plus that line's distance from the peer's opening line, so what repeats is
 * the rhythm the transcriber already tapped by hand.
 *
 * Five things it refuses, and each is a case where a guess would be worse than
 * the dash it replaces:
 *
 * - **Only on the way in.** A tap in the middle of a section is the user timing
 *   that line, and nothing about it asks for the rest to be written for them.
 * - **Only from a copy that comes earlier.** A later peer is the same words and
 *   would date this section just as well, but a section written by the one below
 *   it reads as the document filling itself in backwards — and the run has not
 *   been there yet, so its times are the ones the user is on their way to
 *   correcting.
 * - **It stops at the peer's first gap** rather than skipping over it. Dating the
 *   lines after a hole would leave an untimed line behind the caret, which is a
 *   line the run never comes back to; stopping there hands the tapping back.
 * - **It stops where the peer's own times go backwards.** Everything downstream —
 *   the marked cell, the step back, the follow — reads anchors as ordered, and a
 *   peer with broken data must not spread it.
 * - **It stops where the copies' line structures part ways.** The pairing is by
 *   line index, and a copy carrying a line its peer lacks — the shape the link
 *   model was rebuilt for — puts every later line against the wrong peer line.
 *   `linePairingLimits` says how far the two structures agree, and past that the
 *   tapping is handed back, exactly as at a gap. A word-level difference moves
 *   no line boundary and fills on.
 *
 * And among the peers that remain, **one this run tapped outranks one it
 * derived**, nearest-first within each. A filled section's times are a rhythm at
 * one remove already, and a chain of fills would carry any error of the first
 * one down the whole song; `filled` is the record of which is which.
 */
function linkedFill(
	state: EditorState,
	line: Line,
	at: number,
	filled: readonly number[]
): LinkedFill | undefined {
	const parsed = parsedDocumentForState(state);
	const section = parsed.sections.find(
		(candidate) => candidate.from <= line.from && line.to <= candidate.to
	);
	const header = section?.header;
	if (!section || !header) return undefined;

	const own = stampableLines(state, section);
	if (own[0]?.from !== line.from || own.length < 2) return undefined;

	const nearest = linkedPeerHeaders(state, parsed, header.from)
		.filter((peer) => peer < header.from)
		.sort((left, right) => right - left);
	const peers = [
		...nearest.filter((peer) => !filled.includes(peer)),
		...nearest.filter((peer) => filled.includes(peer))
	];

	for (const peer of peers) {
		const peerSection = parsed.sections.find((candidate) => candidate.header?.from === peer);
		if (!peerSection) continue;
		const limits = linePairingLimits(state, parsed, header.from, peer);
		if (!limits) continue;
		const peerLines = stampableLines(state, peerSection);
		const base = peerLines[0] ? anchorTimeAt(state, peerLines[0].from) : undefined;
		if (base === undefined) continue;

		// Line pairing is only trusted up to the first divergent run that moves a
		// line boundary, in either copy.
		const cap = Math.min(
			own.filter((candidate) => candidate.from < limits.own).length,
			peerLines.filter((candidate) => candidate.from < limits.peer).length
		);

		const anchors: { pos: number; time: number }[] = [];
		let last = line;
		let lastTime = at;
		for (let index = 1; index < cap; index += 1) {
			const target = own[index];
			const peerLine = peerLines[index];
			if (!target || !peerLine) break;
			const peerTime = anchorTimeAt(state, peerLine.from);
			if (peerTime === undefined) break;
			const time = at + (peerTime - base);
			if (time <= lastTime) break;
			anchors.push({ pos: target.from, time });
			last = target;
			lastTime = time;
		}
		if (anchors.length === 0) continue;
		return {
			header: header.from,
			label: headerLabel(section),
			peerLabel: headerLabel(peerSection),
			anchors,
			last,
			lastTime
		};
	}
	return undefined;
}

/**
 * One short sentence: what was written, and the way out of it.
 *
 * The way out is half the message rather than a nicety. Nothing else on screen
 * says that these times were derived, and the section may well be the one place
 * this song departs from itself — so the sentence that reports the shortcut is
 * also the only place the user is told they can refuse it.
 */
function fillMessage(fill: LinkedFill): string {
	const name = fill.label || 'The linked section';
	const from = fill.peerLabel || 'its earlier copy';
	return `${name} timed from ${from} — ${fill.anchors.length + 1} lines. Press a line number to time it by hand instead.`;
}

function end(view: EditorView, options: LyricSyncOptions, message: string): boolean {
	view.dispatch({ effects: setLyricSyncEffect.of(false) });
	options.announce(message);
	return true;
}

/**
 * Time the line the song is on.
 *
 * **The caret lands on the line that was just timed, not on the one coming
 * next.** A tap is a claim about the line starting *now*, so the row that lights
 * up has to be the row whose time just changed — that is the whole of the
 * feedback for the press, and read on the following line it is feedback about the
 * wrong thing. It is also what the user is doing between taps: reading along with
 * the line they are hearing, to check that the words match the music.
 *
 * So the advance is deferred to the front of the next tap, which is exactly when
 * it stops being wrong. `armed` is what distinguishes a run's first tap on a line
 * from its second.
 *
 * One transaction, not two: the anchor and the move are one press and have to be
 * one undo, and a selection change and an effect fit in the same dispatch.
 *
 * Exported because a finger has no `Space`. The transport's tap control is bound
 * to the command itself rather than to a synthesised key event, so the two paths
 * cannot drift into meaning different things — and everything the tap has to get
 * right (the offset, the deferred advance, ending on the last line) is written
 * once, here.
 */
export function lyricSyncTap(options: LyricSyncOptions) {
	return (view: EditorView): boolean => {
		const sync = view.state.field(lyricSyncField);
		if (!sync.active) return false;

		const reading = options.playback();
		if (reading === undefined || !Number.isFinite(reading.time)) {
			return end(view, options, 'Sync stopped: the audio was detached.');
		}

		// **A tap against a paused tape is refused, and the run holds.** The
		// transcription loop is listen, pause, think — and the transport keys are
		// bound to the window, so the tape can be stopped mid-run without the mode
		// ending. What a pause must not do is take taps: `liveTime()` goes on
		// reporting wherever the tape was parked, so a tap spent there would write
		// the pause's own moment onto the next line — wrong by however long the
		// pause lasted, with nothing on screen saying so, which is the automatic
		// stamp's failure arriving through `F8`. Refusing changes nothing visible
		// at all, so the sentence goes out on both channels: `announce` for the
		// live region, `notify` for a toast, because either alone loses an
		// audience. The key is still claimed — `Space` belongs to the run, paused
		// or not, and must not fall through to the document.
		if (!reading.playing) {
			const message = 'Sync is paused. Press play to keep tapping.';
			options.announce(message);
			options.notify(message);
			return true;
		}
		const time = reading.time;

		const caret = view.state.doc.lineAt(view.state.selection.main.head);
		// **The caret's line is not a promise that it can be timed.** A run ends on
		// the document changing, and a selection change is not one — so between
		// entering a run and its first tap the user can click a section header or a
		// blank line, and an un-armed tap taken at face value would stamp it. Every
		// downstream reader assumes that cannot happen: the linked fill pairs by
		// stampable line, the gutter draws no cell beside structure, and the skip
		// walks stampable lines only. So the un-armed tap walks forward from the
		// caret's own line exactly as an armed one walks forward from the line below
		// — and a caret already on a lyric line is what `stampableFrom` hands back
		// unchanged, which is every ordinary tap.
		const line = stampableFrom(view.state, sync.armed ? caret.number + 1 : caret.number);
		if (!line) return end(view, options, 'Every line is timed. Sync finished.');

		// The offset is a hand's wall-clock lateness, so what it costs in track
		// time scales with how fast the track is moving under that hand.
		const at = Math.max(0, time - tapOffsetSeconds * reading.rate);
		// A section this run has already filled taps like any other: the user went
		// back to it on purpose, and writing it again would be the shortcut taking
		// the correction away from them.
		const candidate = linkedFill(view.state, line, at, sync.filled);
		let fill = candidate && !sync.filled.includes(candidate.header) ? candidate : undefined;
		// A scoped run stops the fill at its own boundary, exactly as the fill
		// already stops at a peer's first gap: the user selected these lines and no
		// others, and a shortcut that dated lines outside the selection would break
		// the one promise the scope makes. Truncated rather than refused, so a
		// whole linked chorus selected at once still times itself in one tap.
		if (fill && sync.until !== undefined) {
			const boundary = sync.until;
			const kept = fill.anchors.filter((anchor) => anchor.pos <= boundary);
			if (kept.length === 0) fill = undefined;
			else if (kept.length < fill.anchors.length) {
				const lastKept = kept[kept.length - 1]!;
				fill = {
					...fill,
					anchors: kept,
					last: view.state.doc.lineAt(lastKept.pos),
					lastTime: lastKept.time
				};
			}
		}
		const landed = fill?.last ?? line;

		view.dispatch({
			effects: [
				// It overwrites, because timing a song is the act of replacing whatever
				// the last pass got wrong — a sync that refused would do nothing on a
				// second run over a part-timed draft, which is the common case.
				anchorLineEffect.of({ pos: line.from, time: at }),
				// One transaction for the whole section, so the fill is one undo and one
				// save exactly as a single tap is.
				...(fill?.anchors ?? []).map((anchor) =>
					anchorLineEffect.of({ pos: anchor.pos, time: anchor.time })
				),
				armEffect.of(true),
				...(fill ? [markFilledEffect.of(fill.header)] : []),
				// The wash moves with the caret, in the same transaction.
				//
				// The marked line is the last anchor at or before the *playhead*, and the
				// playhead the field holds is `currentTime` — a `timeupdate`-fed mirror,
				// up to a tick stale. A tap stamps its line at `liveTime` minus the tap
				// offset, so whenever the mirror is more than that behind, the line just
				// timed sorts *after* the playhead on record: the caret moved, and the
				// yellow band stayed on the previous line until the next tick caught up.
				// That is about half of all taps, and it is the one moment in a run where
				// the two are read against each other.
				//
				// So the tap publishes the reading it already has. This is not a guessed
				// position — `playback().time` is `liveTime()`, the source's own playhead
				// read at the moment of the press, which is strictly fresher than the
				// mirror it replaces, and the next tick can only confirm it.
				//
				// A fill publishes where the tape is being sent instead, because the seek
				// below is issued in this same synchronous block: published live, the wash
				// would land on the section's first line while the caret sat on its last,
				// and the follow listener would scroll to one and then the other.
				setPlayheadEffect.of(fill?.lastTime ?? time),
				// A scoped run nudges nearest-edge instead of holding a reading line —
				// nothing moves while the landed line is visible, which it is in every
				// selection short of a viewport, and a taller one still keeps its
				// caret on screen.
				...(sync.until !== undefined ? [EditorView.scrollIntoView(landed.from)] : [])
			],
			selection: { anchor: landed.from }
		});
		if (sync.until === undefined) holdReadingLine(view, landed.from);

		if (fill) {
			// The tape goes where the caret went. A run is one pass over the document
			// against one pass of the audio, and the section between them has just been
			// answered — leaving the user to listen through a chorus that is already
			// timed is asking them to wait for a tap they are not going to make.
			options.onSeek(fill.lastTime);
			const message = fillMessage(fill);
			options.announce(message);
			options.notify(message);
		}

		// Nothing left to time, so the run is over — and it ends here rather than on
		// a further tap, because a press that only stopped the mode would be a press
		// the user made expecting to time something. A scoped run's "nothing left"
		// is the selection's own last line, timed just now.
		const scopeDone = sync.until !== undefined && landed.from >= sync.until;
		if (scopeDone || !stampableFrom(view.state, landed.number + 1)) {
			return end(
				view,
				options,
				`Last ${scopeDone ? 'selected ' : ''}line timed at ${formatAnchorTime(fill?.lastTime ?? time)}. Sync finished.`
			);
		}
		return true;
	};
}

/**
 * Undo the last tap.
 *
 * Without a way back one fumble means restarting the run, because every later tap
 * lands on the wrong line. It clears the line it leaves rather than merely
 * stepping off it, so that line is genuinely un-timed and the next tap writes it
 * fresh — and it goes back to the previous line, which is still timed and is
 * therefore still `armed`.
 *
 * **The tape backs up with the caret**, to the time that previous line already
 * carries. A run is one pass over the document against one pass of the audio, so
 * a step back that moved only the caret would leave the two ends in different
 * places — the user would be looking at the line before the fumble while hearing
 * whatever came after it, and the next tap would land as wrong as the one being
 * taken back. Seeking to the stored anchor rather than to the moment of the tap
 * also carries `tapOffsetSeconds` back with it, so the line starts a beat after
 * playback resumes and there is a run-up to tap against.
 *
 * Nothing is seeked where there is no line to go back to — the first tap of a run
 * — or where the one there is carries no time of its own. There is no moment to
 * go to, so the tap comes off and the audio is left where it is rather than being
 * sent somewhere invented.
 */
function stepBack(options: LyricSyncOptions) {
	return (view: EditorView): boolean => {
		const sync = view.state.field(lyricSyncField);
		if (!sync.active) return false;
		// Nothing has been timed yet, so there is no tap to take back.
		if (!sync.armed) return true;

		const line = view.state.doc.lineAt(view.state.selection.main.head);
		const previous = stampableBefore(view.state, line.number - 1);
		const resumeAt = previous ? anchorTimeAt(view.state, previous.from) : undefined;
		view.dispatch({
			effects: [
				clearLineAnchorEffect.of({ pos: line.from }),
				armEffect.of(previous !== undefined),
				...(previous && sync.until !== undefined ? [EditorView.scrollIntoView(previous.from)] : [])
			],
			...(previous ? { selection: { anchor: previous.from } } : {})
		});
		if (previous && sync.until === undefined) holdReadingLine(view, previous.from);
		if (resumeAt !== undefined) options.onSeek(resumeAt);
		return true;
	};
}

/**
 * Where a skip forward would land: the timed line standing directly before the
 * next untimed one, and the moment it carries.
 *
 * `undefined` is most of the answer, and each branch is a refusal rather than a
 * miss. No untimed line ahead means there is nothing to skip to. An untimed
 * line whose predecessor is the caret's own line — or the caret line itself —
 * means the run is already aimed at it: the next tap times that line, and a
 * jump would move nothing or, worse, leave an untimed line behind the caret,
 * which is a line the run never comes back to.
 *
 * Exported on its own because the strip has to know whether to draw the
 * control at all: a skip that is offered and refuses is a press that reads as
 * broken, which is the failure `availableRates` exists to prevent.
 */
export function lyricSyncSkipTarget(state: EditorState): { line: Line; time: number } | undefined {
	// A scoped run's skip may not reach past its own boundary — the strip hides
	// the control for those runs, and this is the same refusal kept where the
	// command lives, so a caller that never learned about scopes cannot jump one.
	const until = state.field(lyricSyncField, false)?.until;
	const caret = state.doc.lineAt(state.selection.main.head);
	for (let candidate = caret.number; candidate <= state.doc.lines; candidate += 1) {
		const line = state.doc.line(candidate);
		if (until !== undefined && line.from > until) return undefined;
		if (!isStampableLine(line)) continue;
		if (anchorTimeAt(state, line.from) !== undefined) continue;
		// The first untimed stampable line at or after the caret. Everything
		// stampable between the caret and it is timed by construction, so landing
		// on its immediate predecessor never jumps over a line that still wants a
		// time.
		const previous = stampableBefore(state, line.number - 1);
		if (!previous || previous.number <= caret.number) return undefined;
		const time = anchorTimeAt(state, previous.from);
		if (time === undefined) return undefined;
		return { line: previous, time };
	}
	return undefined;
}

/**
 * Jump a run past the lines that are already timed.
 *
 * A song synced once and then edited — a long line split into two, in several
 * places — is timed everywhere except the new lines, and a resumed run only
 * knows how to pick up before the *first* gap. Reaching the later ones meant
 * listening through whole verses that were already right, or aiming a
 * line-number press by eye. This is that jump as one press: the caret lands on
 * the last timed line before the next untimed one, `armed`, and the tape goes
 * to that line's own anchor — so there is a whole line of run-up to tap
 * against, exactly as a resumed run gives itself.
 *
 * The seek goes through `onSeek`, the hook every other jump to an anchor uses,
 * so skipping and pressing a line number cannot come to mean different things
 * about where the tape ends up. The playhead is published in the same
 * transaction for the fill's reason: the seek is issued in this same
 * synchronous block, and read live the wash would land a tick behind the line
 * the caret just moved to.
 */
export function lyricSyncSkip(options: LyricSyncOptions) {
	return (view: EditorView): boolean => {
		if (!view.state.field(lyricSyncField).active) return false;
		const target = lyricSyncSkipTarget(view.state);
		if (!target) return false;
		view.dispatch({
			// Armed, because the landing line already has a time: the next tap
			// belongs to the untimed line below it, which is the whole point of the
			// jump.
			effects: [armEffect.of(true), setPlayheadEffect.of(target.time)],
			selection: { anchor: target.line.from }
		});
		holdReadingLine(view, target.line.from);
		options.onSeek(target.time);
		options.announce(
			`Skipped the timed lines to ${formatAnchorTime(target.time)}. The next line is untimed.`
		);
		return true;
	};
}

/**
 * Put a run's caret on the line the pointer just sent the tape to.
 *
 * A press on an anchored line's number plays from that moment, and outside a run
 * that is the whole of what it does. Inside one it cannot be: the caret is where
 * the next tap lands, so a tape that moved without it would leave the two ends of
 * the run in different places — which is the failure `stepBack` seeks for, met
 * from the other side.
 *
 * It is the way out of a section filled from a linked peer, and the only one:
 * pressing that section's first line number rewinds the tape to it and the run
 * walks the copy by hand from the line after, which is the first one the fill
 * wrote rather than the user's own tap.
 *
 * Called only from the line-number press, which is already narrowed to lines that
 * carry a time — so nothing here promises a rewind on a row the pointer cursor
 * says nothing about.
 */
export function syncMoveTo(view: EditorView, pos: number): boolean {
	const sync = view.state.field(lyricSyncField, false);
	if (!sync?.active) return false;
	const line = view.state.doc.lineAt(Math.min(Math.max(pos, 0), view.state.doc.length));
	if (!isStampableLine(line)) return false;
	view.dispatch({
		// Armed, for the same reason a resumed run is: the press landed on a line
		// that already has a time, so the next tap belongs to the one after it.
		//
		// It was disarmed once, on the reading that the press names the line the user
		// wants timed — and that tap could not have timed anything. The seek goes to
		// the pressed line's own stored anchor, so a tap against it can only rewrite
		// the moment it just rewound to, to within the reaction it takes to make it:
		// the caret does not move, the cell redraws the same `m:ss`, and the press
		// reads as swallowed. Every tap after it then works, which is the shape this
		// was reported in — one dead press per jump.
		//
		// A line whose time is actually wrong is not fixable that way either. Wrong
		// late means the rewind starts *after* the line began, so its opening is gone
		// before the tape is playing. Re-timing one line is `Ctrl-Alt-M` and the
		// column's own ± pair; stepping back onto one is `Backspace`, which clears the
		// anchor first and seeks to the line *before* it, so there is a run-up.
		effects: [
			armEffect.of(true),
			...(sync.until !== undefined ? [EditorView.scrollIntoView(line.from)] : [])
		],
		selection: { anchor: line.from }
	});
	if (sync.until === undefined) holdReadingLine(view, line.from);
	return true;
}

export function lyricSync(options: LyricSyncOptions): Extension {
	return [
		lyricSyncField,
		// **A scoped run does not scroll, and that includes the playhead follow.**
		// The reading-line hold exists for a pass over the whole song, where the
		// caret descends out of view; a scoped run's lines were on screen when the
		// user selected them, so pulling the document to a reading position on
		// entry — or on every playhead crossing while the run plays through its
		// few lines — is a jump nobody asked for, right after they carefully put
		// a selection where they were looking. The run's own moves use a
		// nearest-edge nudge instead, which scrolls nothing while the line is
		// visible; this facet is what stands the follow listener down.
		suppressPlayheadFollow.compute([lyricSyncField], (state) => {
			const sync = state.field(lyricSyncField);
			return sync.active && sync.until !== undefined;
		}),
		// **Typing ends the run, and the character lands where it was typed.**
		//
		// The mode used to hold the document `EditorState.readOnly`, on the
		// reasoning that a document not taking typing is what frees `Space` to be
		// the tap. What that actually bought was a mis-keyed letter doing nothing
		// at all: the user typed at a line they could see was wrong, nothing
		// happened, and they had to work out that they were in a mode before they
		// could fix it. `Space` is freed by the run's own keymap, at the highest
		// precedence, which is where it was always being freed.
		//
		// So a keystroke that would write something is read as what it plainly is —
		// the user has stopped tapping and started transcribing — and the run gets
		// out of the way. The shell pauses the tape on the way out, as it does for
		// every other exit.
		//
		// **It is read off the document actually changing, never off a guess about
		// which keys mean typing.** That is what keeps it one rule rather than a
		// list: a dead key, an IME composition, a paste, a drop, and a fix applied
		// from the panel are all edits, and every one of them ends the run. Nothing
		// has to be excluded either, because the keys the run owns — `Space`,
		// `Enter`, `Backspace`, `ArrowUp` — are taken at the highest precedence and
		// change no text, so they never reach here.
		//
		// An extender rather than a filter, because the effect has to ride the very
		// transaction that carried the edit: one undo step, one snapshot, and no
		// instant in which the document has changed while the mode is still on.
		EditorState.transactionExtender.of((transaction) =>
			transaction.docChanged && transaction.startState.field(lyricSyncField).active
				? { effects: setLyricSyncEffect.of(false) }
				: null
		),
		// Highest precedence, because `Space`, `Enter` and `Backspace` all belong to
		// the default keymap and every one of them has to be taken back while the
		// mode is on. Each command returns false when it is not, so the keys fall
		// straight through to their usual owners the rest of the time.
		//
		// This is the whole of what keeps the run's keys out of the document, now
		// that the document is not held read-only: while a run is under way each of
		// these commands returns true down every path it has, so the key is
		// answered here and its default never runs.
		//
		// **No `preventDefault: true` on any of these.** That option prevents the
		// default even when the command returns *false*, so it would swallow the
		// space bar, backspace and the up arrow in an editor that is not syncing —
		// which is to say, almost always. Returning true already prevents the
		// default, and returning false is exactly the case that must not.
		Prec.highest(
			keymap.of([
				{ key: 'Space', run: lyricSyncTap(options) },
				{ key: 'Enter', run: lyricSyncTap(options) },
				{ key: 'Backspace', run: stepBack(options) },
				{ key: 'ArrowUp', run: stepBack(options) },
				{
					key: 'Escape',
					run: (view) => {
						if (!lyricSyncActive(view.state)) return false;
						return end(view, options, 'Sync stopped.');
					}
				}
			])
		),
		// One place the mode's change is reported, so it reads the same whether the
		// shell turned it on, `Escape` turned it off, the document ran out, or the
		// user typed a word into it.
		EditorView.updateListener.of((update) => {
			const before = update.startState.field(lyricSyncField).active;
			const state = update.state.field(lyricSyncField);
			if (before === state.active) return;
			if (!state.active) {
				options.onChange(false);
				// The one exit that arrives without having been asked for. `end`
				// speaks for the three deliberate ones, and this is the transaction
				// the user typed — which is loud on screen and silent to a screen
				// reader, so it is the one that needs saying out loud.
				if (update.docChanged) options.announce('Sync stopped: the document changed.');
				return;
			}

			// Where the tape has to start, decided here rather than in the shell,
			// because the anchors are the editor's and this is the one moment their
			// answer matters to anyone else. `armed` on entry means exactly one
			// thing: the run begins on a line that already has a time — a resumed
			// pass, or a scoped run entering with a run-up — so that is the moment
			// to play from. A scoped run with no such line names no moment at all:
			// the tape stays where the user parked it, which is the only position
			// anybody deliberately chose.
			const scoped = state.until !== undefined;
			const resumeAt = state.armed
				? anchorTimeAt(update.state, update.state.selection.main.head)
				: undefined;
			options.onChange(true, resumeAt ?? (scoped ? undefined : 0), scoped);
			options.announce(
				scoped
					? resumeAt === undefined
						? 'Syncing the selection. The tape is where you left it.'
						: `Syncing the selection from ${formatAnchorTime(resumeAt)}.`
					: resumeAt === undefined
						? 'Sync started from the top.'
						: `Sync resumed at ${formatAnchorTime(resumeAt)}.`
			);
		}),
		EditorView.editorAttributes.of((view) =>
			lyricSyncActive(view.state) ? { class: 'll-syncing' } : null
		)
	];
}

/** The first line that still wants a time, if the song has one. */
function firstUntimed(state: EditorState): Line | undefined {
	for (let candidate = 1; candidate <= state.doc.lines; candidate += 1) {
		const line = state.doc.line(candidate);
		if (isStampableLine(line) && anchorTimeAt(state, line.from) === undefined) return line;
	}
	return undefined;
}

/**
 * Where a run begins, and whether it begins mid-song.
 *
 * A half-timed song picks up where it was left rather than starting over: the run
 * resumes on the **last line that already has a time**, `armed`, so the first tap
 * advances onto the first untimed line exactly as any other tap would. Landing
 * directly on the untimed line instead would mean tapping its opening syllable
 * from a standing start, with no run-up to hear it coming — and a whole line of
 * run-up is what makes the rhythm findable again.
 *
 * A song with nothing timed, and a song timed all the way through, both start
 * over from the top. The second is the only sensible reading of pressing sync on
 * finished work: there is nothing to resume, so it is a fresh pass.
 *
 * The line is the first *stampable* one rather than line 1: the top of a lyric is
 * usually a section header, and a tap spent on one is a tap thrown away.
 */
function runStart(state: EditorState): { line: Line | undefined; armed: boolean } {
	const untimed = firstUntimed(state);
	if (!untimed) return { line: stampableFrom(state, 1), armed: false };
	const resume = stampableBefore(state, untimed.number - 1);
	if (!resume) return { line: untimed, armed: false };
	return { line: resume, armed: true };
}

/**
 * The lines a selection would scope a run to, if it names any.
 *
 * A selection is the one gesture that deliberately names a region — a caret is
 * parked somewhere after every interaction and carries no intent, which is why
 * the caret was refused this job. The scope is the stampable lines the
 * selection touches: headers and blanks inside it are skipped exactly as a
 * full pass skips them, and a selection touching none falls back to an
 * ordinary run, which is also what the strip's label promised in that state —
 * both read the same `isLyricLine` underneath, so the two cannot drift.
 *
 * A selection ending exactly at a line's start does not include that line:
 * sweeping over two whole lines routinely lands the head on the third's first
 * character, and timing a line nobody swept over would be the run guessing.
 */
function selectionScope(state: EditorState): { first: Line; last: Line } | undefined {
	const range = state.selection.main;
	if (range.empty) return undefined;
	const firstNumber = state.doc.lineAt(range.from).number;
	let lastNumber = state.doc.lineAt(range.to).number;
	if (lastNumber > firstNumber && range.to === state.doc.line(lastNumber).from) lastNumber -= 1;
	let first: Line | undefined;
	let last: Line | undefined;
	for (let number = firstNumber; number <= lastNumber; number += 1) {
		const line = state.doc.line(number);
		if (!isStampableLine(line)) continue;
		first ??= line;
		last = line;
	}
	return first && last ? { first, last } : undefined;
}

/**
 * Turn the mode on or off from outside.
 *
 * The caret and the tape have to begin in the same place — a run is one pass over
 * the lyric against one pass of the audio, so starting the tape at 0:00 and the
 * caret at whichever line was last clicked would time the wrong lines from the
 * first press. Which place that is comes from `runStart`; the shell learns the
 * matching moment through `onChange`.
 */
export function setLyricSync(view: EditorView, active: boolean): void {
	if (active === lyricSyncActive(view.state)) return;
	if (!active) {
		view.dispatch({ effects: setLyricSyncEffect.of(false) });
		return;
	}

	// A standing selection scopes the run to its own lines: the first tap times
	// the selection's first line, and timing its last ends the run. Where the
	// stampable line directly above the selection already has a time, the run
	// enters resume-style — caret on that line, armed, tape sent to its anchor —
	// so there is a whole line of run-up to tap against, exactly as a resumed
	// pass gives itself. Where it has none, the run starts disarmed on the
	// selection's first line and the tape is left alone (see `onChange`):
	// wherever the user parked it is the only position anybody chose, and the
	// worst a badly parked tape costs is waiting, never a wrong anchor — a tap
	// stamps `liveTime()`, so it is true whenever it is made. Entering collapses
	// the selection, which is also what consumed it: the run is its answer.
	const scope = selectionScope(view.state);
	if (scope) {
		const before = stampableBefore(view.state, scope.first.number - 1);
		const runup =
			before && anchorTimeAt(view.state, before.from) !== undefined ? before : undefined;
		const start = runup ?? scope.first;
		view.dispatch({
			// Order matters twice here: `setLyricSyncEffect` disarms and drops the
			// scope as it enters, so both the scope and any arming have to follow it.
			// No reading-line hold on the way in — the selection was on screen when
			// the user made it, and entry throwing the document to a reading
			// position is the scroll this mode has no use for. The nearest-edge
			// nudge moves nothing while the start line is visible and covers the one
			// case it is not: a run-up line sitting just above the fold.
			effects: [
				setLyricSyncEffect.of(true),
				scopeEffect.of(scope.last.from),
				...(runup ? [armEffect.of(true)] : []),
				EditorView.scrollIntoView(start.from)
			],
			selection: { anchor: start.from }
		});
		return;
	}

	const { line, armed } = runStart(view.state);
	view.dispatch({
		// Order matters: `setLyricSyncEffect` disarms as it enters, so the arming
		// for a resumed run has to come after it.
		effects: armed
			? [setLyricSyncEffect.of(true), armEffect.of(true)]
			: [setLyricSyncEffect.of(true)],
		...(line ? { selection: { anchor: line.from } } : {})
	});
	if (line) holdReadingLine(view, line.from);
}

export const lyricSyncTheme = EditorView.baseTheme({
	// The mode is modal and the document has stopped taking typing, so it has to
	// look like somewhere else. A rail down the text's own edge, not a tint over
	// it: the words are what the user is reading against the music.
	'.cm-editor.ll-syncing .cm-content': {
		boxShadow: 'inset 2px 0 0 0 var(--color-accent)'
	}
});
