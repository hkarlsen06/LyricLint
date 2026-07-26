<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { LanguagePack } from '$lib/core/types.js';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import type { ScreenRect, SectionHeaderChoice } from '../contracts.js';
	import { sectionHeaderOptions, type SectionHeaderNeighbors } from './section-picker.js';
	import { anchoredPosition } from './anchored-position.js';

	interface Props {
		languagePack: LanguagePack;
		existingHeaders?: readonly string[];
		neighbors?: SectionHeaderNeighbors;
		range: { from: number; to: number };
		anchor?: ScreenRect;
		onChoose: (choice: SectionHeaderChoice) => void | Promise<void>;
		onCancel: () => void;
		returnFocus: () => void;
	}

	let {
		languagePack,
		existingHeaders = [],
		neighbors = {},
		range,
		anchor,
		onChoose,
		onCancel,
		returnFocus
	}: Props = $props();
	let query = $state('');
	let activeIndex = $state(0);
	let input: HTMLInputElement;
	const options = $derived(sectionHeaderOptions(languagePack, existingHeaders, query, neighbors));
	const position = $derived(anchor ? anchoredPosition(anchor) : undefined);

	$effect(() => {
		if (activeIndex >= options.length) {
			activeIndex = Math.max(0, options.length - 1);
		}
	});

	async function choose(index = activeIndex): Promise<void> {
		const option = options[index];
		if (!option) {
			return;
		}
		try {
			await onChoose({
				range,
				headerName: option.headerName,
				ordinal: option.ordinal,
				numberedHeaderTerms: option.numberedHeaderTerms
			});
		} finally {
			await tick();
			returnFocus();
		}
	}

	async function cancel(): Promise<void> {
		try {
			onCancel();
		} finally {
			await tick();
			returnFocus();
		}
	}

	// Pressing outside abandons the header the same way Cancel does, minus the
	// focus handoff: the press has already chosen where the user is working next.
	function dismiss(): void {
		onCancel();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeIndex = options.length ? (activeIndex + 1) % options.length : 0;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = options.length ? (activeIndex - 1 + options.length) % options.length : 0;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			void choose();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			void cancel();
		}
	}

	onMount(() => input.focus());
</script>

<div
	class="picker"
	class:anchored={anchor}
	style={position}
	role="dialog"
	aria-label="Add section header"
	{@attach dismissOnOutside(dismiss)}
>
	<label for="ll-section-search">Section header</label>
	<input
		bind:this={input}
		id="ll-section-search"
		bind:value={query}
		type="search"
		autocomplete="off"
		aria-controls="ll-section-results"
		aria-activedescendant={options[activeIndex] ? `ll-section-option-${activeIndex}` : undefined}
		onkeydown={handleKeydown}
	/>
	<ul id="ll-section-results" role="listbox" aria-label={`${languagePack.displayName} headers`}>
		{#each options as option, index (`${option.headerName}:${option.ordinal ?? ''}:${option.custom ?? false}`)}
			<li
				id={`ll-section-option-${index}`}
				role="option"
				aria-selected={index === activeIndex}
				onmouseenter={() => (activeIndex = index)}
			>
				<button type="button" tabindex="-1" onclick={() => choose(index)}>
					{option.label}
				</button>
			</li>
		{/each}
	</ul>
	<button type="button" class="button" onclick={cancel}>Cancel</button>
</div>

<style>
	.picker {
		--ll-card-width: min(21rem, calc(100vw - 1rem));

		z-index: calc(var(--layer-picker) + 1);
		width: var(--ll-card-width);
		padding: var(--space-2-5);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
		font-family: var(--font-ui);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-tight);
	}

	/* `--ll-anchor-space` is the room on the side the card landed on; the list
	   inside is already capped, so this only bites on a very short viewport. */
	.anchored {
		max-height: var(--ll-anchor-space, none);
		overflow-y: auto;
		position: fixed;
	}

	label {
		display: block;
		margin-block-end: var(--space-1-5);
		font-weight: var(--font-weight-semibold);
	}

	/* Surface, border, and focus come from the global control vocabulary; only
	   the full-width layout is local. */
	input {
		width: 100%;
	}

	ul {
		max-height: 13rem;
		margin: var(--space-2) 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	li {
		margin: 0;
	}

	li[aria-selected='true'] {
		background: var(--color-selected);
	}

	/* Listbox options are rows, not action buttons: full-width, start-aligned,
	   selection carried by the row. The cancel action uses the global tier. */
	li button {
		width: 100%;
		min-height: var(--control-height-md);
		padding: var(--control-padding-block) var(--control-padding-inline);
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-control);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: start;
	}

	li button:hover {
		background: var(--color-control-hover);
	}

	@media (prefers-reduced-motion: no-preference) {
		input,
		button {
			transition:
				background-color var(--duration-fast) var(--ease-out-quart),
				border-color var(--duration-fast) var(--ease-out-quart),
				color var(--duration-fast) var(--ease-out-quart);
		}
	}
</style>
