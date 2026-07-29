<script lang="ts">
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import { hideControlHint, shownControlHint } from '../state/control-tooltip.svelte.js';

	const hint = $derived(shownControlHint());
</script>

<!--
	The one box that names a control and its keystroke, rendered once for the whole
	workbench and filled by whichever control `describeControl` is attached to.

	It draws once rather than per surface for the reason the diagnostic card and
	its popover share a row: two copies of a box is two copies of every rule about
	what goes in it, and the copy that drifted would be the one nobody is looking
	at. Mounted in `Workspace.svelte`, which contains both surfaces that use it —
	the editor's action tray and the transport, in the strip and on the artwork.

	`aria-hidden`, because both facts are already the control's own accessible name
	and `aria-keyshortcuts`; a screen reader cannot produce a hover and would
	otherwise hear each twice.
-->
{#if hint}
	<span
		class="control-tooltip"
		style={hint.position}
		aria-hidden="true"
		{@attach dismissOnOutside(hideControlHint)}
	>
		<span class="control-tooltip__label">{hint.label}</span>
		{#if hint.shortcut}
			<kbd class="control-tooltip__key">{hint.shortcut}</kbd>
		{/if}
	</span>
{/if}
