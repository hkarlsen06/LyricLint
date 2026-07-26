import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EditorHandle } from '$lib/core/types.js';
import type { EditorDisplayContext, LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';

/*
 * Dropping the song on the lyrics attaches it. The half of this that matters is
 * everything the editor must NOT do: the drops CodeMirror already handled — a
 * text file read in at the caret, a selection or a URL dragged in — go through
 * untouched, and nothing is prevented until the drag has been recognized.
 */

function callbacks(overrides: Partial<LyricEditorCallbacks> = {}): LyricEditorCallbacks {
	return {
		onSnapshot: vi.fn(),
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onAnnouncement: vi.fn(),
		...overrides
	};
}

function context(): EditorDisplayContext {
	return {
		language: 'en',
		performers: [],
		ruleSetVersion: 'audio-drop-test',
		diagnostics: { revision: 0, items: [] }
	};
}

async function mount(options: {
	text: string;
	editorCallbacks?: LyricEditorCallbacks;
}): Promise<{ handle: EditorHandle; content: HTMLElement }> {
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: options.text,
			context: context(),
			callbacks: options.editorCallbacks ?? callbacks(),
			onready: (ready: EditorHandle) => {
				handle = ready;
			}
		}
	});
	const textbox = page.getByRole('textbox', { name: 'Lyrics editor' });
	await expect.element(textbox).toBeVisible();
	if (!handle) throw new Error('CodeMirror did not publish its editor handle.');
	return { handle, content: textbox.element() as HTMLElement };
}

function withFiles(...files: File[]): DataTransfer {
	const transfer = new DataTransfer();
	for (const file of files) transfer.items.add(file);
	return transfer;
}

function withText(text: string): DataTransfer {
	const transfer = new DataTransfer();
	transfer.setData('text/plain', text);
	return transfer;
}

function fire(
	target: HTMLElement,
	type: 'dragover' | 'dragleave' | 'drop',
	dataTransfer: DataTransfer | null,
	init: DragEventInit = {}
): DragEvent {
	const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, ...init });
	target.dispatchEvent(event);
	return event;
}

/** The affordance is a class on the editor root, so it is read from there. */
function ringed(content: HTMLElement): boolean {
	return content.closest('.cm-editor')?.classList.contains('ll-audio-drop') ?? false;
}

function audioFile(name = 'take-3.mp3', type = 'audio/mpeg'): File {
	// Two runs of control characters: this is what CodeMirror's own file drop
	// discards rather than pasting in as text, and a real audio file has them.
	return new File([new Uint8Array([0, 1, 2, 3, 4, 5])], name, { type });
}

describe('dropping audio on the editor', () => {
	it('hands a dropped audio file to the shell instead of letting it reach the document', async () => {
		const onAudioFileDropped = vi.fn(() => true);
		const { handle, content } = await mount({
			text: 'one two three',
			editorCallbacks: callbacks({ onAudioFileDropped })
		});

		const file = audioFile();
		const event = fire(content, 'drop', withFiles(file));

		expect(onAudioFileDropped).toHaveBeenCalledOnce();
		expect(onAudioFileDropped).toHaveBeenCalledWith(file);
		expect(event.defaultPrevented).toBe(true);
		expect(handle.getSnapshot().text).toBe('one two three');
	});

	// Chromium reports an empty type for `.flac` and `.opus`, which are exactly
	// the formats a transcriber is handed by a producer.
	it('takes a file the browser could not type, by its extension', async () => {
		let taken: File | undefined;
		const onAudioFileDropped = vi.fn((file: File) => {
			taken = file;
			return true;
		});
		const { content } = await mount({
			text: 'one two three',
			editorCallbacks: callbacks({ onAudioFileDropped })
		});

		fire(content, 'dragover', withFiles(audioFile('master.flac', '')));
		expect(ringed(content)).toBe(true);

		fire(content, 'drop', withFiles(audioFile('master.flac', '')));
		expect(onAudioFileDropped).toHaveBeenCalledOnce();
		expect(taken?.name).toBe('master.flac');
	});

	it('leaves a dropped text file to CodeMirror, which reads it into the document', async () => {
		const onAudioFileDropped = vi.fn(() => true);
		const { handle, content } = await mount({
			text: '',
			editorCallbacks: callbacks({ onAudioFileDropped })
		});

		const over = fire(
			content,
			'dragover',
			withFiles(new File(['[Verse]'], 'lyrics.txt', { type: 'text/plain' }))
		);
		expect(over.defaultPrevented).toBe(false);
		expect(ringed(content)).toBe(false);

		fire(content, 'drop', withFiles(new File(['[Verse]'], 'lyrics.txt', { type: 'text/plain' })));
		expect(onAudioFileDropped).not.toHaveBeenCalled();
		// CodeMirror reads the file asynchronously; the point is that it still gets to.
		await vi.waitFor(() => expect(handle.getSnapshot().text).toContain('[Verse]'));
	});

	it('leaves dragged text alone, over the document and on the drop', async () => {
		const onAudioFileDropped = vi.fn(() => true);
		const { handle, content } = await mount({
			text: '',
			editorCallbacks: callbacks({ onAudioFileDropped })
		});

		const over = fire(content, 'dragover', withText('sings alone'));
		expect(over.defaultPrevented).toBe(false);
		expect(ringed(content)).toBe(false);

		fire(content, 'drop', withText('sings alone'));
		expect(onAudioFileDropped).not.toHaveBeenCalled();
		expect(handle.getSnapshot().text).toBe('sings alone');
	});

	it('rings the editor while audio is over it and puts the ring out when it leaves', async () => {
		const { handle, content } = await mount({ text: 'one two three' });
		// Focused, because the editor's own rule turns the outline off there and
		// this is the one state allowed to outrank it.
		handle.focus();

		const over = fire(content, 'dragover', withFiles(audioFile()));
		expect(over.defaultPrevented).toBe(true);
		expect(ringed(content)).toBe(true);
		const editor = content.closest('.cm-editor') as HTMLElement;
		const outline = getComputedStyle(editor);
		expect(outline.outlineStyle).toBe('solid');
		expect(Number.parseFloat(outline.outlineWidth)).toBeGreaterThan(0);

		// Crossing between two lines leaves one child of the content and enters
		// another. The ring may not blink for that.
		fire(content, 'dragleave', withFiles(audioFile()), {
			relatedTarget: content.querySelector('.cm-line')
		});
		expect(ringed(content)).toBe(true);

		fire(content, 'dragleave', withFiles(audioFile()));
		expect(ringed(content)).toBe(false);
	});

	it('puts the ring out on the drop that ends the drag', async () => {
		const { content } = await mount({
			text: 'one two three',
			editorCallbacks: callbacks({ onAudioFileDropped: () => true })
		});

		fire(content, 'dragover', withFiles(audioFile()));
		expect(ringed(content)).toBe(true);

		fire(content, 'drop', withFiles(audioFile()));
		expect(ringed(content)).toBe(false);
	});

	// No media store on the draft yet. The editor asked, was told no, and the
	// event goes on to CodeMirror as if this feature were not installed — which
	// is what claims it here (a file drop is CodeMirror's own case, and it
	// discards this one's bytes as binary rather than pasting them in).
	it('falls through when the shell will not take the file', async () => {
		const onAudioFileDropped = vi.fn(() => false);
		const { handle, content } = await mount({
			text: 'one two three',
			editorCallbacks: callbacks({ onAudioFileDropped })
		});

		const event = fire(content, 'drop', withFiles(audioFile()));

		expect(onAudioFileDropped).toHaveBeenCalledOnce();
		expect(event.defaultPrevented).toBe(true);
		expect(handle.getSnapshot().text).toBe('one two three');
	});

	// A shell that never wired the hook at all is the same case as a refusal.
	it('is inert when no hook is offered', async () => {
		const { handle, content } = await mount({ text: 'one two three' });

		fire(content, 'drop', withFiles(audioFile()));

		expect(handle.getSnapshot().text).toBe('one two three');
		expect(ringed(content)).toBe(false);
	});
});
