<script lang="ts">
	import FileTextIcon from 'phosphor-svelte/lib/FileTextIcon';
	import { profileLabels } from '#lib/profiles/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
</script>

<!-- A new 'scribe asks for its format in the document itself (`DraftStart.svelte`).
     Once writing begins the format is fixed, so it is a tag in the segmented
     control's track rather than a control: the choice it reports, without a
     raised face that would invite a press. A Genius-only user has no other
     format to tell it from, so the tag waits for Musixmatch tools. -->
{#if controller.writing.phase !== 'new' && controller.showsFormatTools}
	<span class="profile-picker profile-picker--fixed"
		><FileTextIcon
			class="profile-picker__icon"
			aria-hidden="true"
			size={14}
			weight="bold"
		/>{profileLabels[controller.profile]}</span
	>
{/if}

<style>
	.profile-picker--fixed {
		display: inline-flex;
		flex: none;
		min-height: var(--control-height-sm);
		padding-inline: var(--space-2) var(--space-2-5);
		border-radius: calc(var(--radius-control) + var(--space-0-5));
		gap: var(--space-1-5);
		align-items: center;
		background: var(--color-track);
		box-shadow: var(--shadow-track);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
	}
	.profile-picker--fixed :global(.profile-picker__icon) {
		flex: none;
		color: var(--color-text-muted);
	}
	/* Phones spend the tag's glyph on the Copy label beside it. */
	@media (pointer: coarse) and (max-width: 68rem) {
		.profile-picker--fixed :global(.profile-picker__icon) {
			display: none;
		}
	}
</style>
