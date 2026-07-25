<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { PerformerId, PerformerRecord } from '$lib/core/types.js';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import type { ScreenRect } from '../contracts.js';

	interface Props {
		performers: readonly PerformerRecord[];
		anchor?: ScreenRect;
		placement?: 'above' | 'below';
		initialSelectedIds?: readonly PerformerId[];
		prompt?: string;
		applyLabel?: string;
		returnFocusOnApply?: boolean;
		allowRemoval?: boolean;
		removalAvailable?: boolean;
		onApply: (performerIds: PerformerId[]) => void | Promise<void>;
		onCancel: () => void;
		returnFocus: () => void;
		onAddPerformer?: (displayName: string) => void;
	}

	let {
		performers,
		anchor,
		placement = 'above',
		initialSelectedIds = [],
		prompt,
		applyLabel = 'Apply',
		returnFocusOnApply = true,
		allowRemoval = true,
		removalAvailable = initialSelectedIds.length > 0,
		onApply,
		onCancel,
		returnFocus,
		onAddPerformer
	}: Props = $props();
	let activeIndex = $state(0);
	let keyboardNavigated = $state(false);
	let rosterScrollable = $state(false);
	let selectedIds = $state<PerformerId[]>([...untrack(() => initialSelectedIds)]);
	let adding = $state(false);
	let addName = $state('');
	let pendingAddName = $state<string | undefined>();
	let root: HTMLDivElement;
	let addInput = $state<HTMLInputElement | undefined>();
	const removalSelected = $derived(selectedIds.length === 0 && initialSelectedIds.length > 0);
	const canRemoveFormatting = $derived(
		allowRemoval && removalAvailable && initialSelectedIds.length > 0
	);
	const removalUnavailable = $derived(allowRemoval && removalSelected && !canRemoveFormatting);
	const selectionChanged = $derived(
		selectedIds.length !== initialSelectedIds.length ||
			selectedIds.some((id) => !initialSelectedIds.includes(id))
	);
	const canApply = $derived(
		(selectedIds.length > 0 || canRemoveFormatting) && (!allowRemoval || selectionChanged)
	);

	const position = $derived(
		anchor
			? `--ll-anchor-left: ${Math.max(8, anchor.left)}px; top: ${Math.max(8, placement === 'above' ? anchor.top : anchor.bottom + 6)}px;`
			: undefined
	);

	function chipButtons(): HTMLButtonElement[] {
		return root ? [...root.querySelectorAll<HTMLButtonElement>('[data-picker-chip]')] : [];
	}

	const trackRosterOverflow: Attachment<HTMLDivElement> = (node) => {
		const update = (): void => {
			rosterScrollable = node.scrollWidth > node.clientWidth;
		};
		const resizeObserver = new ResizeObserver(update);
		const mutationObserver = new MutationObserver(update);
		resizeObserver.observe(node);
		mutationObserver.observe(node, { childList: true, subtree: true, characterData: true });
		update();
		return () => {
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	};

	function focusActive(): void {
		chipButtons()[activeIndex]?.focus();
	}

	function move(delta: number): void {
		const chips = chipButtons();
		if (chips.length === 0) {
			return;
		}
		activeIndex = (activeIndex + delta + chips.length) % chips.length;
		void tick().then(focusActive);
	}

	// Roving tabindex leaves a single tab stop in the roster, so a plain Tab
	// would land on the workbench behind this card while it stays open — the
	// keyboard would then drive the page, not the picker. Cycle within instead;
	// Escape and Apply remain the ways out.
	function tabStops(): HTMLElement[] {
		if (!root) {
			return [];
		}
		const rosterStop = adding ? addInput : chipButtons()[activeIndex];
		return [
			...(rosterStop ? [rosterStop] : []),
			...root.querySelectorAll<HTMLButtonElement>('.actions button:not(:disabled)')
		];
	}

	function trapTab(event: KeyboardEvent): void {
		event.preventDefault();
		const stops = tabStops();
		if (stops.length < 2) {
			return;
		}
		const current = stops.findIndex((stop) => stop === document.activeElement);
		const delta = event.shiftKey ? -1 : 1;
		stops[(Math.max(0, current) + delta + stops.length) % stops.length]?.focus();
	}

	function toggle(id: PerformerId): void {
		selectedIds = selectedIds.includes(id)
			? selectedIds.filter((candidate) => candidate !== id)
			: [...selectedIds, id];
	}

	async function apply(): Promise<void> {
		if (!canApply) {
			return;
		}
		try {
			await onApply([...selectedIds]);
		} finally {
			await tick();
			if (returnFocusOnApply) {
				returnFocus();
			}
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

	// Pressing outside drops the assignment the same way Escape does, minus the
	// focus handoff: the press has already chosen where the user is working next.
	function dismiss(): void {
		onCancel();
	}

	async function beginAdd(): Promise<void> {
		activeIndex = performers.length;
		adding = true;
		await tick();
		addInput?.focus();
	}

	async function closeAdd(): Promise<void> {
		adding = false;
		addName = '';
		await tick();
		activeIndex = Math.min(activeIndex, Math.max(0, chipButtons().length - 1));
		focusActive();
	}

	function submitAdd(): void {
		const trimmed = addName.trim();
		if (!trimmed || !onAddPerformer) {
			return;
		}
		pendingAddName = trimmed;
		adding = false;
		addName = '';
		onAddPerformer(trimmed);
	}

	// When the roster gains the performer just added from the card, select the
	// new chip and move focus onto it so Enter immediately applies.
	$effect(() => {
		const expected = pendingAddName;
		if (expected === undefined) {
			return;
		}
		const index = performers.findIndex((performer) => performer.displayName === expected);
		if (index < 0) {
			return;
		}
		pendingAddName = undefined;
		const performer = performers[index];
		if (performer && !untrack(() => selectedIds).includes(performer.id)) {
			selectedIds = [...untrack(() => selectedIds), performer.id];
		}
		activeIndex = index;
		void tick().then(focusActive);
	});

	function handleAddInputKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			event.stopPropagation();
			submitAdd();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			void closeAdd();
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		// Runs before the add-input bail-out: Tab has to stay trapped there too.
		if (event.key === 'Tab') {
			trapTab(event);
			return;
		}
		if (adding && event.target === addInput) {
			return;
		}
		const performerButton =
			event.target instanceof HTMLElement
				? event.target.closest<HTMLButtonElement>('[data-performer]')
				: null;
		const addButton =
			event.target instanceof HTMLElement ? event.target.closest('.chip--add') : null;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				event.preventDefault();
				move(1);
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				event.preventDefault();
				move(-1);
				break;
			case ' ':
			case 'Spacebar': {
				if (addButton) {
					event.preventDefault();
					void beginAdd();
					break;
				}
				if (!performerButton) {
					break;
				}
				event.preventDefault();
				const performerId = performerButton.dataset.performer;
				if (performerId) {
					toggle(performerId);
				}
				break;
			}
			case 'Enter':
				if (addButton) {
					event.preventDefault();
					void beginAdd();
					break;
				}
				if (!performerButton) {
					break;
				}
				event.preventDefault();
				void apply();
				break;
			case 'Escape':
				event.preventDefault();
				void cancel();
				break;
		}
	}

	onMount(() => {
		focusActive();
		// The picker grabs focus the moment it opens, so :focus-visible would ring
		// the first chip before anyone navigated to it — that reads as a highlight
		// pointing at something rather than as a focus indicator. Reveal it on the
		// first Tab or arrow key instead, including a Tab arriving from outside.
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
		role="toolbar"
		tabindex="-1"
		aria-label="Assign performers"
		onkeydown={handleKeydown}
		onmousedown={(event) => {
			if (!(event.target instanceof HTMLElement && event.target.closest('input'))) {
				event.preventDefault();
			}
		}}
	>
		{#if prompt}
			<span class="picker__prompt">{prompt}</span>
		{/if}
		<div
			class="roster"
			class:roster--scrollable={rosterScrollable}
			aria-label="Performer roster"
		>
			<div class="roster__track" {@attach trackRosterOverflow}>
				{#each performers as performer, index (performer.id)}
					<button
						type="button"
						class="chip"
						data-picker-chip
						data-performer={performer.id}
						aria-pressed={selectedIds.includes(performer.id)}
						tabindex={index === activeIndex ? 0 : -1}
						style={`--dot-color: var(--performer-${performer.colorId}, var(--color-text-muted));`}
						onclick={() => toggle(performer.id)}
						onfocus={() => (activeIndex = index)}
					>
						<span class="chip__dot" aria-hidden="true"></span>
						{performer.displayName}
						{#if selectedIds.includes(performer.id)}
							<svg
								class="chip__check"
								aria-hidden="true"
								viewBox="0 0 16 16"
								width="11"
								height="11"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="m3.2 8.6 3 3.1 6.6-7.2" />
							</svg>
						{/if}
					</button>
				{/each}
			</div>
			{#if onAddPerformer}
				{#if adding}
					<input
						bind:this={addInput}
						bind:value={addName}
						class="chip chip--input"
						placeholder="Performer name"
						aria-label="New performer name"
						onkeydown={handleAddInputKeydown}
					/>
				{:else}
					<span class="add-slot">
						<button
							type="button"
							class="chip chip--add"
							data-picker-chip
							aria-label="Add a performer"
							tabindex={activeIndex === performers.length ? 0 : -1}
							onclick={beginAdd}
							onfocus={() => (activeIndex = performers.length)}
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 16 16"
								width="16"
								height="16"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
							>
								<path d="M8 3.2v9.6M3.2 8h9.6" />
							</svg>
						</button>
					</span>
					{#if performers.length === 0}
						<span class="picker__empty-hint">Add a performer</span>
					{/if}
				{/if}
			{/if}
		</div>
		<div class="actions">
			<button
				type="button"
				class="button button--contrast apply"
				disabled={!canApply}
				aria-describedby={removalUnavailable ? 'performer-removal-unavailable' : undefined}
				onclick={apply}
			>
				{removalSelected && allowRemoval
					? removalUnavailable
						? 'Already plain text'
						: 'Remove formatting'
					: applyLabel}
				<span aria-hidden="true" class="apply__key">↵</span>
			</button>
			{#if removalUnavailable}
				<span class="sr-only" id="performer-removal-unavailable">
					The main performer has no inline formatting to remove.
				</span>
			{/if}
		</div>
	</div>
</div>

<style>
	.picker-layer {
		z-index: var(--layer-picker);
		display: grid;
		max-width: min(34rem, calc(100vw - 1rem));
		gap: var(--space-1);
		justify-items: start;
	}

	.picker {
		display: flex;
		max-width: 100%;
		gap: var(--space-2);
		align-items: center;
		padding: var(--space-2);
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

	.picker__prompt {
		flex: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		white-space: nowrap;
	}

	.anchored {
		position: fixed;
		left: clamp(0.5rem, var(--ll-anchor-left), calc(100vw - 34.5rem));
		transform: translateY(calc(-100% - 0.45rem));
	}

	.anchored.below {
		transform: none;
	}

	.roster {
		--ring-space: calc(var(--focus-ring-width) + var(--focus-ring-offset));

		flex: 0 1 auto;
		display: flex;
		min-width: 0;
		gap: var(--space-1-5);
		align-items: center;
		margin: calc(-1 * var(--ring-space));
		margin-inline-end: calc(-1 * (var(--ring-space) + var(--space-1)));
	}

	.roster__track {
		/* Performer chips own the scroll viewport. The add control is its sibling,
		   so clipped chip content can never paint on the far side of the plus.
		   Padding reserves room for focus rings inside the clipped track. */
		flex: 0 1 auto;
		display: flex;
		min-width: 0;
		max-width: 20rem;
		gap: var(--space-1-5);
		padding: var(--ring-space);
		overflow-x: auto;
	}

	/* Roster chips are categorical elements, not action buttons, so the pill
	   radius is theirs alone — the apply action uses the global button tiers. */
	button.chip {
		flex: none;
		display: inline-flex;
		min-height: var(--control-height-sm);
		gap: var(--space-1-5);
		align-items: center;
		padding: var(--space-1) var(--space-2-5);
		border: var(--border-width) solid var(--color-control-border);
		border-radius: var(--radius-pill);
		background: transparent;
		color: inherit;
		font: inherit;
	}

	button.chip:hover {
		background: var(--color-control-hover);
	}

	.chip__dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: var(--radius-round);
		background: var(--dot-color);
		box-shadow: inset 0 0 0 1px color-mix(in oklch, currentColor 30%, transparent);
	}

	.chip__check {
		flex: none;
	}

	.add-slot {
		position: relative;
		z-index: 1;
		flex: none;
		display: flex;
		margin-inline-end: var(--ring-space);
		background: var(--color-overlay);
		isolation: isolate;
	}

	/* The track clips every performer at its own edge. This fade bridges that
	   edge to the fixed add control without needing to cover content behind it. */
	.roster--scrollable .add-slot::before {
		position: absolute;
		z-index: 0;
		inset-block: calc(-1 * var(--ring-space));
		inset-inline-end: 0;
		width: calc(100% + var(--space-6) + var(--space-1-5));
		background: linear-gradient(to right, transparent, var(--color-overlay) var(--space-6));
		content: '';
		pointer-events: none;
	}

	.chip--add {
		position: relative;
		z-index: 1;
		width: var(--control-height-sm);
		height: var(--control-height-sm);
		padding: 0;
		justify-content: center;
		border-style: dashed;
		border-radius: var(--radius-round);
		background: var(--color-overlay);
		color: var(--color-text-muted);
	}

	.chip--add:hover {
		color: inherit;
	}

	.chip--add svg {
		flex: none;
		width: var(--font-size-md);
		height: var(--font-size-md);
	}

	.chip--input {
		width: 9.5rem;
		min-height: var(--control-height-sm);
		padding: var(--space-0-5) var(--space-2-5);
		border: var(--border-width) solid var(--color-control-border);
		border-radius: var(--radius-pill);
		background: transparent;
		color: inherit;
		font: inherit;
	}

	.picker__empty-hint {
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	button[aria-pressed='true'] {
		border-color: color-mix(in oklch, var(--dot-color, var(--color-accent)) 65%, transparent);
		background: color-mix(in oklch, var(--dot-color, var(--color-accent)) 24%, transparent);
	}

	/* Colors, hover, and disabled treatment come from the global contrast tier;
	   only the compact geometry of this one-row picker is local. */
	.apply {
		flex: none;
		min-height: var(--control-height-sm);
		padding: var(--space-1) var(--space-2-5);
	}

	/* The shortcut glyph reads as secondary through weight and a mix against the
	   button's own fill, not through opacity — the label beside it has to keep
	   its full contrast on the inverted surface. */
	.apply__key {
		color: color-mix(in oklch, var(--color-canvas) 78%, var(--color-text));
		font-weight: var(--font-weight-regular);
	}

	/* The picker takes focus as it opens, so the global :focus-visible ring would
	   land on a chip nobody navigated to. Hold it back until the first Tab or
	   arrow key; text entry keeps its ring either way. */
	.picker:not(.show-focus) button:focus-visible {
		outline: none;
	}

	.show-focus button:focus-visible,
	input:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}

	.actions {
		/* The roster is the part that gives way when the row runs out of room (it
		   scrolls); without this the actions box shrinks under its own button and
		   the Apply pill hangs outside the picker's rounded edge. */
		flex: none;
		display: flex;
		gap: var(--space-1-5);
		padding-inline-start: var(--space-2);
		border-inline-start: var(--border-width) solid var(--color-border);
	}

	@media (prefers-reduced-motion: no-preference) {
		button,
		input {
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

		.picker {
			flex-wrap: wrap;
		}

		.roster {
			flex-basis: 100%;
		}

		.roster__track {
			max-width: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.picker {
			scroll-behavior: auto;
		}
	}
</style>
