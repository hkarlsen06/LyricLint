import { describe, expect, it } from 'vitest';
import {
	clipboardHtml,
	lineStartOffsets,
	metadataFromClipboardHtml
} from './clipboard-metadata.js';
import type { ClipboardMetadata } from './clipboard-metadata.js';

const fragment = '[Chorus]\nHold on "tight" & <breathe>\n\n[Chorus]\nHold on "tight" & <breathe>';

const metadata: ClipboardMetadata = {
	lines: 5,
	anchors: [
		{ line: 1, time: 12.53 },
		{ line: 4, time: 41.9 }
	],
	links: [{ lines: [0, 3], holes: [{ line: 1, column: 8, endLine: 1, endColumn: 15 }] }]
};

describe('the clipboard flavor', () => {
	it('round-trips the payload through the HTML flavor', () => {
		expect(metadataFromClipboardHtml(clipboardHtml(fragment, metadata))).toEqual(metadata);
	});

	it('escapes the lyrics on the way in, so markup in a song is text and not elements', () => {
		const html = clipboardHtml(fragment, metadata);
		expect(html).not.toContain('<breathe>');
		expect(html).toContain('&lt;breathe&gt;');
	});

	it('survives the wrappers a clipboard puts around a stored fragment', () => {
		const wrapped = `<html><body><!--StartFragment-->${clipboardHtml(fragment, metadata)}<!--EndFragment--></body></html>`;
		expect(metadataFromClipboardHtml(wrapped)).toEqual(metadata);
	});

	it('reads no metadata out of anybody else’s HTML', () => {
		expect(metadataFromClipboardHtml('')).toBeUndefined();
		expect(metadataFromClipboardHtml('<b>Hold on tight</b>')).toBeUndefined();
		expect(
			metadataFromClipboardHtml('<div data-lyriclint="not json"><pre>x</pre></div>')
		).toBeUndefined();
	});

	it('refuses a payload from a version it does not speak', () => {
		const html = clipboardHtml(fragment, metadata).replace('&quot;v&quot;:1', '&quot;v&quot;:2');
		expect(metadataFromClipboardHtml(html)).toBeUndefined();
	});

	it('drops what it cannot read and keeps the rest', () => {
		const payload = {
			v: 1,
			lines: 3,
			anchors: [
				{ line: 0, time: 5 },
				{ line: 7, time: 9 }, // outside the fragment
				{ line: 0, time: 11 }, // a second claim on a claimed line
				{ line: 1, time: -2 } // before the song started
			],
			links: [
				{ lines: [0, 2], holes: [{ line: 1, column: 4, endLine: 1, endColumn: 2 }] }, // hole runs backwards
				{ lines: [0] } // fewer than two members is not a link
			]
		};
		const html = `<div data-lyriclint="${JSON.stringify(payload).replaceAll('"', '&quot;')}"></div>`;
		expect(metadataFromClipboardHtml(html)).toEqual({
			lines: 3,
			anchors: [{ line: 0, time: 5 }],
			links: [{ lines: [0, 2] }]
		});
	});

	it('reads a payload with nothing in it as no metadata at all', () => {
		const html = clipboardHtml('one line', { lines: 1, anchors: [], links: [] });
		expect(metadataFromClipboardHtml(html)).toBeUndefined();
	});

	it('carries a remote source and round-trips it', () => {
		const withMedia = {
			...metadata,
			media: { kind: 'youtube' as const, id: 'dQw4w9WgXcQ', name: 'Artist — Title' }
		};
		expect(metadataFromClipboardHtml(clipboardHtml(fragment, withMedia))).toEqual(withMedia);
	});

	it('drops a source it cannot read, and a name that is not one, keeping the rest', () => {
		const payload = {
			v: 1,
			lines: 1,
			anchors: [{ line: 0, time: 5 }],
			links: [],
			media: { kind: 'soundcloud', id: 'x' }
		};
		const html = `<div data-lyriclint="${JSON.stringify(payload).replaceAll('"', '&quot;')}"></div>`;
		expect(metadataFromClipboardHtml(html)).toEqual({
			lines: 1,
			anchors: [{ line: 0, time: 5 }],
			links: []
		});

		const blankName = {
			...payload,
			media: { kind: 'spotify', id: '6rqhFgbbKwnb9MLmUQDhG6', name: '   ' }
		};
		const blankHtml = `<div data-lyriclint="${JSON.stringify(blankName).replaceAll('"', '&quot;')}"></div>`;
		expect(metadataFromClipboardHtml(blankHtml)?.media).toEqual({
			kind: 'spotify',
			id: '6rqhFgbbKwnb9MLmUQDhG6'
		});
	});

	it('reads a payload that is only a source as metadata', () => {
		const html = clipboardHtml('one line', {
			lines: 1,
			anchors: [],
			links: [],
			media: { kind: 'apple', id: '1091453645' }
		});
		expect(metadataFromClipboardHtml(html)).toEqual({
			lines: 1,
			anchors: [],
			links: [],
			media: { kind: 'apple', id: '1091453645' }
		});
	});

	it('counts line starts the way the document splits lines', () => {
		expect(lineStartOffsets('a\nbc\n\nd')).toEqual([0, 2, 5, 6]);
		expect(lineStartOffsets('ends with break\n')).toEqual([0, 16]);
		expect(lineStartOffsets('')).toEqual([0]);
	});
});
