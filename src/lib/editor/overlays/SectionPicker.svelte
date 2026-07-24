<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { LanguagePack } from '../../core/types.js';
	import type { ScreenRect, SectionHeaderChoice } from '../contracts.js';
	import { sectionHeaderOptions } from './section-picker.js';

	interface Props {
		languagePack: LanguagePack;
		existingHeaders?: readonly string[];
		range: { from: number; to: number };
		anchor?: ScreenRect;
		onChoose: (choice: SectionHeaderChoice) => void | Promise<void>;
		onCancel: () => void;
		returnFocus: () => void;
	}

	let {
		languagePack,
		existingHeaders = [],
		range,
		anchor,
		onChoose,
		onCancel,
		returnFocus
	}: Props = $props();
	let query = $state('');
	let activeIndex = $state(0);
	let input: HTMLInputElement;
	const options = $derived(sectionHeaderOptions(languagePack, existingHeaders, query));
	const position = $derived(
		anchor
			? `left: ${Math.max(8, anchor.left)}px; top: ${Math.max(8, anchor.bottom + 6)}px;`
			: undefined
	);

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
				ordinal: option.ordinal
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
	<button type="button" class="cancel" onclick={cancel}>Cancel</button>
</div>

<style>
	.picker {
		z-index: calc(var(--layer-picker) + 1);
		width: min(21rem, calc(100vw - 1rem));
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

	.anchored {
		position: fixed;
	}

	label {
		display: block;
		margin-block-end: var(--space-1-5);
		font-weight: var(--font-weight-semibold);
	}

	input {
		box-sizing: border-box;
		width: 100%;
		min-height: var(--control-height-md);
		padding: var(--control-padding-block) var(--control-padding-inline);
		border: var(--border-width) solid var(--color-control-border);
		border-radius: var(--radius-control);
		background: var(--color-control);
		color: inherit;
		font: inherit;
	}

	input:focus-visible,
	button:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
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

	li button,
	.cancel {
		width: 100%;
		min-height: var(--control-height-md);
		padding: var(--control-padding-block) var(--control-padding-inline);
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-control);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;
	}

	.cancel {
		width: auto;
		border-color: var(--color-control-border);
	}

	li button:hover,
	.cancel:hover {
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
