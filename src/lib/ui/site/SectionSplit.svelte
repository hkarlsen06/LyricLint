<script lang="ts">
	// Current contract: docs/subsystems/reference.md.
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	import type { Snippet } from 'svelte';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import ExternalLink from 'lucide-svelte/icons/external-link';
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
			<ArrowLeft aria-hidden="true" size={15} />
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
			<ArrowRight aria-hidden="true" size={15} />
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
					>Send a suggestion<ExternalLink
						class="site-run__external"
						aria-hidden="true"
						size={12}
						strokeWidth={2.2}
					/></a
				><span class="sr-only">(opens in a new tab)</span>
			</footer>
		</div>
	</div>
</div>
