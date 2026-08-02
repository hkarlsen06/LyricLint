import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import { escapeLegendText, serializeLegend, validateExport, wrapVoiceSpan } from './index.js';

interface LyricFixture {
	id: string;
	input: string;
}

const fixtures = JSON.parse(
	readFileSync(resolve(process.cwd(), 'fixtures/lyrics/cases.json'), 'utf8')
) as LyricFixture[];

function fixture(id: string): LyricFixture {
	const found = fixtures.find((candidate) => candidate.id === id);
	if (!found) {
		throw new Error(`Missing fixture: ${id}`);
	}
	return found;
}

describe('Genius performer serialization', () => {
	it('serializes the documented four-group legend exactly', () => {
		expect(
			serializeLegend([
				{ styleSlot: 1, members: ['A'] },
				{ styleSlot: 2, members: ['B'] },
				{ styleSlot: 3, members: ['A', 'B'] },
				{ styleSlot: 4, members: ['C'] }
			])
		).toBe('A, <i>B</i>, <b>A & B</b> & <i><b>C</b></i>');
	});

	it('escapes performer text while keeping generated member separators semantic', () => {
		expect(escapeLegendText(`A <B> & "C's"`)).toBe('A &lt;B&gt; &amp; &quot;C&#39;s&quot;');
		expect(serializeLegend([{ styleSlot: 2, members: ['Echo & The Glass', 'A <B>'] }])).toBe(
			'<i>Echo &amp; The Glass & A &lt;B&gt;</i>'
		);
	});

	it('wraps all four slots', () => {
		expect([1, 2, 3, 4].map((slot) => wrapVoiceSpan('A', slot as 1 | 2 | 3 | 4))).toEqual([
			'A',
			'<i>A</i>',
			'<b>A</b>',
			'<i><b>A</b></i>'
		]);
	});
});

describe('canonical export validation', () => {
	it('reports unsupported and malformed markup without changing source text', () => {
		const source = fixture('malformed-nested-html');
		const parsed = parseDocument(source.input);
		const validation = validateExport(source.input, parsed);

		expect(validation.valid).toBe(false);
		expect(validation.issues.some((issue) => issue.code === 'malformed-markup')).toBe(true);
		expect(validation.text).toBe(source.input);
		expect(parsed.text).toBe(source.input);
	});

	it('accepts a supported four-slot document unchanged', () => {
		const source = fixture('valid-four-voice-slots');
		const parsed = parseDocument(source.input);
		expect(validateExport(source.input, parsed)).toEqual({
			valid: true,
			issues: [],
			text: source.input
		});
	});

	it('accepts supported performer wrappers spanning lyric lines', () => {
		const input = '[Verse: A & <i>B</i>]\n<i>First line\nMiddle line\nLast line</i>';
		const parsed = parseDocument(input);

		expect(validateExport(input, parsed)).toEqual({
			valid: true,
			issues: [],
			text: input
		});
	});

	it('rejects unsupported markup embedded in a section-header name without mutation', () => {
		const input = '[<u>Verse</u>]\nLine';
		const parsed = parseDocument(input);
		const validation = validateExport(input, parsed);

		expect(validation.valid).toBe(false);
		expect(validation.issues.some((issue) => issue.code === 'unsupported-markup')).toBe(true);
		expect(validation.text).toBe(input);
		expect(parsed.text).toBe(input);
	});
});
