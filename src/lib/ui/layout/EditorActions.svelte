<script lang="ts">
	import { Music, PanelRightClose, PanelRightOpen, Search } from 'lucide-svelte';
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

	// The same question `transportModifier` asks, and deliberately not that
	// function: the transport folds a chord down to one modifier because it has
	// three glyphs and no room for words. These are the editor's own bindings and
	// are printed as they are actually pressed.
	const mac = 'navigator' in globalThis && /Mac|iPhone|iPad|iPod/iu.test(navigator.platform);

	// Commands that are always available — never a selection, a chorus, or an
	// attachment away from working. `Ctrl-Alt-P` and `Mod-Shift-L` are
	// deliberately absent: each needs a selection or shared linked lyrics and
	// refuses out loud the rest of the time, and a tray that spends most of its
	// life offering answers it cannot give is the thing `availableRates` and
	// `spotifyAvailable` both exist to prevent. Bold and italic are absent for
	// the other reason — the performer picker and the roster are how a voice is
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
	// The audio attach draws only while there is nothing for the strip to show:
	// no attachment and no remembered source. Past that the strip itself carries
	// the way back in, so the tray never offers what the row below already does.
	const audioAvailable = $derived(
		openMediaPicker !== undefined &&
			controller.media !== undefined &&
			!controller.media.player.attached &&
			controller.media.pendingName === undefined
	);
</script>

<!--
	The editor column's own commands, as a tray hanging off the toolbar at the
	right of the column, against the panel.

	It takes the width its two controls need and stops, rather than running the
	width of the document: a band drawn all the way across makes the row the
	object, and the row is then mostly empty gutter with two words at one end of
	it. Against the panel it is the tab strip's own chrome carried a little way
	out over the document — same height, one continuous edge — which is what a
	tray of this size has to belong to. Adrift at the left of the column it
	belonged to nothing.

	**The controls are glyphs, and what they are is a tooltip.** Spelled out, the
	two labels and their shortcut captions were 243px of the document's own top
	row for two commands — five times what the glyphs need, permanently, to say
	something a transcriber reads once. The name and the keystroke arrive together
	on hover, through the shared `describeControl`, which is the same box the
	transport's own three controls use.

	What that costs is named rather than hidden: a tooltip is not a thing a finger
	can produce. The accessible name carries the whole label at every state, so
	nothing is lost to a screen reader, but a sighted touch user meets two marks
	and no words — which is the trade this shape makes, and the reason `[?]` keeps
	its mark in the glyph rather than being drawn as an abstract icon. The mark is
	what the button writes.
-->
<div class="editor-actions" role="group" aria-label="Document actions">
	{#each actions as action (action.id)}
		<button
			type="button"
			class="button--quiet editor-actions__button"
			aria-label={action.label}
			aria-keyshortcuts={action.keyshortcuts}
			aria-pressed={action.id === 'find' ? controller.searchOpen : undefined}
			onclick={action.run}
			{@attach describeControl(() => ({ label: action.label, shortcut: action.caption }))}
		>
			{#if action.mark}
				<span class="editor-actions__mark" aria-hidden="true">{action.mark}</span>
			{:else if action.id === 'find'}
				<!-- `1em` and `currentColor`, the rule the loading mark states: a glyph
				     in a button belongs to whatever it is inside, and here that is a
				     row of marks it has to sit at the same optical size as. -->
				<Search class="editor-actions__glyph" aria-hidden="true" size="1em" strokeWidth={2.25} />
			{/if}
		</button>
	{/each}
	{#if audioAvailable && openMediaPicker}
		<!-- The note is the tray's optional audio glyph: attaching audio writes
		     nothing to the document, so like the magnifier it is a pictogram
		     rather than a mark. It carries no keystroke, so its tooltip carries
		     the name alone — a glyph with no box at all is a control nothing
		     but a screen reader can name. -->
		<button
			type="button"
			class="button--quiet editor-actions__button"
			aria-label="Add audio source"
			aria-haspopup="dialog"
			onclick={(event) => openMediaPicker(event.currentTarget)}
			{@attach describeControl(() => ({ label: 'Add audio source' }))}
		>
			<Music class="editor-actions__glyph" aria-hidden="true" size="1em" strokeWidth={2.25} />
		</button>
	{/if}
	{#if onToggleEditor}
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
			{#if editorExpanded}
				<PanelRightOpen
					class="editor-actions__glyph"
					aria-hidden="true"
					size="1em"
					strokeWidth={2}
				/>
			{:else}
				<PanelRightClose
					class="editor-actions__glyph"
					aria-hidden="true"
					size="1em"
					strokeWidth={2}
				/>
			{/if}
		</button>
	{/if}
</div>
