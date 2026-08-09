import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EditorHandle } from '$lib/core/types.js';
import type {
	ClipboardMediaSource,
	EditorDisplayContext,
	LyricEditorCallbacks
} from './contracts.js';
import { clipboardHtml, metadataFromClipboardHtml } from './clipboard-metadata.js';
import type { ClipboardMetadata } from './clipboard-metadata.js';
import EditorPane from './EditorPane.svelte';

function context(): EditorDisplayContext {
	return {
		language: 'en',
		performers: [],
		ruleSetVersion: 'clipboard-test',
		diagnostics: { revision: 0, items: [] }
	};
}

async function mount(options: {
	text: string;
	selection?: { anchor: number; head: number };
	/** What the shell's media store would answer for this draft's remote source. */
	mediaSource?: () => ClipboardMediaSource | undefined;
}) {
	let handle: EditorHandle | undefined;
	let lastText = options.text;
	const linksChanged = vi.fn();
	const sourcePasted = vi.fn();
	const callbacks: LyricEditorCallbacks = {
		onSnapshot: (snapshot) => {
			lastText = snapshot.text;
		},
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onAnnouncement: vi.fn(),
		onSectionLinksChanged: linksChanged,
		onRequestMediaSource: options.mediaSource ?? (() => undefined),
		onMediaSourcePasted: sourcePasted
	};

	await render(EditorPane, {
		props: {
			initialText: options.text,
			initialSelection: options.selection,
			context: context(),
			callbacks,
			onready: (ready: EditorHandle) => {
				handle = ready;
			}
		}
	});
	await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	if (!handle) throw new Error('CodeMirror did not publish its editor handle.');
	return { handle, linksChanged, sourcePasted, text: () => lastText };
}

function content(): HTMLElement {
	const element = document.querySelector<HTMLElement>('.cm-content');
	if (!element) throw new Error('no editor content');
	return element;
}

/**
 * A copy is only the editor's when the live DOM selection is inside it — the
 * guard both CodeMirror's handler and this extension read — so a test that
 * copies has to stand where a user stands: focused, with the selection synced
 * into the document.
 */
async function focusEditor(): Promise<void> {
	content().focus();
	await vi.waitFor(() => {
		const anchor = document.getSelection()?.anchorNode;
		const inside =
			anchor && content().contains(anchor.nodeType === Node.TEXT_NODE ? anchor.parentNode : anchor);
		if (!inside) throw new Error('the DOM selection has not reached the editor yet');
	});
	// CodeMirror's own handler reads the *observer's* cached copy of that
	// selection, which trails the live one by a measure cycle.
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/**
 * A synthetic clipboard event over a real `DataTransfer`, dispatched on the
 * content the way a browser would. CodeMirror's own handlers run on it too,
 * which is the point: the tests below assert what the whole pipeline leaves on
 * the transfer, not what this extension alone would have written.
 */
function clipboard(type: 'copy' | 'cut' | 'paste', transfer = new DataTransfer()) {
	const event = new ClipboardEvent(type, {
		clipboardData: transfer,
		cancelable: true,
		bubbles: true
	});
	content().dispatchEvent(event);
	return { event, transfer };
}

/** Two choruses that differ by one word, the shape links were rebuilt for. */
const song =
	'[Chorus]\nHold on tight\nThrough the night\n\n[Chorus]\nHold on tight\nThrough the rain';

const carried: ClipboardMetadata = {
	lines: 7,
	anchors: [
		{ line: 1, time: 12.53 },
		{ line: 5, time: 41.9 }
	],
	links: [
		{
			lines: [0, 4],
			holes: [
				{ line: 2, column: 12, endLine: 2, endColumn: 17 },
				{ line: 6, column: 12, endLine: 6, endColumn: 16 }
			]
		}
	]
};

describe('copy', () => {
	it('carries timings and links in a second flavor, and the plain text is byte-identical', async () => {
		const { handle } = await mount({
			text: song,
			selection: { anchor: 0, head: song.length }
		});
		handle.setLineAnchors?.([
			{ line: 2, time: 12.53 },
			{ line: 6, time: 41.9 }
		]);
		handle.setSectionLinks?.([{ lines: [1, 5] }]);

		await focusEditor();
		const { event, transfer } = clipboard('copy');

		expect(event.defaultPrevented).toBe(true);
		// The promise the whole feature hangs off: an ordinary text field sees
		// exactly what it always saw.
		expect(transfer.getData('text/plain')).toBe(song);
		expect(metadataFromClipboardHtml(transfer.getData('text/html'))).toEqual({
			lines: 7,
			anchors: [
				{ line: 1, time: 12.53 },
				{ line: 5, time: 41.9 }
			],
			links: [{ lines: [0, 4] }]
		});
	});

	it('is left to CodeMirror when there is nothing to carry', async () => {
		await mount({ text: song, selection: { anchor: 9, head: 22 } });

		await focusEditor();
		const { transfer } = clipboard('copy');

		expect(transfer.getData('text/plain')).toBe('Hold on tight');
		expect(transfer.getData('text/html')).toBe('');
	});

	it('carries the remote source as a rider on a copy that already carries timings', async () => {
		const { handle } = await mount({
			text: song,
			selection: { anchor: 0, head: song.length },
			mediaSource: () => ({ kind: 'youtube', id: 'dQw4w9WgXcQ', name: 'Artist — Title' })
		});
		handle.setLineAnchors?.([{ line: 2, time: 12.53 }]);

		await focusEditor();
		const { transfer } = clipboard('copy');

		expect(transfer.getData('text/plain')).toBe(song);
		expect(metadataFromClipboardHtml(transfer.getData('text/html'))?.media).toEqual({
			kind: 'youtube',
			id: 'dQw4w9WgXcQ',
			name: 'Artist — Title'
		});
	});

	it('does not let the source alone claim a copy that is only words', async () => {
		await mount({
			text: song,
			selection: { anchor: 9, head: 22 },
			mediaSource: () => ({ kind: 'youtube', id: 'dQw4w9WgXcQ' })
		});

		await focusEditor();
		const { transfer } = clipboard('copy');

		expect(transfer.getData('text/plain')).toBe('Hold on tight');
		expect(transfer.getData('text/html')).toBe('');
	});

	it('drops a link whose group is not wholly inside the selection', async () => {
		const endOfFirstChorus = song.indexOf('\n\n[Chorus]');
		const { handle } = await mount({
			text: song,
			selection: { anchor: 0, head: endOfFirstChorus }
		});
		handle.setLineAnchors?.([{ line: 2, time: 12.53 }]);
		handle.setSectionLinks?.([{ lines: [1, 5] }]);

		await focusEditor();
		const { transfer } = clipboard('copy');

		expect(transfer.getData('text/plain')).toBe(song.slice(0, endOfFirstChorus));
		expect(metadataFromClipboardHtml(transfer.getData('text/html'))).toEqual({
			lines: 3,
			anchors: [{ line: 1, time: 12.53 }],
			links: []
		});
	});
});

describe('paste', () => {
	it('lands the text, its timings, and its link, and tells the shell', async () => {
		const { handle, linksChanged, text } = await mount({ text: '' });
		const transfer = new DataTransfer();
		transfer.setData('text/plain', song);
		transfer.setData('text/html', clipboardHtml(song, carried));

		const { event } = clipboard('paste', transfer);

		expect(event.defaultPrevented).toBe(true);
		expect(text()).toBe(song);
		expect(handle.getLineAnchors?.()).toEqual([
			{ line: 2, time: 12.53 },
			{ line: 6, time: 41.9 }
		]);
		expect(handle.getSectionLinks?.()).toEqual([
			{
				lines: [1, 5],
				holes: [
					{ line: 3, column: 12, endLine: 3, endColumn: 17 },
					{ line: 7, column: 12, endLine: 7, endColumn: 16 }
				]
			}
		]);
		expect(linksChanged).toHaveBeenCalled();
	});

	it('hands a carried source to the shell instead of acting on it', async () => {
		const { sourcePasted, text } = await mount({ text: '' });
		const transfer = new DataTransfer();
		transfer.setData('text/plain', song);
		transfer.setData(
			'text/html',
			clipboardHtml(song, {
				...carried,
				media: { kind: 'apple', id: '1091453645', name: 'Artist — Title' }
			})
		);

		clipboard('paste', transfer);

		expect(text()).toBe(song);
		expect(sourcePasted).toHaveBeenCalledExactlyOnceWith({
			kind: 'apple',
			id: '1091453645',
			name: 'Artist — Title'
		});
	});

	it('leaves a plain paste, and anybody else’s HTML, to CodeMirror', async () => {
		const { handle, text } = await mount({ text: '' });
		const transfer = new DataTransfer();
		transfer.setData('text/plain', 'Hold on tight');
		transfer.setData('text/html', '<b>Hold on tight</b>');

		clipboard('paste', transfer);

		expect(text()).toBe('Hold on tight');
		expect(handle.getLineAnchors?.()).toEqual([]);
		expect(handle.getSectionLinks?.()).toEqual([]);
	});

	it('applies the text alone when the plain flavor no longer matches the payload', async () => {
		const { handle, text } = await mount({ text: '' });
		const transfer = new DataTransfer();
		transfer.setData('text/plain', 'One line only');
		transfer.setData(
			'text/html',
			clipboardHtml('One line only', { lines: 7, anchors: [{ line: 1, time: 3 }], links: [] })
		);

		clipboard('paste', transfer);

		expect(text()).toBe('One line only');
		expect(handle.getLineAnchors?.()).toEqual([]);
	});

	it('undo takes back the paste, links and all', async () => {
		const { handle, text } = await mount({ text: '' });
		const transfer = new DataTransfer();
		transfer.setData('text/plain', song);
		transfer.setData('text/html', clipboardHtml(song, carried));
		clipboard('paste', transfer);
		expect(text()).toBe(song);

		content().focus();
		await userEvent.keyboard('{Control>}z{/Control}');
		await userEvent.keyboard('{Control>}z{/Control}');

		expect(text()).toBe('');
		expect(handle.getLineAnchors?.()).toEqual([]);
		expect(handle.getSectionLinks?.()).toEqual([]);
	});
});

describe('cut', () => {
	it('carries the metadata out and removes the selection', async () => {
		const secondChorus = song.indexOf('[Chorus]\nHold on tight\nThrough the rain');
		const { handle, text } = await mount({
			text: song,
			selection: { anchor: secondChorus, head: song.length }
		});
		handle.setLineAnchors?.([{ line: 6, time: 41.9 }]);

		await focusEditor();
		const { transfer } = clipboard('cut');

		expect(transfer.getData('text/plain')).toBe('[Chorus]\nHold on tight\nThrough the rain');
		expect(metadataFromClipboardHtml(transfer.getData('text/html'))).toEqual({
			lines: 3,
			anchors: [{ line: 1, time: 41.9 }],
			links: []
		});
		expect(text()).toBe(song.slice(0, secondChorus));
		expect(handle.getLineAnchors?.()).toEqual([]);
	});
});
