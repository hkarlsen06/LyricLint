import { EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import type { Extension, Line } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
	anchorLineEffect,
	anchorTimeAt,
	clearLineAnchorEffect,
	formatAnchorTime,
	holdReadingLine,
	isStampableLine
} from './line-anchors.js';

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
 */
export const tapOffsetSeconds = 0.12;

export const setLyricSyncEffect = StateEffect.define<boolean>();

/** Internal: the caret's line has been timed by this run, or it has not. */
const armEffect = StateEffect.define<boolean>();

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
}

export const lyricSyncField = StateField.define<LyricSyncState>({
	create: () => ({ active: false, armed: false }),
	update(value, transaction) {
		let next = value;
		for (const effect of transaction.effects) {
			// Entering or leaving always disarms: a new run starts by timing the line
			// it starts on, not by skipping past it.
			if (effect.is(setLyricSyncEffect)) next = { active: effect.value, armed: false };
			else if (effect.is(armEffect)) next = { ...next, armed: effect.value };
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
	/** Where the audio is, or undefined when nothing is attached. */
	currentTime(): number | undefined;
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
	 * — 0 for a fresh pass, and the resumed line's own time for a half-timed song.
	 * It is the editor's answer because the anchors are the editor's.
	 */
	onChange(active: boolean, startAt?: number): void;
	announce(message: string): void;
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

		const time = options.currentTime();
		if (time === undefined || !Number.isFinite(time)) {
			return end(view, options, 'Sync stopped: the audio was detached.');
		}

		const caret = view.state.doc.lineAt(view.state.selection.main.head);
		const line = sync.armed ? stampableFrom(view.state, caret.number + 1) : caret;
		if (!line) return end(view, options, 'Every line is timed. Sync finished.');

		view.dispatch({
			effects: [
				// It overwrites, because timing a song is the act of replacing whatever
				// the last pass got wrong — a sync that refused would do nothing on a
				// second run over a part-timed draft, which is the common case.
				anchorLineEffect.of({ pos: line.from, time: Math.max(0, time - tapOffsetSeconds) }),
				armEffect.of(true)
			],
			selection: { anchor: line.from }
		});
		holdReadingLine(view, line.from);

		// Nothing left to time, so the run is over — and it ends here rather than on
		// a further tap, because a press that only stopped the mode would be a press
		// the user made expecting to time something.
		if (!stampableFrom(view.state, line.number + 1)) {
			return end(view, options, `Last line timed at ${formatAnchorTime(time)}. Sync finished.`);
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
			effects: [clearLineAnchorEffect.of({ pos: line.from }), armEffect.of(previous !== undefined)],
			...(previous ? { selection: { anchor: previous.from } } : {})
		});
		if (previous) holdReadingLine(view, previous.from);
		if (resumeAt !== undefined) options.onSeek(resumeAt);
		return true;
	};
}

export function lyricSync(options: LyricSyncOptions): Extension {
	return [
		lyricSyncField,
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
			// thing: the run resumed onto a line that already has a time, so that is
			// the moment to play from.
			const resumeAt = state.armed
				? anchorTimeAt(update.state, update.state.selection.main.head)
				: undefined;
			options.onChange(true, resumeAt ?? 0);
			options.announce(
				resumeAt === undefined
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
