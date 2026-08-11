<script lang="ts">
	import type { Snippet } from 'svelte';
	import { List } from 'lucide-svelte';
	import { afterNavigate, goto } from '$app/navigation';

	let {
		indexHref,
		detailOpen,
		backLabel,
		reveal,
		list,
		children
	}: {
		/** The section's index route, resolved, trailing slash included. */
		indexHref: string;
		/** Whether a detail page is open beside the list rather than the index. */
		detailOpen: boolean;
		/** The narrow-screen way back to the list, named for the section. */
		backLabel: string;
		/**
		 * Brings the index's selected row into the column, for a reader who did
		 * not press it here. Wired to the index component's own `revealSelected`,
		 * because only the index knows where its rows and its pinned finder are.
		 */
		reveal: () => unknown;
		/** The index column — a component rendering `.site-split__index`. */
		list: Snippet;
		children: Snippet;
	} = $props();

	const indexPath = $derived(indexHref.replace(/\/$/, ''));

	// Whether the reader reached this page by pressing a row. Only then is the
	// list a real entry behind this one in history, and only then can going back
	// be what returns to it — with the scroll position they left it at, which the
	// router restores for a popped entry and a fresh navigation throws away.
	// Opening a page directly, from a search result or a shared link, has nothing
	// behind it and has to be sent to the list the ordinary way.
	let arrivedFromIndex = $state(false);

	let detail = $state<HTMLElement>();

	/**
	 * Whether a navigation started somewhere the list was already on screen —
	 * which is to say, whether the reader got here by pressing one of its rows.
	 *
	 * Deliberately the whole section rather than the index page alone, because
	 * `arrivedFromIndex` above answers a different question: that one is "is the
	 * list one entry back in history", for the back button. Going from one detail
	 * page to another is a press on a row too, and it never passes through the
	 * index route.
	 */
	function pressedARow(navigation: { from: { url: URL } | null }): boolean {
		if (!navigation.from) return false;
		const path = navigation.from.url.pathname.replace(/\/$/, '');
		return path === indexPath || path.startsWith(`${indexPath}/`);
	}

	afterNavigate((navigation) => {
		arrivedFromIndex =
			navigation.type === 'link' && navigation.from?.url.pathname.replace(/\/$/, '') === indexPath;

		// A popped entry has a scroll position of its own and the router has just
		// restored it. That is the whole mechanism behind the control above, so
		// nothing here may overwrite it.
		if (navigation.type === 'popstate') return;

		// A detail page is a URL, so it is routinely opened from outside this
		// list — a shared link, a search result, a reload. The list is then at
		// whatever offset it was left at, which for a fresh load is the top, and
		// the row marked as the page is somewhere below the fold saying so to
		// nobody. The index owns how it does that; this only says when, because it
		// is the arrival that decides it, and the one arrival that must move
		// nothing is a press on a row the reader can already see.
		if (!pressedARow(navigation)) void reveal();

		// Neither column unmounts, so both arrive carrying the offset of the page
		// before this one — and the two want opposite things. The detail column
		// changed, so it goes to its top. The list did not: its offset is the
		// reader's place in it, and moving it is exactly what pressing a row must
		// not do, which is why the index column is `data-sveltekit-noscroll`.
		//
		// Unless there is only one column, and then the document is the scroller
		// and the document is what changed. Whether the detail is a scroll port of
		// its own is the honest question to ask about that: the media query in
		// `site.css` is what flips it, so this reads the layout in force rather
		// than restating its breakpoint here in a second place.
		if (!detail) return;
		detail.scrollTop = 0;
		if (getComputedStyle(detail).overflowY === 'visible') {
			window.scrollTo(0, 0);
		}
	});

	function showIndex(): void {
		if (arrivedFromIndex) {
			history.back();
		} else {
			// The contract is that `indexHref` arrives resolved; the rule cannot
			// see through a prop, and both callers pass `resolve(...)` inline.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			void goto(indexHref);
		}
	}
</script>

<!-- Master and detail, in the workbench's own arrangement: the thing you are
     working through on the left, the thing you are reading on the right. The
     detail column is first in the DOM because it holds the `<main>` and the
     page's `<h1>`, and the list is a `<nav>` of every lookup in the section —
     which would otherwise stand between a reader and the document they opened.
     The grid areas put it back on the left visually. -->
<div class="site-split" data-view={detailOpen ? 'detail' : 'index'}>
	<div class="site-split__detail" bind:this={detail}>
		{#if detailOpen}
			<!-- Narrow screens only, where the list is not on screen to return to.
			     It goes back rather than forward to a fresh index, so the reader
			     lands on the row they pressed instead of at the top of the list. -->
			<button class="button button--quiet site-split__back" type="button" onclick={showIndex}>
				<List aria-hidden="true" size={15} strokeWidth={2.25} />
				{backLabel}
			</button>
		{/if}

		{@render children()}
	</div>

	{@render list()}
</div>
