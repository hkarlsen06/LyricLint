import { describe, expect, test } from 'vitest';
import { formatTimedLyrics } from './timed-lyrics.js';

const text = ['[Verse 1]', 'First line', 'Second <i>line</i>', ''].join('\n');
const anchors = [
	{ line: 3, time: 65.5 },
	{ line: 2, time: 12.34 }
];

describe('formatTimedLyrics', () => {
	test('keeps literal bracket and tag text in Musixmatch timed lyrics', () => {
		expect(
			formatTimedLyrics(
				'[Verse]\n<i>Literal</i>',
				[
					{ line: 1, time: 0 },
					{ line: 2, time: 1 }
				],
				'lrc',
				'musixmatch'
			)
		).toBe('[00:00.00][Verse]\n[00:01.00]<i>Literal</i>\n');
	});
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

test('exports recognized Genius annotation fragments on their original lines', () => {
	const source = '[Verse: Mira]\nThe [silver <i>compass</i>\nby the door](123456)\n[a [b](1)';
	const stamps = [
		{ line: 2, time: 5 },
		{ line: 3, time: 6 },
		{ line: 4, time: 7 }
	];
	for (const format of ['lrc', 'srt', 'vtt'] as const) {
		const result = formatTimedLyrics(source, stamps, format);
		expect(result).toContain('The silver compass');
		expect(result).toContain('by the door');
		expect(result).toContain('[a b');
		expect(result).not.toContain('123456');
		expect(result).not.toContain('](1)');
	}
	expect(
		formatTimedLyrics('The [silver](123)', [{ line: 1, time: 5 }], 'lrc', 'musixmatch')
	).toContain('[silver](123)');
});

test('simultaneous subtitle cues have positive duration and keep both voices', () => {
	const stamps = [
		{ line: 1, time: 5 },
		{ line: 2, time: 5 },
		{ line: 3, time: 8 },
		{ line: 4, time: 8 }
	];
	for (const profile of ['genius', 'musixmatch'] as const) {
		for (const format of ['srt', 'vtt'] as const) {
			const result = formatTimedLyrics('First\nSecond\nThird\nFourth', stamps, format, profile);
			const separator = format === 'srt' ? ',' : '.';
			expect(
				result.match(new RegExp(`00:00:05\\${separator}000 --> 00:00:08\\${separator}000`, 'g'))
			).toHaveLength(2);
			expect(
				result.match(new RegExp(`00:00:08\\${separator}000 --> 00:00:11\\${separator}000`, 'g'))
			).toHaveLength(2);
			expect(result).toContain('First');
			expect(result).toContain('Second');
		}
		expect(formatTimedLyrics('First\nSecond', stamps.slice(0, 2), 'lrc', profile)).toBe(
			'[00:05.00]First\n[00:05.00]Second\n'
		);
	}
});

test('subtitle timestamps that round to the same millisecond retain positive duration', () => {
	const result = formatTimedLyrics(
		'One\nTwo',
		[
			{ line: 1, time: 5 },
			{ line: 2, time: 5.0001 }
		],
		'vtt'
	);
	expect(result.match(/00:00:05\.000 --> 00:00:08\.000/g)).toHaveLength(2);
});
