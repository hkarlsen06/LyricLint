<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import { PHONE_WORKSPACE_QUERY } from '../state/phone-layout.js';
	import { canAssignVoiceGroup } from '$lib/performers/transform.js';
	import MusicNotesIcon from 'phosphor-svelte/lib/MusicNotesIcon';
	import MusicNotesPlusIcon from 'phosphor-svelte/lib/MusicNotesPlusIcon';
	import SidebarSimpleIcon from 'phosphor-svelte/lib/SidebarSimpleIcon';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
	import { describeControl } from '../state/control-tooltip.svelte.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let {
		controller,
		openMediaPicker,
		editorExpanded = false,
		onToggleEditor
	}: {
		controller: WorkbenchController;
		editorExpanded?: boolean;
		onToggleEditor?: () => void;
		openMediaPicker?: (source: HTMLButtonElement) => void;
	} = $props();

	const phone = new MediaQuery(PHONE_WORKSPACE_QUERY);
	const canAssign = $derived(
		!controller.snapshot.composing &&
			controller.editor.requestPerformerAssignment !== undefined &&
			canAssignVoiceGroup(controller.snapshot.parsed, controller.snapshot.selection)
	);

	// The same question `transportModifier` asks, and deliberately not that
	// function: the transport folds a chord down to one modifier because it has
	// three glyphs and no room for words. These are the editor's own bindings and
	// are printed as they are actually pressed.
	const mac = 'navigator' in globalThis && /Mac|iPhone|iPad|iPod/iu.test(navigator.platform);

	// Commands that are always available, never a selection, a chorus, or an
	// attachment away from working. `Ctrl-Alt-P` and `Mod-Shift-L` are
	// absent from the permanent desktop row: each needs a selection or shared linked lyrics and
	// refuses out loud the rest of the time, and a tray that spends most of its
	// life offering answers it cannot give is the thing `availableRates` and
	// `spotifyAvailable` both exist to prevent. Bold and italic are absent for
	// the other reason: the performer picker and the roster are how a voice is
	// marked here, and a command is offered once.
	//
	// Up to four editing/source commands, followed by the workspace toggle.
	// The toggle belongs at the editor edge it expands and remains reachable
	// when the tools are hidden.
	const actions = $derived([
		{
			id: 'section',
			mark: '[+]',
			label: 'Section header',
			caption: mac ? '⇧⌘H' : 'Ctrl+Shift+H',
			keyshortcuts: mac ? 'Meta+Shift+H' : 'Control+Shift+H',
			run: () => controller.insertSection()
		},
		{
			// The accessible name keeps the mark, because `[?]` is the thing this
			// writes and a reader who knows the convention should be able to find the
			// control by it.
			id: 'unknown',
			mark: '[?]',
			label: 'Unknown lyric [?]',
			caption: mac ? '⌃⌥U' : 'Ctrl+Alt+U',
			keyshortcuts: 'Control+Alt+U',
			run: () => controller.insertUnknownMarker()
		},
		{
			// The one command here that writes nothing, which is why it is the one
			// drawn as a pictogram rather than as a mark: the other two show what
			// they put in the document, and this one has nothing to show.
			id: 'find',
			mark: undefined,
			label: 'Find and replace',
			caption: mac ? '⌘F' : 'Ctrl+F',
			keyshortcuts: mac ? 'Meta+F' : 'Control+F',
			run: () => controller.toggleSearch()
		}
	]);
	const audioAvailable = $derived(
		openMediaPicker !== undefined && controller.media !== undefined && !controller.media.restoring
	);
	const hasAudio = $derived(!!controller.media?.player.attached || !!controller.media?.pendingName);
</script>

<!-- Cancel mouse down to retain the lyric selection while commands activate.
     Keep touch pointer down uncancelled: Safari otherwise suppresses the native
     click and Section/Find/Assign voices silently do nothing (as with playback).
     Desktop glyphs disclose their names through the shared tooltip. Phones name
     the section and search commands directly, and offer assignment for a valid
     retained selection; the phone navigation owns returning to tools. -->
<div
	class:editor-actions--phone={phone.current}
	class="editor-actions"
	role="group"
	aria-label="Document actions"
>
	{#each actions as action (action.id)}
		<button
			type="button"
			class="button--quiet editor-actions__button"
			aria-label={action.label}
			aria-keyshortcuts={action.keyshortcuts}
			aria-pressed={action.id === 'find' ? controller.searchOpen : undefined}
			onmousedown={(event) => event.preventDefault()}
			onclick={action.run}
			{@attach describeControl(() => ({ label: action.label, shortcut: action.caption }))}
		>
			{#if phone.current}
				{action.id === 'section' ? 'Section' : action.id === 'unknown' ? '[?]' : 'Find'}
			{:else if action.mark}
				<span class="editor-actions__mark" aria-hidden="true">{action.mark}</span>
			{:else if action.id === 'find'}
				<!-- `1em` and `currentColor`, the rule the loading mark states: a glyph
				     in a button belongs to whatever it is inside, and here that is a
				     row of marks it has to sit at the same optical size as. -->
				<MagnifyingGlassIcon
					class="editor-actions__glyph"
					aria-hidden="true"
					size="1em"
					weight="bold"
				/>
			{/if}
		</button>
	{/each}
	{#if audioAvailable && openMediaPicker}
		<!-- The note is the tray's optional audio glyph: attaching audio writes
		     nothing to the document, so like the magnifier it is a pictogram
		     rather than a mark. It carries no keystroke, so its tooltip carries
		     the name alone, and a glyph with no box at all is a control nothing
		     but a screen reader can name. -->
		<button
			type="button"
			class="button--quiet editor-actions__button"
			aria-label={hasAudio ? 'Change audio source' : 'Add audio source'}
			aria-haspopup="dialog"
			onclick={(event) => openMediaPicker(event.currentTarget)}
			{@attach describeControl(() => ({
				label: hasAudio ? 'Change audio source' : 'Add audio source'
			}))}
		>
			{#if hasAudio}
				<MusicNotesIcon class="editor-actions__glyph" aria-hidden="true" size="1em" weight="bold" />
			{:else}
				<MusicNotesPlusIcon
					class="editor-actions__glyph"
					aria-hidden="true"
					size="1em"
					weight="bold"
				/>
			{/if}
		</button>
	{/if}
	{#if phone.current && canAssign}
		<button
			type="button"
			class="button--quiet editor-actions__button"
			onmousedown={(event) => event.preventDefault()}
			onclick={() => controller.editor.requestPerformerAssignment?.()}>Assign voices</button
		>
	{/if}
	{#if onToggleEditor && !phone.current}
		<button
			type="button"
			class="button--quiet editor-actions__button"
			aria-label={editorExpanded
				? `Show tools${controller.visibleDiagnostics.length > 0 ? `, ${controller.visibleDiagnostics.length} visible findings` : ''}`
				: 'Expand editor'}
			aria-expanded={!editorExpanded}
			aria-controls="document-panel"
			onclick={onToggleEditor}
			{@attach describeControl(() => ({ label: editorExpanded ? 'Show tools' : 'Expand editor' }))}
		>
			<SidebarSimpleIcon
				class="editor-actions__glyph"
				aria-hidden="true"
				size="1em"
				mirrored
				weight={editorExpanded ? 'regular' : 'fill'}
			/>
		</button>
	{/if}
</div>

<style>
	/*
	 * The editor column's commands, as a tray over the top-right corner of the
	 * document.
	 *
	 * **It costs the document no height, and that is the third shape this took.**
	 * Drawn full width across the column it made the row the object: a strip of
	 * chrome as wide as the document with two words at one end and a hand of empty
	 * gutter after them. Hugged to its contents it was the right size and, at the
	 * left of the column, belonged to nothing. Given a grid row of its own at the
	 * right it belonged to the tab strip, and charged 44px of the document for the
	 * privilege, every pixel of it beside the text rather than above it, because
	 * the lyric column is capped at `--measure-editor` and left-aligned. So the row
	 * went and the tray is `position: absolute` over the space that was already
	 * empty.
	 *
	 * `--panel-tabs-height` is kept, so its foot still lands level with the panel's
	 * tab strip: the chrome under the toolbar ends at one height across the window
	 * even though the two surfaces do not touch.
	 *
	 * A rounded inner corner and a tonal change separate the tray; no hairline
	 * connects it to the rest of the window.
	 *
	 * `--color-chrome`, like the toolbar above it. The bulk-fix strip learned the
	 * alternative the long way: drawn as bare canvas it took the tone of whatever it
	 * touched and its controls read as loose inside the surface below, which is a
	 * live hazard here rather than a remembered one, since this tray floats directly
	 * over the document.
	 */
	.editor-actions {
		position: absolute;
		top: 0;
		right: 0;
		z-index: var(--layer-toolbar);
		display: flex;
		min-height: var(--panel-tabs-height);
		padding: 0 var(--space-3);
		border: 0;
		border-bottom-left-radius: var(--radius-panel);
		gap: var(--space-1);
		align-items: center;
		background: var(--color-chrome);
	}

	.editor-actions__button {
		display: inline-grid;
		min-width: var(--control-height-sm);
		min-height: var(--control-height-sm);
		flex: none;
		padding: 0 var(--space-1);
		place-items: center;
		color: var(--color-text);
		font-size: var(--font-size-xs);
		line-height: 1;
	}

	.editor-actions__mark {
		font-family: var(--font-mono);
		white-space: nowrap;
	}

	/* The one glyph that is not a mark. A magnifier at `1em` is optically smaller
	   than three mono characters beside it, so it is stepped up to the slot's own
	   size rather than left to look like a shrunken third sibling. */
	.editor-actions :global(.editor-actions__glyph) {
		flex: none;
		font-size: var(--font-size-md);
	}

	/*
	 * Find and replace is showing.
	 *
	 * The accent is on the glyph and not on the button, because a filled or ringed
	 * control here would be a second box inside a tray that is already one, and
	 * because what is being reported is the state of a panel, not a control being
	 * hovered. `aria-pressed` is what carries it to anything that cannot see a
	 * color, which is why the state is a toggle button rather than a class.
	 */
	.editor-actions__button[aria-pressed='true'] {
		color: var(--color-accent);
	}

	/* Stacked, the panel sits under the editor rather than beside it. */
	@media (max-width: 68rem) {
		.editor-actions__button[aria-controls='document-panel'] :global(.editor-actions__glyph) {
			transform: rotate(90deg);
		}
	}

	@media (pointer: coarse) and (max-width: 68rem) {
		:global(.workspace) .editor-actions {
			position: static;
			align-self: flex-end;
			flex: none;
		}

		:global(.workspace[data-mobile-view='review'][data-review-focused='true']) .editor-actions {
			display: none;
		}
	}

	.editor-actions--phone {
		max-width: 100%;
		padding-inline: var(--space-1);
		gap: 0;
	}
	.editor-actions--phone .editor-actions__button {
		min-height: var(--control-height-touch);
		min-width: var(--control-height-touch);
		padding-inline: var(--space-2);
		font-size: var(--font-size-sm);
	}
</style>
