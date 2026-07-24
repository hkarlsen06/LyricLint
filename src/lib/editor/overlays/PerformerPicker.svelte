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
	}

	let {
		performers,
		anchor,
		placement = 'above',
		initialSelectedIds = [],
		onApply,
		onCancel,
		returnFocus
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
				event.preventDefault();
				const performer = performers[activeIndex];
				if (performer) {
					toggle(performer.id);
				}
				break;
			}
			case 'Enter':
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
	bind:this={root}
	class="picker"
	class:anchored={anchor}
	class:below={anchor && placement === 'below'}
	style={position}
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
				data-performer
				aria-pressed={selectedIds.includes(performer.id)}
				tabindex={index === activeIndex ? 0 : -1}
				onclick={() => toggle(performer.id)}
				onfocus={() => (activeIndex = index)}
			>
				{performer.displayName}
			</button>
		{/each}
	</div>
	<div class="actions">
		<button type="button" class="apply" disabled={selectedIds.length === 0} onclick={apply}>
			Apply
		</button>
		<button type="button" onclick={cancel}>Cancel</button>
	</div>
</div>

<style>
	.picker {
		z-index: 30;
		display: flex;
		max-width: min(32rem, calc(100vw - 1rem));
		gap: 0.5rem;
		align-items: center;
		padding: 0.45rem;
		border: 1px solid var(--ll-border, oklch(0.78 0.012 75));
		border-radius: 0.5rem;
		background: var(--ll-surface, oklch(0.985 0.006 78));
		color: var(--ll-text, oklch(0.24 0.015 70));
		box-shadow: 0 2px 8px oklch(0.2 0.01 70 / 0.14);
		font:
			500 0.8125rem/1.25 ui-sans-serif,
			system-ui,
			sans-serif;
	}

	.anchored {
		position: fixed;
		left: clamp(0.5rem, var(--ll-anchor-left), calc(100vw - 32.5rem));
		transform: translateY(calc(-100% - 0.45rem));
	}

	.anchored.below {
		transform: none;
	}

	.roster {
		display: flex;
		min-width: 0;
		gap: 0.3rem;
		overflow-x: auto;
	}

	button {
		flex: none;
		padding: 0.34rem 0.55rem;
		border: 1px solid var(--ll-border, oklch(0.78 0.012 75));
		border-radius: 0.375rem;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	button:hover {
		background: var(--ll-hover, oklch(0.94 0.012 75));
	}

	button[aria-pressed='true'],
	.apply {
		border-color: var(--ll-accent, oklch(0.57 0.12 48));
		background: var(--ll-selected, oklch(0.9 0.045 62));
	}

	button:focus-visible {
		outline: 2px solid var(--ll-focus, oklch(0.58 0.14 55));
		outline-offset: 2px;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.actions {
		display: flex;
		gap: 0.3rem;
		padding-inline-start: 0.5rem;
		border-inline-start: 1px solid var(--ll-border, oklch(0.78 0.012 75));
	}

	@media (max-width: 34rem) {
		.picker {
			right: 0.5rem;
			left: 0.5rem !important;
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
