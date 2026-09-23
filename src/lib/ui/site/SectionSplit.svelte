<script lang="ts">
	// Current contract: docs/subsystems/reference.md.
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	import type { Snippet } from 'svelte';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOutIcon';
	import { afterNavigate } from '$app/navigation';
	import { safeDecodeHash } from './hash.js';

	let {
		detailOpen,
		checkOpen = false,
		reveal,
		intro,
		list,
		children
	}: {
		detailOpen: boolean;
		checkOpen?: boolean;
		reveal: () => void;
		intro: Snippet;
		list: Snippet;
		children: Snippet;
	} = $props();

	let strip = $state<HTMLElement>();
	let detail = $state<HTMLElement>();
	let introduction = $state<HTMLElement>();
	let lastPressInList = false;
	let positioned = false;
	let atStart = $state(true);
	let atEnd = $state(false);

	function updatePosition(): void {
		if (!strip) return;
		atStart = strip.scrollLeft < 1;
		atEnd = strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 1;
	}

	function singleColumn(): boolean {
		return !!strip && !!detail && detail.clientWidth > strip.clientWidth / 2;
	}

	function notePress(event: Event): void {
		lastPressInList =
			event.target instanceof Element && !!event.target.closest('.site-split__index');
	}

	function showColumn(column: 'intro' | 'index' | 'detail', smooth = true): void {
		if (!strip || !detail) return;
		const index = strip.querySelector<HTMLElement>('.site-split__index');
		if (!index) return;

		const left =
			column === 'detail'
				? strip.scrollWidth - strip.clientWidth
				: column === 'index' && singleColumn()
					? index.getBoundingClientRect().left -
						strip.getBoundingClientRect().left +
						strip.scrollLeft
					: 0;
		strip.scrollTo({ left, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'instant' });
		updatePosition();
	}

	function visitColumn(column: 'intro' | 'index' | 'detail'): void {
		showColumn(column);
		const target =
			column === 'intro'
				? introduction
				: column === 'detail'
					? detail?.querySelector<HTMLElement>('main')
					: strip?.querySelector<HTMLElement>('.site-split__index');
		// Focus follows an explicit pane change without scrolling or opening a keyboard.
		target?.focus({ preventScroll: true });
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.target !== strip || !strip || !detail) return;
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		strip.scrollBy({
			left: (event.key === 'ArrowLeft' ? -1 : 1) * detail.clientWidth,
			behavior: prefersReducedMotion() ? 'instant' : 'smooth'
		});
	}

	afterNavigate((navigation) => {
		if (!strip || !detail || (navigation.type === 'popstate' && positioned)) return;
		positioned = true;
		const anchor = safeDecodeHash(navigation.to?.url.hash.slice(1) ?? '');
		const target = anchor ? document.getElementById(anchor) : null;
		const destination =
			target && introduction?.contains(target)
				? 'intro'
				: detailOpen || (target && detail.contains(target))
					? 'detail'
					: 'index';
		showColumn(destination, navigation.type === 'link');
		// A remounted strip needs its pane, but snapshots own restored reading positions.
		if (navigation.type === 'popstate') return;
		if (!lastPressInList) void reveal();
		lastPressInList = false;
		if (!target || !detail.contains(target)) detail.scrollTop = 0;
	});

	function scrollbars(node: HTMLElement) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Timer handles are cleanup bookkeeping.
		const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
		node.dataset.scrollbarsReady = '';
		function onScroll(event: Event): void {
			const column = event.target;
			if (!(column instanceof HTMLElement) || column.parentElement !== node) return;
			clearTimeout(timers.get(column));
			column.dataset.scrolling = '';
			timers.set(
				column,
				setTimeout(() => {
					delete column.dataset.scrolling;
					timers.delete(column);
				}, 800)
			);
		}
		node.addEventListener('scroll', onScroll, { capture: true, passive: true });
		return {
			destroy() {
				node.removeEventListener('scroll', onScroll, true);
				delete node.dataset.scrollbarsReady;
				for (const [column, timer] of timers) {
					clearTimeout(timer);
					delete column.dataset.scrolling;
				}
			}
		};
	}
</script>

<svelte:document onclickcapture={notePress} onkeydown={onKeydown} />
<svelte:window onresize={updatePosition} />

<div class="site-split-frame">
	<nav class="site-split__navigation" aria-label="Guide navigation">
		<button
			class="button button--quiet site-split__back"
			class:site-split__unavailable={atStart}
			type="button"
			onclick={() => visitColumn(singleColumn() && atEnd ? 'index' : 'intro')}
		>
			<ArrowLeftIcon aria-hidden="true" size={15} weight="bold" />
			<span class="site-split__wide">Introduction</span>
			<span class="site-split__narrow">{atEnd ? 'Topics' : 'Introduction'}</span>
		</button>
		<button
			class="button button--quiet"
			class:site-split__unavailable={atEnd}
			type="button"
			onclick={() => visitColumn(singleColumn() && atStart ? 'index' : 'detail')}
		>
			<span class="site-split__wide">{checkOpen ? 'Check details' : 'Guide'}</span>
			<span class="site-split__narrow"
				>{atStart ? 'Topics' : checkOpen ? 'Check details' : 'Guide'}</span
			>
			<ArrowRightIcon aria-hidden="true" size={15} weight="bold" />
		</button>
	</nav>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex (The labelled scroll region accepts keyboard navigation.) -->
	<div
		class="site-split"
		bind:this={strip}
		use:scrollbars
		onscroll={updatePosition}
		data-view={detailOpen ? 'detail' : 'index'}
		data-section="guidelines"
		role="region"
		aria-label="Guide columns"
		tabindex="0"
	>
		<div class="site-split__intro" bind:this={introduction} tabindex="-1">
			{@render intro()}
		</div>
		{@render list()}
		<div class="site-split__detail" bind:this={detail}>
			{@render children()}
			<footer class="site-split__suggest">
				Spotted a mistake, or a convention we're missing?
				<a href="https://hkarlsen06.dev/en/contact/" target="_blank" rel="noopener noreferrer"
					>Send a suggestion<ArrowSquareOutIcon
						class="site-run__external"
						aria-hidden="true"
						size={12}
						weight="bold"
					/></a
				><span class="sr-only">(opens in a new tab)</span>
			</footer>
		</div>
	</div>
</div>

<style>
	/* Three real columns share a native horizontal scroll port. The full pane,
	   including its margins, owns vertical scrolling. */
	.site-split-frame {
		--split-lane-start: max(
			var(--space-5),
			calc((100vw - var(--measure-split)) / 4 + var(--space-5))
		);
		--split-lane-end: var(--split-lane-start);
		--split-heading-clearance: var(--space-4);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		min-height: 0;
	}

	.site-split {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 50%;
		grid-template-rows: minmax(0, 1fr);
		width: 100%;
		min-height: 0;
		overflow-x: auto;
		overflow-y: hidden;
		scroll-snap-type: x mandatory;
		overscroll-behavior-x: contain;
		scrollbar-width: thin;
		scrollbar-color: var(--color-border-strong) transparent;
	}

	.site-split__intro,
	.site-split__detail,
	/* The index column is `ReferenceIndex.svelte`'s own root, so it takes the lane
	   at its original specificity: its own `.reference-index` padding still wins. */
	:global(.site-split__index) {
		min-width: 0;
		min-height: 0;
		padding: 0 var(--split-lane-end) max(var(--space-5), var(--split-navigation-clearance, 0px))
			var(--split-lane-start);
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		scroll-snap-align: start;
		scrollbar-gutter: stable;
		scrollbar-width: thin;
		--reference-scrollbar-thumb: var(--color-text-muted);
		scrollbar-color: var(--reference-scrollbar-thumb) transparent;
	}

	.site-split:global([data-scrollbars-ready]) > :global(:not([data-scrolling])) {
		--reference-scrollbar-thumb: transparent;
	}

	@supports not (scrollbar-width: thin) {
		.site-split > :global(div)::-webkit-scrollbar {
			width: var(--space-1);
		}
		.site-split > :global(div)::-webkit-scrollbar-track {
			background: transparent;
		}
		.site-split > :global(div)::-webkit-scrollbar-thumb {
			background: var(--reference-scrollbar-thumb);
		}
	}

	@media (forced-colors: active) {
		.site-split,
		.site-split > :global(div) {
			scrollbar-color: auto;
		}
	}

	.site-split__navigation {
		padding: var(--space-5) var(--split-lane-end) var(--space-3) var(--split-lane-start);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.site-split__unavailable {
		visibility: hidden;
	}
	.site-split__narrow {
		display: none;
	}

	/* The suggestion line at the foot of the reading column. The hairline is the
	   site footer's own rule (it says where the page stops and a note about the
	   catalog begins), and the measure is the page's, so the line ends where every
	   paragraph above it does rather than running on under the scrollbar's lane.
	   Muted and a step down, because it is an offer standing under everything the
	   reader came for, not part of it. */
	/* No border of its own: the action row above already closed the page, and a
	   second line directly under one lone button would fence the colophon off
	   from the foot it belongs to. */
	.site-split__suggest {
		max-width: var(--measure-reference);
		margin-block: 0;
		padding-block: var(--space-4) var(--space-5);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	/* The citations' own mark for a link that leaves. Inline in the line's run
	   rather than a flex item, because the text wraps and the mark belongs after
	   its last word; the nudge sits it on the text's baseline. */
	.site-split__suggest :global(.site-run__external) {
		vertical-align: -0.1em;
	}

	@media (max-width: 62rem) {
		.site-split__wide {
			display: none;
		}
		.site-split__narrow {
			display: inline;
		}
		.site-split {
			grid-auto-columns: 100%;
		}
		.site-split-frame {
			--split-lane-start: var(--space-5);
			--split-navigation-bottom: max(var(--space-3), env(safe-area-inset-bottom));
			--split-navigation-clearance: calc(
				var(--split-navigation-bottom) + var(--control-height-touch) + var(--space-4)
			);
			position: relative;
			grid-template-rows: minmax(0, 1fr);
		}
		.site-split__navigation {
			position: absolute;
			inset-inline: 0;
			inset-block-end: var(--split-navigation-bottom);
			padding-block: 0;
			z-index: var(--layer-toolbar);
			pointer-events: none;
		}
		:global(:root) .site-split__navigation .button {
			min-height: var(--control-height-touch);
			background: var(--color-control);
			border-color: var(--color-control-border);
			box-shadow: var(--shadow-popover);
			pointer-events: auto;
		}
		:global(:root) .site-split__navigation .button:hover {
			background: var(--color-control-hover);
		}
		:global(:root) .site-split__navigation .button:active {
			background: var(--color-control-active);
		}
		.site-split > :global(div) {
			scroll-padding-block-end: var(--split-navigation-clearance);
		}
	}
</style>
