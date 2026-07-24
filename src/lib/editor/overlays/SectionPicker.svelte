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
		z-index: 31;
		width: min(21rem, calc(100vw - 1rem));
		padding: 0.65rem;
		border: 1px solid var(--ll-border, oklch(0.78 0.012 75));
		border-radius: 0.5rem;
		background: var(--ll-surface, oklch(0.985 0.006 78));
		color: var(--ll-text, oklch(0.24 0.015 70));
		box-shadow: 0 2px 8px oklch(0.2 0.01 70 / 0.14);
		font:
			500 0.8125rem/1.3 ui-sans-serif,
			system-ui,
			sans-serif;
	}

	.anchored {
		position: fixed;
	}

	label {
		display: block;
		margin-block-end: 0.35rem;
		font-weight: 650;
	}

	input {
		box-sizing: border-box;
		width: 100%;
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--ll-border-strong, oklch(0.65 0.02 75));
		border-radius: 0.375rem;
		background: var(--ll-input, oklch(0.99 0.004 78));
		color: inherit;
		font: inherit;
	}

	input:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--ll-focus, oklch(0.58 0.14 55));
		outline-offset: 2px;
	}

	ul {
		max-height: 13rem;
		margin: 0.45rem 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	li {
		margin: 0;
	}

	li[aria-selected='true'] {
		background: var(--ll-selected, oklch(0.9 0.045 62));
	}

	li button,
	.cancel {
		width: 100%;
		padding: 0.42rem 0.5rem;
		border: 0;
		border-radius: 0.25rem;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;
	}

	.cancel {
		width: auto;
		border: 1px solid var(--ll-border, oklch(0.78 0.012 75));
	}
</style>
