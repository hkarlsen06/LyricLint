<script lang="ts">
	/**
	 * A shortcut as the reader presses it: the Windows and Linux keys, then the
	 * Mac keys when they differ. Both are always in the markup, so the page is
	 * the same for everyone and nothing reflows once a script decides which
	 * machine it is on.
	 */
	import { comboDiffersOnMac, formatCombo, type KeyLabel } from '$lib/docs/keys.js';
	import * as Kbd from '$lib/ui/primitives/kbd/index.js';

	let { combo }: { combo: string } = $props();

	const other = $derived(formatCombo(combo, 'other'));
	const mac = $derived(comboDiffersOnMac(combo) ? formatCombo(combo, 'mac') : undefined);
</script>

{#snippet keys(labels: KeyLabel[])}
	<Kbd.Group>
		{#each labels as key, index (index)}
			<Kbd.Root>
				{#if key.name}
					<span aria-hidden="true">{key.label}</span><span class="sr-only">{key.name}</span>
				{:else}
					{key.label}
				{/if}
			</Kbd.Root>
		{/each}
	</Kbd.Group>
{/snippet}

<span class="keys"
	>{@render keys(other)}{#if mac}
		or {@render keys(mac)}<span class="sr-only">on a Mac</span>{/if}</span
>

<style>
	/* The pair stays on one line where it can, and breaks at the "or" when the
	   measure runs out, never inside a combination. */
	.keys {
		color: var(--color-text-muted);
	}
</style>
