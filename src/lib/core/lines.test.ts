import { describe, expect, it } from 'vitest';
import { extractLineStyleSpans } from './lines.js';

describe('extractLineStyleSpans', () => {
	it('extracts ordered absolute ranges for all supported wrappers', () => {
		const text = 'A <i>B</i> <b>C</b> <i><b>D🌙</b></i>';
		const from = 20;
		const spans = extractLineStyleSpans(text, { from, to: from + text.length });

		expect(
			spans.map((span) =>
				'unsupported' in span
					? ['unsupported', span.rawTag]
					: [span.slot, text.slice(span.contentFrom - from, span.contentTo - from)]
			)
		).toEqual([
			[2, 'B'],
			[3, 'C'],
			[4, 'D🌙']
		]);
		expect(spans.map((span) => span.from)).toEqual([...spans].map((span) => span.from).sort());
	});

	it('records unsupported tags verbatim', () => {
		const text = '<u>Five</u>';
		const spans = extractLineStyleSpans(text, { from: 5, to: 5 + text.length });

		expect(spans).toEqual([
			{
				from: 5,
				to: 8,
				unsupported: true,
				rawTag: '<u>',
				reason: 'unsupported-tag'
			},
			{
				from: 12,
				to: 16,
				unsupported: true,
				rawTag: '</u>',
				reason: 'unsupported-tag'
			}
		]);
	});

	it('marks crossed supported tags as malformed instead of normalizing them', () => {
		const text = '<i>First <b>crossed</i></b>';
		const spans = extractLineStyleSpans(text, { from: 0, to: text.length });

		expect(spans).toHaveLength(4);
		expect(
			spans.map((span) => ('unsupported' in span ? [span.rawTag, span.reason] : span.slot))
		).toEqual([
			['<i>', 'malformed-markup'],
			['<b>', 'malformed-markup'],
			['</i>', 'malformed-markup'],
			['</b>', 'malformed-markup']
		]);
		expect(text).toBe('<i>First <b>crossed</i></b>');
	});

	it.each(['I <3 you', 'a < b'])('treats literal less-than text as plain lyrics: %s', (text) => {
		expect(extractLineStyleSpans(text, { from: 0, to: text.length })).toEqual([]);
	});

	it.each(['<i', '</b'])('keeps malformed supported-tag prefixes detectable: %s', (text) => {
		expect(extractLineStyleSpans(text, { from: 0, to: text.length })).toEqual([
			{
				from: 0,
				to: text.length,
				unsupported: true,
				rawTag: text,
				reason: 'malformed-markup'
			}
		]);
	});
});
