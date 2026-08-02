import { describe, expect, it } from 'vitest';
import { checkRule, markedText } from '../rule-test-utils.js';
import { lineProseDensityRule as rule } from './line-prose-density.js';

describe('line.prose-density', () => {
	it('marks the complete prose-like lyric line', () => {
		const line =
			'I walked into the room, and everyone was talking; the lights were fading, while another story started and nobody stopped to breathe before the ending arrived.';
		const text = `[Verse]\n${line}`;
		const findings = checkRule(rule, text);

		expect(markedText(text, findings)).toEqual([line]);
		expect(findings.map((finding) => finding.message)).toEqual([
			'This line reads like several lyric lines combined.'
		]);
		expect(findings[0]?.fixes).toBeUndefined();
	});

	it('counts visible words through supported performer markup', () => {
		const line =
			'<i>One two three four five six, seven eight nine ten eleven twelve; thirteen fourteen fifteen sixteen seventeen eighteen, nineteen twenty twenty-one twenty-two twenty-three twenty-four.</i>';
		const text = `[Verse]\n${line}`;
		expect(markedText(text, checkRule(rule, text))).toEqual([line]);
	});

	it('accepts short lyrics, long unclausal lines, and unsupported markup', () => {
		expect(checkRule(rule, '[Verse]\nA short lyric line')).toEqual([]);
		expect(
			checkRule(
				rule,
				'[Verse]\nOne two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour'
			)
		).toEqual([]);
		expect(
			checkRule(
				rule,
				'[Verse]\n<u>One two three four five six, seven eight nine ten eleven twelve; thirteen fourteen fifteen sixteen seventeen eighteen, nineteen twenty twenty-one twenty-two twenty-three twenty-four.</u>'
			)
		).toEqual([]);
	});
});
