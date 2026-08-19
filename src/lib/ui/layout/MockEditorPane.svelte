<script lang="ts">
	import { parseDocument } from '$lib/core/parser.js';
	import type {
		AtomicDocumentEdit,
		EditorSnapshot,
		SectionLink,
		SerializedSelection
	} from '$lib/core/types.js';
	import type { EditorPaneProps } from '$lib/editor/index.js';
	import { untrack } from 'svelte';

	let {
		initialText,
		initialSelection = { anchor: 0, head: 0 },
		initialRevision = 0,
		context,
		callbacks,
		// eslint-disable-next-line no-useless-assignment -- Svelte consumes this bindable contract prop.
		handle = $bindable()
	}: EditorPaneProps = $props();

	let text = $state(untrack(() => initialText));
	let selection = $state<SerializedSelection>(untrack(() => ({ ...initialSelection })));
	let revision = $state(untrack(() => initialRevision));
	let textarea: HTMLTextAreaElement | undefined;
	let history = $state<string[]>([]);
	let future = $state<string[]>([]);
	let sectionLinks = $state<SectionLink[]>([]);

	function currentSnapshot(atomic = false): EditorSnapshot {
		return {
			revision,
			text,
			selection: { ...selection },
			parsed: parseDocument(text),
			diagnostics: [],
			composing: false,
			canUndo: history.length > 0,
			canRedo: future.length > 0,
			...(atomic ? { atomic: true as const } : {})
		};
	}

	function emitSnapshot(atomic = false): void {
		callbacks.onSnapshot(currentSnapshot(atomic));
	}

	// The real pane reports `atomic` off `dispatchAtomicEdit`'s own transaction
	// annotation, and the shell spends it on whether a document is being composed
	// or was changed by a press. A mock that never reported it would make every
	// component test look like typing, which is the state the real editor is in
	// least often when a test drives it.
	function replace(nextText: string, nextSelection = selection, atomic = false): void {
		history = [...history, text];
		future = [];
		text = nextText;
		selection = { ...nextSelection };
		revision += 1;
		emitSnapshot(atomic);
	}

	function applyAtomic(edit: AtomicDocumentEdit): void {
		if (edit.baseRevision !== revision) return;
		let nextText = text;
		for (const change of [...edit.edits].sort((left, right) => right.from - left.from)) {
			nextText = `${nextText.slice(0, change.from)}${change.insert}${nextText.slice(change.to)}`;
		}
		replace(nextText, edit.selectionAfter ?? selection, true);
	}

	const editorHandle: EditorPaneProps['handle'] = {
		focus() {
			textarea?.focus();
		},
		getSnapshot: currentSnapshot,
		dispatchAtomic: applyAtomic,
		undo() {
			const previous = history.at(-1);
			if (previous === undefined) return;
			future = [text, ...future];
			history = history.slice(0, -1);
			text = previous;
			revision += 1;
			emitSnapshot();
		},
		redo() {
			const next = future[0];
			if (next === undefined) return;
			history = [...history, text];
			future = future.slice(1);
			text = next;
			revision += 1;
			emitSnapshot();
		},
		revealRange() {},
		setSelection(nextSelection) {
			selection = { ...nextSelection };
			if (textarea) {
				textarea.selectionStart = nextSelection.anchor;
				textarea.selectionEnd = nextSelection.head;
			}
		},
		// The real editor owns the mode and reports it back, which is what the
		// shell reacts to. The mock owes it the same shape: a `setLyricSync` that
		// swallowed the call would leave the shell's half of the feature — rewind
		// the song, focus the editor — with no way to be exercised at all. The 0
		// is load-bearing: the mock holds no anchors and models no scope, so a run
		// it starts is always a fresh pass from the top, and an absent `startAt`
		// now means the opposite — leave the tape where it is.
		setLyricSync(active) {
			callbacks.onLyricSyncChange?.(active, active ? 0 : undefined);
		},
		// The draft's links are re-seated onto whichever editor mounts, and the
		// shell reads them straight back to decide whether a `section.unlinked-repeat`
		// has already been answered. A mock that swallowed them would leave that
		// hand-off — the whole of what a reload exercises — untestable. It emits no
		// snapshot, exactly as the real editor does not: this is the draft being
		// read back rather than changed.
		getSectionLinks: () => sectionLinks,
		setSectionLinks(links) {
			sectionLinks = [...links];
		}
	};

	// Published a microtask after mount, not at init, because the real pane awaits
	// a dynamic import of CodeMirror before it has anything to hand over — so the
	// shell's first lint runs *before* the draft's links and anchors are re-seated
	// onto the editor. Publishing in the mount flush reversed that order and hid
	// the whole class of bug that lives in it.
	$effect(() => {
		let cancelled = false;
		void Promise.resolve().then(() => {
			if (!cancelled) handle = editorHandle;
		});
		return () => {
			cancelled = true;
		};
	});

	function onInput(event: Event): void {
		const target = event.currentTarget as HTMLTextAreaElement;
		selection = { anchor: target.selectionStart, head: target.selectionEnd };
		replace(target.value, selection);
	}

	function onSelect(event: Event): void {
		const target = event.currentTarget as HTMLTextAreaElement;
		selection = { anchor: target.selectionStart, head: target.selectionEnd };
		emitSnapshot();
	}
</script>

<div class="mock-editor" data-language={context.language}>
	<textarea
		bind:this={textarea}
		value={text}
		oninput={onInput}
		onselect={onSelect}
		aria-label="Lyrics editor"
		spellcheck="false"
		dir="auto"></textarea>
</div>

<style>
	.mock-editor {
		width: 100%;
		height: 100%;
		min-height: inherit;
	}

	textarea {
		display: block;
		width: 100%;
		/* The reading measure. The real CodeMirror surface caps at the same token
		   (via line padding in src/lib/editor/create-editor.ts). */
		max-width: var(--measure-editor);
		height: 100%;
		min-height: 20rem;
		padding: 2.25rem clamp(1rem, 5vw, 4rem);
		border: 0;
		border-radius: 0;
		resize: none;
		background: transparent;
		color: var(--color-text-reading);
		/* The lyric face, matching the real editor's base — a plain textarea
		   cannot split markup from words, so it takes the words' face whole. */
		font-family: var(--font-lyrics);
		font-size: var(--font-size-lg);
		font-size-adjust: var(--font-lyrics-size-adjust);
		line-height: var(--line-height-editor);
		tab-size: 2;
	}

	textarea:focus-visible {
		outline-offset: -3px;
	}
</style>
