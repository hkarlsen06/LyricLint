<script lang="ts">
	import { parseDocument } from '$lib/core/parser.js';
	import type { AtomicDocumentEdit, EditorSnapshot, SerializedSelection } from '$lib/core/types.js';
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

	function currentSnapshot(): EditorSnapshot {
		return {
			revision,
			text,
			selection: { ...selection },
			parsed: parseDocument(text),
			diagnostics: [],
			composing: false,
			canUndo: history.length > 0,
			canRedo: future.length > 0
		};
	}

	function emitSnapshot(): void {
		callbacks.onSnapshot(currentSnapshot());
	}

	function replace(nextText: string, nextSelection = selection): void {
		history = [...history, text];
		future = [];
		text = nextText;
		selection = { ...nextSelection };
		revision += 1;
		emitSnapshot();
	}

	function applyAtomic(edit: AtomicDocumentEdit): void {
		if (edit.baseRevision !== revision) return;
		let nextText = text;
		for (const change of [...edit.edits].sort((left, right) => right.from - left.from)) {
			nextText = `${nextText.slice(0, change.from)}${change.insert}${nextText.slice(change.to)}`;
		}
		replace(nextText, edit.selectionAfter ?? selection);
	}

	// eslint-disable-next-line no-useless-assignment -- Assignment publishes the shell-safe handle through bind:handle.
	handle = {
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
		// the song, focus the editor — with no way to be exercised at all.
		setLyricSync(active) {
			callbacks.onLyricSyncChange?.(active);
		}
	};

	function onInput(event: Event): void {
		const target = event.currentTarget as HTMLTextAreaElement;
		selection = { anchor: target.selectionStart, head: target.selectionEnd };
		replace(target.value, selection);
	}

	function onSelect(event: Event): void {
		const target = event.currentTarget as HTMLTextAreaElement;
		selection = { anchor: target.selectionStart, head: target.selectionEnd };
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
