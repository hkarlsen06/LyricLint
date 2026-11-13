<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { dismissOnOutside } from '#lib/interaction/dismiss.js';
	import { sectionTypeOptions, type SectionType } from '#lib/conversion/section-types.js';
	import type { ScreenRect } from '../contracts.js';
	import { anchoredPosition } from './anchored-position.js';

	interface Props {
		/** The tag the stanza already carries, when it begins a section. */
		current?: SectionType;
		/** The section's own name, when no type stands for it. */
		currentName?: string;
		/** The tag of an identically worded stanza: the row the keys start on. */
		suggested?: SectionType;
		/** The stanza's first line, so the card says what it is about to tag. */
		opening: string;
		anchor?: ScreenRect;
		onChoose: (type: SectionType) => void;
		/** Offered only for a tag that can come off here. */
		onRemove?: () => void;
		/** Offered only for a stanza that begins a section. */
		onOptions?: () => void;
		onCancel: () => void;
		returnFocus: () => void;
	}

	let {
		current,
		currentName,
		suggested,
		opening,
		anchor,
		onChoose,
		onRemove,
		onOptions,
		onCancel,
		returnFocus
	}: Props = $props();

	// Every type starts with its own letter, so one key names one tag.
	const options = sectionTypeOptions.map((option) => ({
		...option,
		key: option.label[0]!.toLocaleLowerCase()
	}));
	const tagged = $derived(current !== undefined || currentName !== undefined);
	let activeIndex = $state(
		Math.max(
			0,
			options.findIndex((option) => option.value === (current ?? suggested))
		)
	);
	let list: HTMLUListElement;
	const position = $derived(anchor ? anchoredPosition(anchor) : undefined);

	// Each way out closes the card, so the hand-off is held before the call that
	// destroys this component, as `SectionPicker` does.
	async function leave(act: () => void, focusEditor = true): Promise<void> {
		const restoreFocus = returnFocus;
		act();
		if (!focusEditor) return;
		await tick();
		restoreFocus();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			void leave(onCancel);
			return;
		}
		if (event.target !== list || event.metaKey || event.ctrlKey || event.altKey) return;
		const last = options.length - 1;
		if (event.key === 'ArrowDown') activeIndex = activeIndex === last ? 0 : activeIndex + 1;
		else if (event.key === 'ArrowUp') activeIndex = activeIndex === 0 ? last : activeIndex - 1;
		else if (event.key === 'Home') activeIndex = 0;
		else if (event.key === 'End') activeIndex = last;
		else if (event.key === 'Enter' || event.key === ' ')
			void leave(() => onChoose(options[activeIndex]!.value));
		else {
			const option = options.find((entry) => entry.key === event.key.toLocaleLowerCase());
			if (!option) return;
			void leave(() => onChoose(option.value));
		}
		event.preventDefault();
	}

	onMount(() => list.focus());
</script>

<div
	class="picker"
	class:anchored={anchor}
	style={position}
	role="dialog"
	tabindex="-1"
	aria-labelledby="ll-section-tag-title"
	onkeydown={handleKeydown}
	{@attach dismissOnOutside(onCancel)}
>
	<p id="ll-section-tag-title" class="title">{tagged ? 'Change section tag' : 'Tag this stanza'}</p>
	<p class="opening">{opening || 'Empty line'}</p>
	<ul
		bind:this={list}
		role="listbox"
		tabindex="0"
		aria-labelledby="ll-section-tag-title"
		aria-activedescendant={`ll-section-tag-${activeIndex}`}
	>
		{#each options as option, index (option.value)}
			<!-- The listbox owns the keys; a row answers the pointer. -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<li
				id={`ll-section-tag-${index}`}
				role="option"
				aria-selected={option.value === current}
				data-active={index === activeIndex ? '' : undefined}
				onpointermove={() => (activeIndex = index)}
				onclick={() => leave(() => onChoose(option.value))}
			>
				<span class="mark" aria-hidden="true">{option.value === current ? '✓' : ''}</span>
				<span class="name"
					>{option.label}{#if option.value === suggested && !tagged}<span class="hint">
							· suggested</span
						>{/if}</span
				>
				<kbd aria-hidden="true">{option.key.toLocaleUpperCase()}</kbd>
			</li>
		{/each}
	</ul>
	{#if onRemove || onOptions}
		<div class="actions">
			{#if onRemove}<button
					type="button"
					class="button button--quiet"
					onclick={() => leave(onRemove)}>Remove tag</button
				>{/if}
			{#if onOptions}<button
					type="button"
					class="button button--quiet"
					onclick={() => leave(onOptions, false)}>Section options</button
				>{/if}
		</div>
	{/if}
</div>

<style>
	.picker {
		--ll-card-width: min(17rem, calc(100vw - 1rem));

		z-index: calc(var(--layer-picker) + 1);
		width: var(--ll-card-width);
		padding: var(--space-2);
		border: 0;
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
		max-height: var(--ll-anchor-space, none);
		overflow-y: auto;
		position: fixed;
	}

	.title,
	.opening {
		margin: 0;
		padding-inline: var(--space-2);
	}

	.title {
		padding-block-start: var(--space-1);
		font-weight: var(--font-weight-semibold);
	}

	/* The line being tagged, in the lyric face it is written in. */
	.opening {
		overflow: hidden;
		padding-block: var(--space-1) var(--space-2);
		color: var(--color-text-muted);
		font-family: var(--font-lyrics);
		font-weight: var(--font-weight-regular);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		border-radius: var(--radius-control);
	}

	li {
		display: grid;
		min-height: var(--control-height-md);
		padding: var(--control-padding-block) var(--space-2);
		border-radius: var(--radius-control);
		grid-template-columns: 1rem minmax(0, 1fr) auto;
		gap: var(--space-1-5);
		align-items: center;
		cursor: pointer;
		user-select: none;
	}

	li[data-active] {
		background: var(--color-fill);
	}

	/* The list holds the focus and the row shows it: the ring belongs on the
	   row the keys will act on, not around all seven. */
	ul:focus-visible {
		outline: none;
	}

	ul:focus-visible li[data-active] {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}

	.mark {
		color: var(--color-accent);
		font-weight: var(--font-weight-bold);
	}

	.hint {
		color: var(--color-text-muted);
		font-weight: var(--font-weight-regular);
	}

	kbd {
		min-width: 1.25rem;
		padding-inline: var(--space-1);
		border-radius: var(--radius-xs);
		background: var(--color-fill-subtle);
		box-shadow: var(--shadow-control);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		text-align: center;
	}

	li[data-active] kbd {
		background: var(--color-overlay);
		color: var(--color-text);
	}

	.actions {
		display: flex;
		margin-block-start: var(--space-2);
		padding-block-start: var(--space-2);
		border-block-start: var(--border-width) solid var(--color-border);
		gap: var(--space-1);
		justify-content: space-between;
	}

	@media (pointer: coarse) {
		li {
			min-height: var(--control-height-touch);
		}

		/* A touch keyboard has no letter to press. */
		kbd {
			display: none;
		}
	}
</style>
