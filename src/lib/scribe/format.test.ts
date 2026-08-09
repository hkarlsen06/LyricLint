import { describe, expect, test } from 'vitest';
import { parseScribe, ScribeFormatError, serializeScribe } from './format.js';

const input = {
	title: 'Sensommer',
	language: 'no',
	lyrics: '[Refreng: Mul]\nEn linje\n\n[Refreng: Mul]\nEn linje',
	originalText: '[Chorus: Mul]\nEn linje\n\n[Chorus: Mul]\nEn linje',
	selection: { anchor: 2, head: 7 },
	compareBaseline: { text: '[Refreng]\nEn annen linje', pastedAt: '2026-08-09T10:00:00.000Z' },
	performers: [
		{
			id: 'mul',
			displayName: 'Mul',
			normalizedKey: 'mul',
			aliases: ['MUL'],
			colorId: 'plum',
			order: 0
		}
	],
	sectionLinks: [
		{
			lines: [1, 4],
			holes: [{ line: 2, column: 0, endLine: 2, endColumn: 2 }]
		}
	],
	lineAnchors: [{ line: 2, time: 12.5 }],
	ignoredDiagnostics: ['second', 'first', 'first'],
	song: { kind: 'youtube' as const, id: 'dQw4w9WgXcQ', name: 'Mul — Sensommer' }
};

describe('LyricLint Scribe format', () => {
	test('round-trips every durable project field with its magic identifier and version', () => {
		const serialized = serializeScribe(input);
		const raw = JSON.parse(serialized) as Record<string, unknown>;

		expect(raw.format).toBe('LYRICLINT_SCRIBE');
		expect(raw.version).toBe(1);
		expect(parseScribe(serialized)).toEqual({
			format: 'LYRICLINT_SCRIBE',
			version: 1,
			document: {
				title: input.title,
				language: input.language,
				lyrics: input.lyrics,
				originalText: input.originalText,
				selection: input.selection,
				compareBaseline: input.compareBaseline
			},
			performers: input.performers,
			sectionLinks: input.sectionLinks,
			lineAnchors: input.lineAnchors,
			ignoredDiagnostics: ['first', 'second'],
			song: input.song
		});
	});

	test('accepts unknown fields for forward-compatible additions', () => {
		const raw = JSON.parse(serializeScribe(input));
		raw.future = { anything: true };
		raw.document.future = 'kept out of the current model';

		expect(parseScribe(JSON.stringify(raw)).document.lyrics).toBe(input.lyrics);
	});

	test.each([
		['renamed JSON', '{"format":"OTHER","version":1}'],
		['malformed JSON', '{'],
		['newer version', JSON.stringify({ ...JSON.parse(serializeScribe(input)), version: 2 })],
		[
			'invalid nested data',
			JSON.stringify({ ...JSON.parse(serializeScribe(input)), lineAnchors: [{ line: 0, time: 1 }] })
		]
	])('rejects %s before it can become project state', (_case, source) => {
		expect(() => parseScribe(source)).toThrow(ScribeFormatError);
	});
});
