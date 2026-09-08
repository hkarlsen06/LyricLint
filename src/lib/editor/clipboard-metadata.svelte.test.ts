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
			links: [
				{
					lines: [0, 4],
					holes: [
						{ line: 0, column: 8, endLine: 2, endColumn: 17 },
						{ line: 4, column: 8, endLine: 6, endColumn: 16 }
					],
					passages: [
						{
							members: [
								{ headerLine: 0, line: 0, column: 8, endLine: 2, endColumn: 12 },
								{ headerLine: 4, line: 4, column: 8, endLine: 6, endColumn: 12 }
							]
						}
					],
					detached: [
						{ headerLine: 0, line: 2, column: 12, endLine: 2, endColumn: 17 },
						{ headerLine: 4, line: 6, column: 12, endLine: 6, endColumn: 16 }
					]
				}
			]
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
	it('restores stored word connections after paste and mirrors an edit across different lines', async () => {
		const prefix = '[Verse]\nLocal\n\n';
		const fragment = '[Intro]\nVin i et badekar, ri-ri\n\n[Chorus]\nVin i et badekar';
		const payload: ClipboardMetadata = {
			lines: 5,
			anchors: [],
			links: [
				{
					lines: [0, 3],
					passages: [
						{
							members: [
								{ headerLine: 0, line: 1, column: 9, endLine: 1, endColumn: 16 },
								{ headerLine: 3, line: 4, column: 9, endLine: 4, endColumn: 16 }
							]
						}
					],
					detached: []
				}
			]
		};
		const { handle, text } = await mount({
			text: prefix,
			selection: { anchor: prefix.length, head: prefix.length }
		});
		const transfer = new DataTransfer();
		transfer.setData('text/plain', fragment);
		transfer.setData('text/html', clipboardHtml(fragment, payload));
		clipboard('paste', transfer);
		expect(handle.getSectionLinks?.()[0]?.passages).toEqual([
			{
				members: [
					{ headerLine: 4, line: 5, column: 9, endLine: 5, endColumn: 16 },
					{ headerLine: 7, line: 8, column: 9, endLine: 8, endColumn: 16 }
				]
			}
		]);
		const from = text().indexOf('badekar');
		handle.setSelection({ anchor: from, head: from + 7 });
		await focusEditor();
		await userEvent.keyboard('badeker');
		expect(text()).toBe(prefix + fragment.replaceAll('badekar', 'badeker'));
	});

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
					{ line: 1, column: 8, endLine: 3, endColumn: 17 },
					{ line: 5, column: 8, endLine: 7, endColumn: 16 }
				],
				passages: [
					{
						members: [
							{ headerLine: 1, line: 1, column: 8, endLine: 3, endColumn: 12 },
							{ headerLine: 5, line: 5, column: 8, endLine: 7, endColumn: 12 }
						]
					}
				],
				detached: [
					{ headerLine: 1, line: 3, column: 12, endLine: 3, endColumn: 17 },
					{ headerLine: 5, line: 7, column: 12, endLine: 7, endColumn: 16 }
				]
			}
		]);
		expect(linksChanged).toHaveBeenCalled();
	});

	// A run is measured against the fragment's own lines, and one that does not fit
	// them is dropped rather than clamped to the line it landed in. Pasted in front
	// of text that was already there, the last fragment line is a prefix of a longer
	// document line — so a payload overshooting it is claiming words the copy never
	// carried, which would draw a difference over the draft's own text.
	it('drops a carried run that does not fit the fragment’s own lines', async () => {
		const { handle, text } = await mount({ text: 'tail', selection: { anchor: 0, head: 0 } });
		const forged: ClipboardMetadata = {
			...carried,
			links: [
				{
					lines: [0, 4],
					holes: [
						{ line: 2, column: 12, endLine: 2, endColumn: 17 },
						{ line: 6, column: 12, endLine: 6, endColumn: 999 }
					]
				}
			]
		};
		const transfer = new DataTransfer();
		transfer.setData('text/plain', song);
		transfer.setData('text/html', clipboardHtml(song, forged));

		clipboard('paste', transfer);

		expect(text()).toBe(`${song}tail`);
		// Dropping the overshoot leaves mismatched legacy holes: suspend that shape
		// rather than guessing which text its missing counterpart used to protect.
		expect(handle.getSectionLinks?.()[0]?.passages).toEqual([]);
		const from = text().indexOf('Hold');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to: from + 4, insert: 'Keep' }]
		});
		expect(text()).toBe(`${song.replace('Hold', 'Keep')}tail`);
	});

	it('preserves deliberately local matching words from a legacy clipboard', async () => {
		const fragment = '[Chorus]\nHold on tight\n\n[Chorus]\nHold on tight';
		const metadata: ClipboardMetadata = {
			lines: 5,
			anchors: [],
			links: [
				{
					lines: [0, 3],
					holes: [
						{ line: 1, column: 8, endLine: 1, endColumn: 13 },
						{ line: 4, column: 8, endLine: 4, endColumn: 13 }
					]
				}
			]
		};
		const { handle, text } = await mount({ text: '' });
		const transfer = new DataTransfer();
		transfer.setData('text/plain', fragment);
		transfer.setData('text/html', clipboardHtml(fragment, metadata));
		clipboard('paste', transfer);
		const from = text().indexOf('tight');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to: from + 5, insert: 'close' }]
		});
		expect(text()).toBe(fragment.replace('tight', 'close'));
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

	it('drops carried timings that would land behind the anchor above the paste', async () => {
		const verse = 'First line\nSecond line\nThird line\nFourth line';
		const atEnd = verse.length;
		const { handle, text } = await mount({
			text: verse,
			selection: { anchor: atEnd, head: atEnd }
		});
		handle.setLineAnchors?.([
			{ line: 1, time: 10 },
			{ line: 2, time: 20 },
			{ line: 3, time: 30 },
			{ line: 4, time: 40 }
		]);

		const fragment = 'First line\nSecond line';
		const transfer = new DataTransfer();
		transfer.setData('text/plain', `\n${fragment}`);
		transfer.setData(
			'text/html',
			clipboardHtml(`\n${fragment}`, {
				lines: 3,
				anchors: [
					{ line: 1, time: 10 },
					{ line: 2, time: 20 }
				],
				links: []
			})
		);

		clipboard('paste', transfer);

		expect(text()).toBe(`${verse}\n${fragment}`);
		expect(handle.getLineAnchors?.()).toEqual([
			{ line: 1, time: 10 },
			{ line: 2, time: 20 },
			{ line: 3, time: 30 },
			{ line: 4, time: 40 }
		]);
	});

	it('keeps a carried timing that still runs forward between its new neighbours', async () => {
		const verse = 'First line\nSecond line\nFourth line';
		const atStartOfThird = 'First line\nSecond line\n'.length;
		const { handle, text } = await mount({
			text: verse,
			selection: { anchor: atStartOfThird, head: atStartOfThird }
		});
		handle.setLineAnchors?.([
			{ line: 1, time: 10 },
			{ line: 3, time: 40 }
		]);

		const transfer = new DataTransfer();
		transfer.setData('text/plain', 'Third line\n');
		transfer.setData(
			'text/html',
			clipboardHtml('Third line\n', { lines: 2, anchors: [{ line: 0, time: 20 }], links: [] })
		);

		clipboard('paste', transfer);

		expect(text()).toBe('First line\nSecond line\nThird line\nFourth line');
		expect(handle.getLineAnchors?.()).toEqual([
			{ line: 1, time: 10 },
			{ line: 3, time: 20 },
			{ line: 4, time: 40 }
		]);
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

describe('external replacement paste', () => {
	it('retains matching corrections at both edges of a shared body', async () => {
		const original =
			'[Chorus]\nHold on through the night, tight\n\n[Chorus]\nHold on through the night, tight';
		const { handle, text } = await mount({
			text: original,
			selection: { anchor: 0, head: original.length }
		});
		handle.setSectionLinks?.([{ lines: [1, 4] }]);
		const updated = original.replaceAll('Hold', 'Stay').replaceAll('tight', 'close');
		const transfer = new DataTransfer();
		transfer.setData('text/plain', updated);
		clipboard('paste', transfer);

		expect(text()).toBe(updated);
		const from = updated.indexOf('close');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to: from + 5, insert: 'near' }]
		});
		expect(text()).toBe(updated.replaceAll('close', 'near'));
		const start = text().indexOf('Stay');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: start, to: start + 4, insert: 'Keep' }]
		});
		expect(text()).toBe(updated.replaceAll('close', 'near').replaceAll('Stay', 'Keep'));
	});

	it.each(['plain', 'foreign HTML'])(
		'retains known links after an unchanged %s paste',
		async (flavor) => {
			const { handle, text, linksChanged } = await mount({
				text: song,
				selection: { anchor: 0, head: song.length }
			});
			handle.setSectionLinks?.([{ lines: [1, 5] }]);
			const before = handle.getSectionLinks?.();
			linksChanged.mockClear();
			const transfer = new DataTransfer();
			transfer.setData('text/plain', song);
			if (flavor === 'foreign HTML') transfer.setData('text/html', `<pre>${song}</pre>`);

			clipboard('paste', transfer);

			expect(text()).toBe(song);
			expect(handle.getSectionLinks?.()).toEqual(before);
			expect(linksChanged).toHaveBeenCalled();
			const from = song.indexOf('tight');
			handle.dispatchAtomic({
				baseRevision: handle.getSnapshot().revision,
				edits: [{ from, to: from + 5, insert: 'close' }]
			});
			expect(text()).toBe(song.replaceAll('tight', 'close'));
		}
	);

	it('maps corrected lyrics and shifted headers without mirroring the paste itself', async () => {
		const { handle, text } = await mount({
			text: song,
			selection: { anchor: 0, head: song.length }
		});
		handle.setSectionLinks?.([{ lines: [1, 5] }]);
		const updated =
			'[Intro]\nJust arrived\n\n' + song.replaceAll('tight', 'close').replace('rain', 'storm');
		const transfer = new DataTransfer();
		transfer.setData('text/plain', updated);
		transfer.setData('text/html', `<pre>${updated}</pre>`);

		clipboard('paste', transfer);

		expect(text()).toBe(updated);
		expect(handle.getSectionLinks?.().map((link) => link.lines)).toEqual([[4, 8]]);
		const from = updated.indexOf('close');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to: from + 5, insert: 'near' }]
		});
		expect(text()).toBe(updated.replaceAll('close', 'near'));
	});

	it.each(['local words', 'no shared passages', 'empty shared position'])(
		'preserves stored intent on exact paste: %s',
		async (intent) => {
			const original = '[Chorus]\nHold on tight\n\n[Chorus]\nHold on tight';
			const { handle, text } = await mount({
				text: original,
				selection: { anchor: 0, head: original.length }
			});
			const local = [
				{ headerLine: 1, line: 2, column: 8, endLine: 2, endColumn: 13 },
				{ headerLine: 4, line: 5, column: 8, endLine: 5, endColumn: 13 }
			];
			handle.setSectionLinks?.([
				{
					lines: [1, 4],
					passages:
						intent === 'no shared passages'
							? []
							: [
									{
										members: local.map((member) => ({
											...member,
											column: intent === 'empty shared position' ? 8 : 0,
											endColumn: 8
										}))
									}
								],
					detached: intent === 'local words' ? local : []
				}
			]);
			const before = handle.getSectionLinks?.();
			const transfer = new DataTransfer();
			transfer.setData('text/plain', original);

			clipboard('paste', transfer);

			expect(handle.getSectionLinks?.()).toEqual(before);
			const from = original.indexOf('tight');
			handle.dispatchAtomic({
				baseRevision: handle.getSnapshot().revision,
				edits: [{ from, to: intent === 'empty shared position' ? from : from + 5, insert: 'close' }]
			});
			expect(text()).toBe(
				intent === 'empty shared position'
					? original.replaceAll('tight', 'closetight')
					: original.replace('tight', 'close')
			);
		}
	);

	it('drops links for unrelated lyrics with the same headers', async () => {
		const { handle, text } = await mount({
			text: song,
			selection: { anchor: 0, head: song.length }
		});
		handle.setSectionLinks?.([{ lines: [1, 5] }]);
		const updated =
			'[Chorus]\nAmber clouds gather\nQuiet birds fly\n\n[Chorus]\nAmber clouds gather\nQuiet birds fly';
		const transfer = new DataTransfer();
		transfer.setData('text/plain', updated);

		clipboard('paste', transfer);

		expect(text()).toBe(updated);
		expect(handle.getSectionLinks?.()).toEqual([]);
	});

	it('keeps previously local words independent when the paste gives both copies the same correction', async () => {
		const original = '[Chorus]\nHold on tight\n\n[Chorus]\nHold on tight';
		const { handle, text } = await mount({
			text: original,
			selection: { anchor: 0, head: original.length }
		});
		handle.setSectionLinks?.([
			{
				lines: [1, 4],
				holes: [
					{ line: 2, column: 8, endLine: 2, endColumn: 13 },
					{ line: 5, column: 8, endLine: 5, endColumn: 13 }
				]
			}
		]);
		const updated = original.replaceAll('tight', 'close');
		const transfer = new DataTransfer();
		transfer.setData('text/plain', updated);
		clipboard('paste', transfer);
		expect(text()).toBe(updated);
		expect(handle.getSectionLinks?.()[0]?.lines).toEqual([1, 4]);
		const from = updated.indexOf('close');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to: from + 5, insert: 'near' }]
		});
		expect(text()).toBe(updated.replace('close', 'near'));
		const shared = text().indexOf('Hold');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: shared, to: shared + 4, insert: 'Keep' }]
		});
		expect(text()).toBe(updated.replace('close', 'near').replaceAll('Hold', 'Keep'));
	});

	it('honors carried metadata instead of recovering the replaced draft’s links', async () => {
		const { handle, text } = await mount({
			text: song,
			selection: { anchor: 0, head: song.length }
		});
		handle.setSectionLinks?.([{ lines: [1, 5] }]);
		const transfer = new DataTransfer();
		transfer.setData('text/plain', song);
		transfer.setData(
			'text/html',
			clipboardHtml(song, { lines: 7, anchors: [{ line: 1, time: 12 }], links: [] })
		);

		clipboard('paste', transfer);

		expect(text()).toBe(song);
		expect(handle.getLineAnchors?.()).toEqual([{ line: 2, time: 12 }]);
		expect(handle.getSectionLinks?.()).toEqual([]);
	});

	it('retains unaffected peers when the paste changes only one formerly shared copy', async () => {
		const chorus = '[Chorus]\nHold on tight';
		const original = [chorus, chorus, chorus].join('\n\n');
		const { handle, text } = await mount({
			text: original,
			selection: { anchor: 0, head: original.length }
		});
		handle.setSectionLinks?.([{ lines: [1, 4, 7] }]);
		const updated = original.replace('tight', 'close');
		const transfer = new DataTransfer();
		transfer.setData('text/plain', updated);
		clipboard('paste', transfer);
		expect(text()).toBe(updated);
		expect(handle.getSectionLinks?.()[0]?.lines).toEqual([1, 4, 7]);
		const from = updated.indexOf('tight');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to: from + 5, insert: 'near' }]
		});
		expect(text()).toBe(updated.replaceAll('tight', 'near'));
	});

	it('declines ambiguous members when identical chorus counts change', async () => {
		const chorus = '[Chorus]\nHold on tight';
		const original = [chorus, chorus, chorus].join('\n\n');
		const { handle, text } = await mount({
			text: original,
			selection: { anchor: 0, head: original.length }
		});
		handle.setSectionLinks?.([{ lines: [1, 4, 7] }]);
		const updated = [chorus, chorus].join('\n\n');
		const transfer = new DataTransfer();
		transfer.setData('text/plain', updated);

		clipboard('paste', transfer);

		expect(text()).toBe(updated);
		expect(handle.getSectionLinks?.()).toEqual([]);
	});

	it('undoes and redoes replacement text and recovered links together', async () => {
		const { handle, text } = await mount({
			text: song,
			selection: { anchor: 0, head: song.length }
		});
		handle.setSectionLinks?.([{ lines: [1, 5] }]);
		const before = handle.getSectionLinks?.();
		const updated = '[Intro]\nJust arrived\n\n' + song.replaceAll('tight', 'close');
		const transfer = new DataTransfer();
		transfer.setData('text/plain', updated);
		clipboard('paste', transfer);
		const after = handle.getSectionLinks?.();
		expect(after?.map((link) => link.lines)).toEqual([[4, 8]]);

		handle.undo();
		expect(text()).toBe(song);
		expect(handle.getSectionLinks?.()).toEqual(before);

		handle.redo();
		expect(text()).toBe(updated);
		expect(handle.getSectionLinks?.()).toEqual(after);
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
