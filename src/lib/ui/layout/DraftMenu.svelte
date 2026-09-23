<script lang="ts">
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import LazyContent from '$lib/interaction/LazyContent.svelte';
	import { untrack } from 'svelte';

	let { controller, open = $bindable(false) }: { controller: WorkbenchController; open?: boolean } =
		$props();
	let initialized = $state(untrack(() => open));
	$effect.pre(() => {
		if (open) initialized = true;
	});
	let menuTrigger = $state<HTMLElement>();
	let importInput = $state<HTMLInputElement>();
	let importing = $state(false);

	function dismiss(): void {
		open = false;
	}
	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !open) return;
		event.preventDefault();
		dismiss();
		menuTrigger?.focus();
	}
	async function importScribe(file: File | undefined): Promise<void> {
		if (!file || importing) return;
		importing = true;
		try {
			if (await controller.importScribe(file)) open = false;
		} finally {
			importing = false;
		}
	}
</script>

<!-- The keydown is on the `<details>` rather than on the popover inside it,
     because Escape has to be caught wherever focus is standing, including on
     the summary, which is outside the popover. The element is not being made
     interactive: it hosts one handler for the surface it *is*, exactly as it
     hosts the outside-press attachment beside it. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<details class="draft-menu" bind:open onkeydown={handleKeydown} {@attach dismissOnOutside(dismiss)}>
	<!-- The .button flex styling strips the summary's implicit disclosure role in
	     Chromium, so restate the button semantics and expansion state explicitly.
	     Svelte considers the role redundant, but real browsers expose the styled
	     summary as generic without it. -->
	<!-- svelte-ignore a11y_no_redundant_roles -->
	<!-- A chevron, not a hamburger, and it hangs off the draft's own name rather
	     than off the far end of the command strip: the field says which draft this
	     is, and the disclosure beside it says which others there are. Icon only:
	     the name lives in the accessible name and the native tooltip. -->
	<summary
		class="button--quiet icon-button draft-menu__trigger"
		role="button"
		aria-label="'Scribes"
		title="'Scribes"
		aria-expanded={open}
		onclick={() => (initialized = true)}
		bind:this={menuTrigger}
	>
		<CaretDownIcon class="draft-menu__chevron" aria-hidden="true" size={13} weight="bold" />
	</summary>
	{#if initialized}
		<div class="draft-menu__popover">
			<div class="draft-menu__titlebar">
				<h2 class="draft-menu__heading">Saved 'scribes</h2>
				<button
					type="button"
					class="button"
					disabled={importing}
					onclick={() => importInput?.click()}
				>
					{importing ? 'Importing…' : 'Import Scribe…'}
				</button>
			</div>
			<input
				bind:this={importInput}
				hidden
				type="file"
				accept="application/vnd.lyriclint.scribe+json,.lls"
				onchange={(event) => {
					const input = event.currentTarget;
					void importScribe(input.files?.[0]);
					input.value = '';
				}}
			/>

			<LazyContent
				name="saved 'scribes"
				load={() => import('./DraftMenuBody.svelte')}
				panelProps={{ controller, open, onClose: dismiss, menuTrigger }}
			/>
		</div>
	{/if}
</details>

<style>
	.draft-menu {
		position: relative;
	}

	.draft-menu > summary {
		list-style: none;
	}

	/* `.icon-button` centres with `place-items`, which a flex box ignores, and the
	   flex display is what strips the summary's default disclosure triangle layout,
	   so restate the centring here rather than dropping back to grid.

	   Element-qualified inside `:where()` so the trigger's rules sit between the
	   shared tiers: above `.icon-button`, below the root-qualified touch floors in
	   `responsive-shared.css`, exactly where they sat as global rules. */
	summary:where(.draft-menu__trigger) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.draft-menu > summary::-webkit-details-marker {
		display: none;
	}

	/* Hangs from the draft switcher rather than from the chevron inside it, so the
	   list opens under the name it is offering to replace and lines up with its left
	   edge. The `<details>` goes static for exactly this. */
	.draft-menu__popover {
		position: absolute;
		z-index: var(--layer-menu);
		top: calc(100% + var(--space-2));
		left: 0;
		width: min(30rem, calc(100vw - var(--space-4)));
		max-height: min(36rem, calc(100vh - 5rem));
		padding: var(--space-2);
		overflow: auto;
		border: 0;
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		box-shadow: var(--shadow-overlay);
	}

	/* Space separates the heading and project action from the selectable rows. */
	.draft-menu__titlebar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-2) var(--space-3);
		margin: 0 0 var(--space-1);
	}

	.draft-menu__heading {
		margin: 0;
		font-size: var(--font-size-md);
		line-height: var(--line-height-tight);
	}

	/* The disclosure is the field's own end, not a button parked beside it: no box,
	   no fill of its own, and it keeps the field's height so the group reads as one
	   row. It stays muted until the control is in play. */
	:global(.draft-switcher) > .draft-menu {
		position: static;
	}

	summary:where(.draft-menu__trigger) {
		width: 1.5rem;
		min-height: var(--control-height-sm);
		margin-inline-end: var(--space-1);
		color: var(--color-text-muted);
	}

	:global(.draft-switcher:hover) .draft-menu__trigger,
	:global(.draft-switcher:focus-within) .draft-menu__trigger,
	.draft-menu[open] .draft-menu__trigger {
		color: var(--color-text);
	}

	/* Open is the one state the glyph carries itself: the list it points at is
	   below it, so the arrow turns to point back at the name. */
	.draft-menu :global(.draft-menu__chevron) {
		transition: transform var(--duration-fast) var(--ease-out-quart);
	}

	.draft-menu[open] :global(.draft-menu__chevron) {
		transform: rotate(180deg);
	}

	@media (prefers-reduced-motion: reduce) {
		.draft-menu :global(.draft-menu__chevron) {
			transition: none;
		}
	}
</style>
