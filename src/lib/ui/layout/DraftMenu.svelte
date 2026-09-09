<script lang="ts">
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
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
     because Escape has to be caught wherever focus is standing — including on
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
	     is, and the disclosure beside it says which others there are. Icon only —
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
		<ChevronDown class="draft-menu__chevron" aria-hidden="true" size={13} strokeWidth={2.25} />
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
