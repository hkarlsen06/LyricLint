import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SupportedStyleSpan } from './types.js';
import { parseDocument } from './parser.js';

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

function isSurrogateBoundary(text: string, offset: number): boolean {
	if (offset <= 0 || offset >= text.length) {
		return true;
	}

	const previous = text.charCodeAt(offset - 1);
	const next = text.charCodeAt(offset);
	const previousIsHigh = previous >= 0xd800 && previous <= 0xdbff;
	const nextIsLow = next >= 0xdc00 && next <= 0xdfff;
	return !(previousIsHigh && nextIsLow);
}

describe('parseDocument', () => {
	it('recovers without throwing for every synthetic fixture', () => {
		for (const { id, input } of fixtures) {
			expect(() => parseDocument(input), id).not.toThrow();
			expect(parseDocument(input).text, id).toBe(input);
		}
	});

	it('partitions representative documents into blank-line sections', () => {
		const single = parseDocument(fixture('valid-single-performer').input);
		const missing = parseDocument(fixture('missing-section-header').input);
		const arabic = parseDocument(fixture('rtl-arabic-document').input);

		expect(single.sections).toHaveLength(2);
		expect(single.sections.map((section) => section.header?.name)).toEqual(['Verse', 'Chorus']);
		expect(single.sections[0]?.header?.ordinal).toBe(1);
		expect(missing.sections).toHaveLength(2);
		expect(missing.sections[1]?.header).toBeUndefined();
		expect(arabic.sections).toHaveLength(2);
		expect(arabic.sections.map((section) => section.header?.name)).toEqual(['المقطع', 'اللازمة']);
	});

	it('records exact header name and legend ranges', () => {
		const input = fixture('valid-four-voice-slots').input;
		const document = parseDocument(input);
		const header = document.sections[0]?.header;

		expect(header?.name).toBe('Chorus');
		expect(header?.raw).toBe('[Chorus: Avery, <i>Blair</i>, <b>Casey</b> & <i><b>Devon</b></i>]');
		expect(header?.legend).toBe('Avery, <i>Blair</i>, <b>Casey</b> & <i><b>Devon</b></i>');
		expect(input.slice(header?.legendRange?.from, header?.legendRange?.to)).toBe(header?.legend);
		expect(header?.legendGroups.map((group) => group.styleSlot)).toEqual([1, 2, 3, 4]);
	});

	it('recovers a missing closing bracket at its exact insertion point', () => {
		const input = fixture('unbalanced-section-bracket').input;
		const document = parseDocument(input);
		const lineEnd = input.indexOf('\n');
		const issue = document.syntaxIssues.find(
			(candidate) => candidate.code === 'unbalanced-section-bracket'
		);

		expect(document.text).toBe(input);
		expect(document.sections).toHaveLength(1);
		expect(document.sections[0]?.header?.raw).toBe('[Chorus: Avery');
		expect(document.sections[0]?.header?.closed).toBe(false);
		expect(issue).toMatchObject({ from: lineEnd, to: lineEnd, raw: '' });
	});

	it('preserves crossed markup and reports each exact malformed tag range', () => {
		const input = fixture('malformed-nested-html').input;
		const document = parseDocument(input);
		const closingItalic = input.lastIndexOf('</i>');
		const issue = document.syntaxIssues.find((candidate) => candidate.raw === '</i>');

		expect(document.text).toBe(input);
		expect(document.sections[0]?.lines[0]?.text).toBe(
			'<i>First voice <b>crosses the boundary</i></b>'
		);
		expect(issue).toMatchObject({
			code: 'malformed-markup',
			from: closingItalic,
			to: closingItalic + '</i>'.length,
			raw: '</i>'
		});
	});

	it('parses a supported performer wrapper across physical lyric lines', () => {
		const input = '[Verse: A & <i>B</i>]\n<i>First line\nMiddle line\nLast line</i>\nPlain';
		const document = parseDocument(input);
		const lines = document.sections[0]?.lines ?? [];
		const supported = lines.flatMap((line) =>
			line.styleSpans.filter((span): span is SupportedStyleSpan => !('unsupported' in span))
		);

		expect(document.syntaxIssues).toEqual([]);
		expect(
			supported.map((span) => ({
				content: input.slice(span.contentFrom, span.contentTo),
				fromPrevious: span.continuedFromPreviousLine ?? false,
				toNext: span.continuesToNextLine ?? false
			}))
		).toEqual([
			{ content: 'First line', fromPrevious: false, toNext: true },
			{ content: 'Middle line', fromPrevious: true, toNext: true },
			{ content: 'Last line', fromPrevious: true, toNext: false }
		]);
		expect(lines[3]?.styleSpans).toEqual([]);
	});

	it('keeps CRLF line endings and absolute offsets exact', () => {
		const input = fixture('autosave-recovery-unicode').input;
		const document = parseDocument(input);
		const firstLine = document.sections[0]?.lines[0];
		const secondLine = document.sections[0]?.lines[1];

		expect(firstLine?.lineEnding).toBe('crlf');
		expect(input.slice(firstLine?.lineEndingRange.from, firstLine?.lineEndingRange.to)).toBe(
			'\r\n'
		);
		expect(input.slice(firstLine?.from, firstLine?.to)).toBe("Don't lose this line");
		expect(secondLine?.from).toBe((firstLine?.to ?? 0) + 2);
		expect(input.slice(secondLine?.from, secondLine?.to)).toBe('<i>Keep the spacing, too</i>');
	});

	it.each(['rtl-arabic-document', 'cjk-ime-content', 'emoji-and-combining-marks'])(
		'uses sane UTF-16 line ranges for %s',
		(id) => {
			const input = fixture(id).input;
			const document = parseDocument(input);
			const lines = document.sections.flatMap((section) => section.lines);

			expect(lines.length).toBeGreaterThan(0);
			for (const line of lines) {
				expect(input.slice(line.from, line.to)).toBe(line.text);
				expect(isSurrogateBoundary(input, line.from)).toBe(true);
				expect(isSurrogateBoundary(input, line.to)).toBe(true);
			}
		}
	);

	it.each(['[Verse]\nI <3 you', '[Verse]\na < b'])(
		'does not report literal less-than lyric text as markup: %s',
		(input) => {
			const document = parseDocument(input);

			expect(document.syntaxIssues).toEqual([]);
			expect(document.sections[0]?.lines[0]?.styleSpans).toEqual([]);
		}
	);
});
