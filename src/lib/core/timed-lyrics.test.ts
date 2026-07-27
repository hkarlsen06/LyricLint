import { describe, expect, test } from 'vitest';
import { formatTimedLyrics } from './timed-lyrics.js';

const text = ['[Verse 1]', 'First line', 'Second <i>line</i>', ''].join('\n');
const anchors = [
	{ line: 3, time: 65.5 },
	{ line: 2, time: 12.34 }
];

describe('formatTimedLyrics', () => {
	test('writes LRC in time order, without the markup a player cannot read', () => {
		expect(formatTimedLyrics(text, anchors, 'lrc')).toBe(
			'[00:12.34]First line\n[01:05.50]Second line\n'
		);
	});

	test('ends each SRT cue where the next begins, and the last one three seconds on', () => {
		expect(formatTimedLyrics(text, anchors, 'srt')).toBe(
			[
				'1',
				'00:00:12,340 --> 00:01:05,500',
				'First line',
				'',
				'2',
				'00:01:05,500 --> 00:01:08,500',
				'Second line',
				''
			].join('\n')
		);
	});

	test('heads VTT with its own signature and separates the milliseconds with a point', () => {
		const vtt = formatTimedLyrics(text, anchors, 'vtt');
		expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
		expect(vtt).toContain('00:00:12.340 --> 00:01:05.500');
	});

	test('contributes no cue for a line that has since been emptied', () => {
		expect(formatTimedLyrics('Only line\n', [{ line: 9, time: 1 }], 'lrc')).toBe('');
	});
});
