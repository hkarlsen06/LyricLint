<script lang="ts">
	import Check from 'lucide-svelte/icons/check';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import { tick } from 'svelte';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import { profileLabels, type ProfileId } from '$lib/profiles/types.js';
	import { profileLanguage } from '$lib/profiles/languages.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	let { controller }: { controller: WorkbenchController } = $props();
	let open = $state(false);
	let trigger: HTMLButtonElement;
	let menu = $state<HTMLDivElement>();
	const reviewedLanguage = $derived(profileLanguage(controller.language) !== 'und');
	const choices: ProfileId[] = ['genius', 'musixmatch'];

	async function show(keyboard: boolean) {
		open = !open;
		if (open && keyboard) {
			await tick();
			menu?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
		}
	}
	function select(profile: ProfileId, keyboard: boolean) {
		controller.switchProfile(profile);
		open = false;
		if (keyboard) trigger.focus();
	}
	function onkeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			open = false;
			trigger.focus();
		} else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
			event.preventDefault();
			const items = [
				...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])
			];
			const at = items.findIndex((item) => item === document.activeElement);
			const next =
				event.key === 'Home'
					? 0
					: event.key === 'End'
						? items.length - 1
						: (at + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
			items[next]?.focus();
		} else if (event.key === 'Tab') open = false;
	}
</script>

<svelte:window {onkeydown} />
<div class="profile-picker" {@attach dismissOnOutside(() => (open = false))}>
	<button
		bind:this={trigger}
		type="button"
		class="button button--quiet profile-picker__trigger"
		aria-label={`Lyric format: ${profileLabels[controller.profile]}`}
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={(event) => show(event.detail === 0)}
	>
		<span class="profile-picker__label"
			><span aria-hidden="true" class="profile-picker__measure">Musixmatch</span><span
				>{profileLabels[controller.profile]}</span
			></span
		>
		<ChevronDown size={14} aria-hidden="true" />
	</button>
	{#if open}
		<div bind:this={menu} class="profile-picker__menu" role="menu" aria-label="Lyric format">
			{#each choices as profile (profile)}
				<button
					type="button"
					class="button button--quiet"
					role="menuitemradio"
					aria-checked={controller.profile === profile}
					onclick={(event) => select(profile, event.detail === 0)}
				>
					<span class="profile-picker__check"
						>{#if controller.profile === profile}<Check size={16} aria-hidden="true" />{/if}</span
					>
					{profileLabels[profile]}
				</button>
			{/each}
			{#if !reviewedLanguage}<p class="profile-picker__scope">
					Language-independent conversion only
				</p>{/if}
			{#if controller.pendingProfile}
				<button
					type="button"
					class="button button--quiet"
					role="menuitem"
					onclick={(event) => select(controller.profile, event.detail === 0)}>Cancel switch</button
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	.profile-picker {
		position: relative;
		flex: none;
	}
	.profile-picker__trigger {
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
	.profile-picker__menu {
		position: absolute;
		inset-block-start: 100%;
		inset-inline-end: 0;
		min-width: 100%;
		z-index: var(--layer-popover);
		display: grid;
		padding: var(--space-2);
		background: var(--color-surface);
		border-radius: var(--radius-overlay);
		box-shadow: var(--shadow-overlay);
	}
	.profile-picker__menu button {
		justify-content: flex-start;
		white-space: nowrap;
	}
	.profile-picker__scope {
		max-width: var(--measure-prose);
		margin: var(--space-2);
		font-size: var(--font-size-sm);
	}
	.profile-picker__check {
		display: inline-flex;
		min-width: var(--space-4);
	}
</style>
