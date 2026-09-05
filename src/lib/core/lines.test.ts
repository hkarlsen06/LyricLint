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
		expect(spans.map((span) => span.from)).toEqual([22, 31, 40]);
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
	});

	it.each(['I <3 you', 'a < b'])('treats literal less-than text as plain lyrics: %s', (text) => {
		expect(extractLineStyleSpans(text, { from: 0, to: text.length })).toEqual([]);
	});

	// The scan for the next markup start probes each `<` where it stands rather
	// than copying the rest of the text to it, which was quadratic on a line this
	// shape. The probes are sticky regexes, so the hazard the run of rejected
	// candidates pins is a `lastIndex` carried from one `<` to the next.
	it('finds a real wrapper past a run of rejected less-than candidates', () => {
		const text = `${'I <3 you, '.repeat(500)}<i>tonight</i>`;
		const spans = extractLineStyleSpans(text, { from: 0, to: text.length });

		expect(spans).toHaveLength(1);
		expect(spans[0]).toMatchObject({
			from: text.indexOf('<i>'),
			to: text.length,
			slot: 2
		});
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
