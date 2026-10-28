<script lang="ts">
	import ArrowsLeftRight from 'phosphor-svelte/lib/ArrowsLeftRightIcon';
	import { profileLabels } from '#lib/profiles/types.js';
	import { profileLanguage } from '#lib/profiles/languages.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
	const descriptionId = $props.id();
	const otherProfile = $derived(controller.profile === 'genius' ? 'musixmatch' : 'genius');
</script>

<button
	type="button"
	class="button button--quiet profile-picker profile-picker__trigger"
	aria-label={`Lyric format: ${profileLabels[controller.profile]}`}
	aria-describedby={descriptionId}
	aria-busy={!!controller.pendingProfile}
	onclick={() =>
		controller.switchProfile(controller.pendingProfile ? controller.profile : otherProfile)}
>
	<span class="profile-picker__label">
		<span aria-hidden="true" class="profile-picker__measure">Musixmatch</span>
		<span aria-hidden="true" class="profile-picker__measure">Cancel switch</span>
		<span>{controller.pendingProfile ? 'Cancel switch' : profileLabels[controller.profile]}</span>
	</span>
	<ArrowsLeftRight size={14} aria-hidden="true" />
</button>
<span id={descriptionId} class="sr-only">
	{controller.pendingProfile
		? 'Cancel the pending format switch.'
		: `Switch to ${profileLabels[otherProfile]}.`}
	{#if profileLanguage(controller.language) === 'und'}Language-independent conversion only.{/if}
</span>

<style>
	.profile-picker__trigger {
		flex: none;
		white-space: nowrap;
	}
	.profile-picker__label {
		display: grid;
		text-align: start;
	}
	.profile-picker__label > span {
		grid-area: 1 / 1;
	}
	.profile-picker__measure {
		visibility: hidden;
	}
</style>
