<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import FileTextIcon from 'phosphor-svelte/lib/FileTextIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { profileLabels, type ProfileId } from '#lib/profiles/types.js';
	import { profileLanguage } from '#lib/profiles/languages.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
	const descriptionId = $props.id();
	const profiles: ProfileId[] = ['genius', 'musixmatch'];
</script>

{#if controller.writing.phase === 'new'}
	<!-- The one decision asked before writing, drawn as one: a captioned
	     segmented control rather than two loose words in the toolbar. The
	     caption repeats the group's own name for sighted readers only. -->
	<span class="profile-picker__caption" aria-hidden="true">Format</span>
	<div
		class="profile-picker segmented"
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
	<!-- Fixed once writing begins, so it is a tag in the segmented control's
	     own track rather than a control: the choice it reports, without a
	     raised face that would invite a press. -->
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
	.profile-picker .button {
		gap: var(--space-1);
		padding-inline: var(--space-2) var(--space-2-5);
	}
	.profile-picker__mark {
		display: inline-flex;
		width: var(--font-size-sm);
		flex: none;
		align-items: center;
	}
	.profile-picker__caption {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		white-space: nowrap;
	}
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
	/* Phones spend the row's width on the choices themselves, and the tag's
	   glyph on the Copy label beside it. */
	@media (pointer: coarse) and (max-width: 68rem) {
		.profile-picker__caption,
		.profile-picker--fixed :global(.profile-picker__icon) {
			display: none;
		}
	}
	@media (pointer: fine) and (max-width: 46rem) {
		.profile-picker__caption {
			display: none;
		}
	}
</style>
