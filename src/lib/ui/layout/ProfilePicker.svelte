<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { profileLabels, type ProfileId } from '#lib/profiles/types.js';
	import { profileLanguage } from '#lib/profiles/languages.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
	const descriptionId = $props.id();
	const profiles: ProfileId[] = ['genius', 'musixmatch'];
</script>

{#if controller.writing.phase === 'new'}
	<div
		class="profile-picker"
		role="group"
		aria-label="Lyric format"
		aria-describedby={descriptionId}
	>
		{#each profiles as profile (profile)}
			{@const current = controller.profile === profile}
			<button
				type="button"
				class="button"
				class:button--quiet={!current}
				aria-label={`Lyric format: ${profileLabels[profile]}`}
				aria-pressed={current}
				aria-describedby={current && controller.pendingProfile ? descriptionId : undefined}
				title={current && controller.pendingProfile ? 'Cancel pending format switch' : undefined}
				onclick={() => controller.switchProfile(profile)}
			>
				<span class="profile-picker__mark" aria-hidden="true">
					{#if current && controller.pendingProfile}<XIcon size={14} />
					{:else if current}<CheckIcon size={14} weight="bold" />{/if}
				</span>
				{profileLabels[profile]}
			</button>
		{/each}
	</div>
	<span id={descriptionId} class="sr-only">
		{#if controller.pendingProfile}Select the current format to cancel the pending switch.{/if}
		{#if profileLanguage(controller.language) === 'und'}Language-independent conversion only.{/if}
	</span>
{:else}
	<span class="profile-picker">{profileLabels[controller.profile]}</span>
{/if}

<style>
	.profile-picker {
		display: flex;
		flex: none;
		gap: var(--space-1);
	}
	.profile-picker .button {
		white-space: nowrap;
	}
	.profile-picker__mark {
		display: inline-flex;
		width: var(--font-size-sm);
		flex: none;
		align-items: center;
	}
</style>
