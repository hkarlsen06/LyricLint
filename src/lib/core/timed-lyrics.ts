import type { LineAnchor } from './types.js';

/**
 * The three timed-lyric containers a player will actually take: LRC for lyric
 * apps, SRT and VTT for anything that shows subtitles.
 */
export type TimedLyricsFormat = 'lrc' | 'srt' | 'vtt';

export const timedLyricsExtensions: Record<TimedLyricsFormat, string> = {
	lrc: 'lrc',
	srt: 'srt',
	vtt: 'vtt'
};

/**
 * How long the last cue runs for. Every other cue ends where the next one
 * starts; the last one has nothing after it to end against, and a subtitle with
 * no duration is one some players never draw.
 */
const trailingCueSeconds = 3;

function pad(value: number, length: number): string {
	return String(Math.floor(value)).padStart(length, '0');
}

/** `mm:ss.xx`, LRC's own form — minutes run past 60 rather than rolling over. */
function lrcTimestamp(seconds: number): string {
	const hundredths = Math.round(seconds * 100);
	return `${pad(hundredths / 6000, 2)}:${pad((hundredths / 100) % 60, 2)}.${pad(hundredths % 100, 2)}`;
}

/** `HH:MM:SS,mmm` for SRT; VTT is the same with a decimal point. */
function cueTimestamp(seconds: number, format: TimedLyricsFormat): string {
	const ms = Math.round(seconds * 1000);
	const clock = `${pad(ms / 3600000, 2)}:${pad((ms / 60000) % 60, 2)}:${pad((ms / 1000) % 60, 2)}`;
	return `${clock}${format === 'srt' ? ',' : '.'}${pad(ms % 1000, 3)}`;
}

/**
 * The supported markup is Genius's, not a player's, so it comes off on the way
 * out — an `<i>` a lyric app cannot read is visible garbage in the line.
 */
function plainLine(text: string): string {
	return text.replace(/<\/?[ib]>/giu, '').trim();
}

/**
 * Write the draft's anchored lines out as a timed-lyrics file.
 *
 * Anchors are sorted by time rather than by line, because that is the order
 * every one of these formats is read in and a corrected timing can put a later
 * line earlier. A line that has since been emptied contributes no cue.
 */
export function formatTimedLyrics(
	text: string,
	anchors: readonly LineAnchor[],
	format: TimedLyricsFormat
): string {
	const lines = text.split('\n');
	const cues = anchors
		.map((anchor) => ({ time: anchor.time, text: plainLine(lines[anchor.line - 1] ?? '') }))
		.filter((cue) => cue.text.length > 0)
		.sort((a, b) => a.time - b.time);

	if (cues.length === 0) return '';

	if (format === 'lrc') {
		return `${cues.map((cue) => `[${lrcTimestamp(cue.time)}]${cue.text}`).join('\n')}\n`;
	}

	const blocks = cues.map((cue, index) => {
		const end = cues[index + 1]?.time ?? cue.time + trailingCueSeconds;
		const span = `${cueTimestamp(cue.time, format)} --> ${cueTimestamp(end, format)}`;
		return `${index + 1}\n${span}\n${cue.text}\n`;
	});

	return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${blocks.join('\n')}`;
}
