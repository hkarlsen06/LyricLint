<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import type { ScreenRect } from '../contracts.js';
	import type { LinkOccurrence } from '../section-links.js';

	interface Props {
		/** Every section of this kind, in document order, the current one included. */
		occurrences: readonly LinkOccurrence[];
		/** The one the card was opened from: the source the others are written from. */
		currentHeaderFrom: number;
		/** Header offsets already tied to this one, so the card opens on the truth. */
		initialSelected?: readonly number[];
		anchor?: ScreenRect;
		placement?: 'above' | 'below';
		onApply: (headerOffsets: number[]) => void;
		onCancel: () => void;
		returnFocus: () => void;
	}

	let {
		occurrences,
		currentHeaderFrom,
		initialSelected = [],
		anchor,
		placement = 'above',
		onApply,
		onCancel,
		returnFocus
	}: Props = $props();

	const others = $derived(
		occurrences.filter((occurrence) => occurrence.headerFrom !== currentHeaderFrom)
	);
	const current = $derived(
		occurrences.find((occurrence) => occurrence.headerFrom === currentHeaderFrom)
	);
	const kind = $derived(current?.label.replace(/\s+\d+$/u, '') ?? 'section');
	// Roving tabindex counts only the rows that can be pressed, so the source's
	// own row — which is in the list, greyed, because that is where the reader
	// looks to see which one they are working from — has no index of its own.
	const rowIndex = $derived(
		new Map(others.map((occurrence, index) => [occurrence.headerFrom, index]))
	);

	let selected = $state<number[]>([...untrack(() => initialSelected)]);
	let activeIndex = $state(0);
	let keyboardNavigated = $state(false);
	let root: HTMLDivElement;

	// Whether the card *opened* on a group that was already complete, which is the
	// one state where the note has no linking left to describe: every peer is in,
	// so all that is on offer is taking one out.
	//
	// Read once, not derived live. Unticking a row would otherwise swap the
	// sentence back, and the two wrap to different heights — which is the resize
	// under the pointer this card is built not to do.
	const openedComplete = untrack(
		() => initialSelected.length > 0 && initialSelected.length === occurrences.length - 1
	);

	const wasLinked = $derived(initialSelected.length > 0);
	const changed = $derived(
		selected.length !== initialSelected.length ||
			selected.some((headerFrom) => !initialSelected.includes(headerFrom))
	);

	const position = $derived(
		anchor
			? `--ll-anchor-left: ${Math.max(8, anchor.left)}px; top: ${Math.max(8, placement === 'above' ? anchor.top : anchor.bottom + 6)}px;`
			: undefined
	);

	function rowInputs(): HTMLInputElement[] {
		return root ? [...root.querySelectorAll<HTMLInputElement>('[data-link-row]')] : [];
	}

	function focusActive(): void {
		rowInputs()[activeIndex]?.focus();
	}

	function move(delta: number): void {
		const rows = rowInputs();
		if (rows.length === 0) {
			return;
		}
		activeIndex = (activeIndex + delta + rows.length) % rows.length;
		void tick().then(focusActive);
	}

	// Roving tabindex leaves one stop in the list, so a plain Tab would land on
	// the workbench behind an open card. Cycle within; Escape and Apply are the
	// ways out. Same rule as the performer picker.
	function tabStops(): HTMLElement[] {
		if (!root) {
			return [];
		}
		const row = rowInputs()[activeIndex];
		return [
			...(row ? [row] : []),
			...root.querySelectorAll<HTMLButtonElement>('.actions button:not(:disabled)')
		];
	}

	function trapTab(event: KeyboardEvent): void {
		event.preventDefault();
		const stops = tabStops();
		if (stops.length < 2) {
			return;
		}
		const index = stops.findIndex((stop) => stop === document.activeElement);
		const delta = event.shiftKey ? -1 : 1;
		stops[(Math.max(0, index) + delta + stops.length) % stops.length]?.focus();
	}

	function toggle(headerFrom: number): void {
		selected = selected.includes(headerFrom)
			? selected.filter((candidate) => candidate !== headerFrom)
			: [...selected, headerFrom];
	}

	function apply(): void {
		if (!changed) {
			return;
		}
		const restoreFocus = returnFocus;
		// The source leads: it is the section the user is looking at, and linking
		// overwrites the others from it.
		onApply(selected.length > 0 ? [currentHeaderFrom, ...selected] : [currentHeaderFrom]);
		void tick().then(restoreFocus);
	}

	function cancel(): void {
		const restoreFocus = returnFocus;
		onCancel();
		void tick().then(restoreFocus);
	}

	// The press has already chosen where the user is working next, so unlike
	// Escape this hands no focus back.
	function dismiss(): void {
		onCancel();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Tab') {
			trapTab(event);
			return;
		}
		switch (event.key) {
			case 'ArrowDown':
			case 'ArrowRight':
				event.preventDefault();
				move(1);
				break;
			case 'ArrowUp':
			case 'ArrowLeft':
				event.preventDefault();
				move(-1);
				break;
			case 'Enter':
				event.preventDefault();
				apply();
				break;
			case 'Escape':
				event.preventDefault();
				cancel();
				break;
		}
	}

	onMount(() => {
		focusActive();
		// The card takes focus as it opens, so :focus-visible would ring the first
		// row before anyone navigated to it. Reveal on the first Tab or arrow.
		const revealFocusRing = (event: KeyboardEvent): void => {
			if (event.key === 'Tab' || event.key.startsWith('Arrow')) {
				keyboardNavigated = true;
			}
		};
		window.addEventListener('keydown', revealFocusRing, true);
		return () => window.removeEventListener('keydown', revealFocusRing, true);
	});
</script>

<div
	class="picker-layer"
	class:anchored={anchor}
	class:below={anchor && placement === 'below'}
	style={position}
	{@attach dismissOnOutside(dismiss)}
>
	<div
		bind:this={root}
		class="picker"
		class:show-focus={keyboardNavigated}
		role="dialog"
		tabindex="-1"
		aria-label={`Link this ${kind.toLocaleLowerCase()}`}
		onkeydown={handleKeydown}
		onmousedown={(event) => event.preventDefault()}
	>
		<p class="picker__prompt">Link this {kind.toLocaleLowerCase()} to</p>
		<ul class="rows">
			{#each occurrences as occurrence (occurrence.headerFrom)}
				{@const isCurrent = occurrence.headerFrom === currentHeaderFrom}
				{@const isSelected = selected.includes(occurrence.headerFrom)}
				<li>
					{#if isCurrent}
						<label class="row row--current">
							<input class="row__check" type="checkbox" checked disabled />
							<span class="row__label">{kind} {occurrence.ordinal}</span>
							<span class="row__meta">This section · line {occurrence.line}</span>
						</label>
					{:else}
						<label class="row" class:row--matching={occurrence.comparison === 'same'}>
							<input
								type="checkbox"
								data-link-row
								data-header={occurrence.headerFrom}
								class="row__check"
								checked={isSelected}
								tabindex={rowIndex.get(occurrence.headerFrom) === activeIndex ? 0 : -1}
								onchange={() => toggle(occurrence.headerFrom)}
								onfocus={() => (activeIndex = rowIndex.get(occurrence.headerFrom) ?? 0)}
							/>
							<span class="row__label">{kind} {occurrence.ordinal}</span>
							<span class="row__meta">
								{occurrence.comparison === 'same'
									? 'Same lyrics'
									: occurrence.comparison === 'empty'
										? 'Empty'
										: 'Different lyrics'}
								· line {occurrence.line}
							</span>
						</label>
					{/if}
				</li>
			{/each}
		</ul>
		<!-- One sentence per *opening*, never one per tick. Which of the three it is
		     depends only on the state the card opened in, so the note cannot rewrap
		     to a different height under the pointer that just ticked a row. -->
		<p class="picker__note">
			{others.length === 0
				? `This is the only ${kind.toLocaleLowerCase()} in the song.`
				: openedComplete
					? `These ${occurrences.length} sections are linked. Editing one edits the others.`
					: `Linking replaces their words with this ${kind.toLocaleLowerCase()}’s, and keeps them in step.`}
		</p>
		<div class="actions">
			<button
				type="button"
				class="button button--contrast apply"
				disabled={!changed}
				onclick={apply}
			>
				{selected.length > 0
					? `Link ${selected.length + 1} sections`
					: wasLinked
						? 'Unlink'
						: 'Link'}
				<span aria-hidden="true" class="apply__key">↵</span>
			</button>
			<button type="button" class="button button--quiet" onclick={cancel}>Cancel</button>
		</div>
	</div>
</div>

<style>
	/* A width, not a max-width. Sized to its content the card grew and shrank as
	   rows were ticked — and it hangs from its own bottom edge, so every change
	   moved it under the pointer that caused it. Nothing in here may depend on
	   what is selected. */
	.picker-layer {
		z-index: var(--layer-picker);
		display: grid;
		width: min(24rem, calc(100vw - 1rem));
	}

	.picker {
		display: grid;
		width: 100%;
		gap: var(--space-2);
		padding: var(--space-2-5);
		border: var(--border-width) solid var(--color-border-strong);
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
		left: clamp(0.5rem, var(--ll-anchor-left), calc(100vw - 24.5rem));
		transform: translateY(calc(-100% - 0.45rem));
	}

	.anchored.below {
		transform: none;
	}

	/* The card's own question, in the card's own type: set muted and small it
	   reads as a caption on the list rather than as the thing being asked. */
	.picker__prompt {
		margin: 0;
		font-weight: var(--font-weight-semibold);
	}

	.picker__note {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-regular);
	}

	.rows {
		display: grid;
		max-height: 13rem;
		margin: 0;
		padding: 0;
		gap: var(--space-0-5);
		overflow-y: auto;
		list-style: none;
	}

	.rows li {
		margin: 0;
	}

	/* Rows, not action buttons: full width, start-aligned, selection carried by
	   the row itself. The apply action uses the global tiers. */
	.row {
		display: flex;
		width: 100%;
		min-height: var(--control-height-sm);
		gap: var(--space-2);
		align-items: center;
		padding: var(--space-1) var(--space-2);
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-control);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: start;
	}

	.row:hover:not(.row--current) {
		background: var(--color-control-hover);
	}

	/* The source is greyed rather than dimmed: an opaque muted color, never
	   opacity, which would drop the whole row's contrast below AA. */
	.row--current {
		color: var(--color-text-muted);
	}

	.row--matching .row__meta {
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}

	.row:has(.row__check:checked):not(.row--current) {
		border-color: var(--color-border-strong);
		background: var(--color-selected);
	}

	.row__check {
		flex: none;
		width: 1rem;
		height: 1rem;
		margin: 0;
		accent-color: var(--color-accent);
		opacity: 1;
	}

	.row__label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row__meta {
		flex: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-variant-numeric: tabular-nums;
	}

	/* The apply action takes the row's free width rather than its own label's, so
	   `Link` becoming `Link 3 sections` moves neither button. */
	.actions {
		display: grid;
		gap: var(--space-1-5);
		grid-template-columns: 1fr auto;
	}

	.apply {
		min-height: var(--control-height-sm);
		padding: var(--space-1) var(--space-2-5);
	}

	/* Secondary through weight and a mix against the button's own fill, never
	   opacity: the label beside it keeps full contrast on the inverted surface. */
	.apply__key {
		color: color-mix(in oklch, var(--color-canvas) 78%, var(--color-text));
		font-weight: var(--font-weight-regular);
	}

	.picker:not(.show-focus) :is(button, input):focus-visible {
		outline: none;
	}

	.show-focus :is(button, input):focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}

	@media (prefers-reduced-motion: no-preference) {
		button {
			transition:
				background-color var(--duration-fast) var(--ease-out-quart),
				border-color var(--duration-fast) var(--ease-out-quart),
				color var(--duration-fast) var(--ease-out-quart);
		}
	}

	@media (max-width: 34rem) {
		.picker-layer {
			right: 0.5rem;
			left: 0.5rem !important;
			max-width: none;
		}
	}
</style>
