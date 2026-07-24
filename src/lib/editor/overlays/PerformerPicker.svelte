<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import type { PerformerId, PerformerRecord } from '../../core/types.js';
	import type { ScreenRect } from '../contracts.js';

	interface Props {
		performers: readonly PerformerRecord[];
		anchor?: ScreenRect;
		placement?: 'above' | 'below';
		initialSelectedIds?: readonly PerformerId[];
		onApply: (performerIds: PerformerId[]) => void | Promise<void>;
		onCancel: () => void;
		returnFocus: () => void;
		onManageRoster?: () => void;
	}

	let {
		performers,
		anchor,
		placement = 'above',
		initialSelectedIds = [],
		onApply,
		onCancel,
		returnFocus,
		onManageRoster
	}: Props = $props();
	let activeIndex = $state(0);
	let selectedIds = $state<PerformerId[]>([...untrack(() => initialSelectedIds)]);
	let root: HTMLDivElement;

	const position = $derived(
		anchor
			? `--ll-anchor-left: ${Math.max(8, anchor.left)}px; top: ${Math.max(8, placement === 'above' ? anchor.top : anchor.bottom + 6)}px;`
			: undefined
	);

	function performerButtons(): HTMLButtonElement[] {
		return root ? [...root.querySelectorAll<HTMLButtonElement>('[data-performer]')] : [];
	}

	function focusActive(): void {
		performerButtons()[activeIndex]?.focus();
	}

	function move(delta: number): void {
		if (performers.length === 0) {
			return;
		}
		activeIndex = (activeIndex + delta + performers.length) % performers.length;
		void tick().then(focusActive);
	}

	function toggle(id: PerformerId): void {
		selectedIds = selectedIds.includes(id)
			? selectedIds.filter((candidate) => candidate !== id)
			: [...selectedIds, id];
	}

	async function apply(): Promise<void> {
		if (selectedIds.length === 0) {
			return;
		}
		try {
			await onApply([...selectedIds]);
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
		const performerButton =
			event.target instanceof HTMLElement
				? event.target.closest<HTMLButtonElement>('[data-performer]')
				: null;
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
	});
</script>

<div
	class="picker-layer"
	class:anchored={anchor}
	class:below={anchor && placement === 'below'}
	style={position}
>
	<div
		bind:this={root}
		class="picker"
		role="toolbar"
		tabindex="-1"
		aria-label="Assign performers"
		onkeydown={handleKeydown}
		onmousedown={(event) => event.preventDefault()}
	>
		<div class="roster" aria-label="Performer roster">
			{#each performers as performer, index (performer.id)}
				<button
					type="button"
					class="chip"
					data-performer={performer.id}
					aria-pressed={selectedIds.includes(performer.id)}
					tabindex={index === activeIndex ? 0 : -1}
					onclick={() => toggle(performer.id)}
					onfocus={() => (activeIndex = index)}
				>
					<span
						class="chip__dot"
						aria-hidden="true"
						style={`--dot-color: var(--performer-${performer.colorId}, var(--color-text-muted, currentColor));`}
					></span>
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
			{#if onManageRoster}
				<button
					type="button"
					class="chip chip--add"
					aria-label="Manage performers in the Performers panel"
					onclick={onManageRoster}
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 16 16"
						width="12"
						height="12"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
					>
						<path d="M8 3.2v9.6M3.2 8h9.6" />
					</svg>
				</button>
			{/if}
		</div>
		<div class="actions">
			<button type="button" class="apply" disabled={selectedIds.length === 0} onclick={apply}>
				Apply <span aria-hidden="true" class="apply__key">↵</span>
			</button>
			<button type="button" class="cancel" onclick={cancel}>Cancel</button>
		</div>
	</div>
	<p class="hint" aria-hidden="true">Alt+P · Esc cancels, focus returns to editor</p>
</div>

<style>
	.picker-layer {
		z-index: 30;
		display: grid;
		max-width: min(34rem, calc(100vw - 1rem));
		gap: 0.3rem;
		justify-items: start;
	}

	.picker {
		display: flex;
		max-width: 100%;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem;
		border: 1px solid var(--color-border-strong, oklch(0.65 0.025 70));
		border-radius: var(--radius-panel, 0.65rem);
		background: var(--color-surface, oklch(0.991 0.005 78));
		color: var(--color-text, oklch(0.24 0.018 65));
		box-shadow: var(--shadow-overlay, 0 2px 8px oklch(0.2 0.01 70 / 0.14));
		font:
			500 0.8125rem/1.25 var(--font-ui, ui-sans-serif),
			system-ui,
			sans-serif;
	}

	.anchored {
		position: fixed;
		left: clamp(0.5rem, var(--ll-anchor-left), calc(100vw - 34.5rem));
		transform: translateY(calc(-100% - 0.45rem));
	}

	.anchored.below {
		transform: none;
	}

	.hint {
		margin: 0;
		padding-inline: 0.25rem;
		color: var(--color-text-muted, oklch(0.44 0.016 65));
		font:
			400 0.7rem/1.3 var(--font-ui, ui-sans-serif),
			system-ui,
			sans-serif;
		text-shadow: 0 1px 2px var(--color-canvas, transparent);
	}

	.anchored .hint {
		padding: 0.1rem 0.4rem;
		border-radius: 0.4rem;
		background: color-mix(in oklch, var(--color-surface, oklch(0.99 0.005 78)) 88%, transparent);
	}

	.roster {
		display: flex;
		min-width: 0;
		gap: 0.35rem;
		overflow-x: auto;
	}

	button {
		flex: none;
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		padding: 0.34rem 0.6rem;
		border: 1px solid var(--color-border-input, oklch(0.65 0.025 70));
		border-radius: var(--radius-pill, 999rem);
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	button:hover {
		background: var(--color-surface-subtle, oklch(0.953 0.01 78));
	}

	.chip__dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: var(--dot-color);
		box-shadow: inset 0 0 0 1px color-mix(in oklch, currentColor 30%, transparent);
	}

	.chip__check {
		flex: none;
	}

	.chip--add {
		padding-inline: 0.5rem;
		border-style: dashed;
		color: var(--color-text-muted, oklch(0.44 0.016 65));
	}

	.chip--add:hover {
		color: inherit;
	}

	button[aria-pressed='true'] {
		border-color: var(--color-accent, oklch(0.48 0.13 42));
		background: var(--color-accent-soft, oklch(0.93 0.03 55));
	}

	.apply {
		border-color: var(--color-accent, oklch(0.48 0.13 42));
		background: var(--color-accent, oklch(0.48 0.13 42));
		color: var(--color-accent-text, oklch(0.98 0.006 78));
		font-weight: 650;
	}

	.apply:hover:not(:disabled) {
		border-color: var(--color-accent-hover, oklch(0.42 0.13 42));
		background: var(--color-accent-hover, oklch(0.42 0.13 42));
	}

	.apply__key {
		opacity: 0.75;
		font-weight: 400;
	}

	button:focus-visible {
		outline: 2px solid var(--color-focus, oklch(0.54 0.15 255));
		outline-offset: 2px;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.actions {
		display: flex;
		gap: 0.35rem;
		padding-inline-start: 0.5rem;
		border-inline-start: 1px solid var(--color-border, oklch(0.82 0.018 72));
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
	}

	@media (prefers-reduced-motion: reduce) {
		.picker {
			scroll-behavior: auto;
		}
	}
</style>
