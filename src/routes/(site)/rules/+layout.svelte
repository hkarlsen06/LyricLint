<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import RuleIndex from '$lib/ui/site/RuleIndex.svelte';
	import type { LayoutProps } from './$types.js';

	let { children, data }: LayoutProps = $props();

	// Derived once by the prerenderer and handed here as data — see
	// `+layout.server.ts` for why deriving it in this file was a bug rather than
	// a shortcut. It lives in the layout rather than in the index page so it is
	// mounted once for the whole section: pressing a row swaps the column beside
	// the list instead of tearing the list down and building it again, and since
	// `RuleIndex` holds the search and the chips, a reader who filtered the list
	// and opened one of the results comes back to the filter they were using.
	const groups = $derived(data.groups);

	const indexHref = resolve('/rules/');
	const indexPath = indexHref.replace(/\/$/, '');

	const selectedSlug = $derived(page.params.rule);

	// Whether the reader reached this rule by pressing a row. Only then is the
	// list a real entry behind this one in history, and only then can going back
	// be what returns to it — with the scroll position they left it at, which the
	// router restores for a popped entry and a fresh navigation throws away.
	// Opening a rule directly, from a search result or a shared link, has nothing
	// behind it and has to be sent to the list the ordinary way.
	let arrivedFromIndex = $state(false);

	let index = $state<{ revealSelected(): Promise<void> }>();

	/**
	 * Whether a navigation started somewhere the list was already on screen —
	 * which is to say, whether the reader got here by pressing one of its rows.
	 *
	 * Deliberately the whole section rather than the index page alone, because
	 * `arrivedFromIndex` above answers a different question: that one is "is the
	 * list one entry back in history", for the back button. Going from one rule to
	 * another is a press on a row too, and it never passes through `/rules`.
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

		// A rule is a URL, so it is routinely opened from outside this list — a
		// shared link, a search result, a reload. The list is then at whatever
		// offset it was left at, which for a fresh load is the top, and the row
		// marked as the page is somewhere below the fold saying so to nobody. The
		// index owns how it does that; this only says when, because it is the
		// arrival that decides it, and the one arrival that must move nothing is a
		// press on a row the reader can already see.
		if (!pressedARow(navigation)) void index?.revealSelected();

		// Neither column unmounts, so both arrive carrying the offset of the rule
		// before this one — and the two want opposite things. The detail column
		// changed, so it goes to its top. The list did not: its offset is the
		// reader's place in it, and moving it is exactly what pressing a row must
		// not do, which is why the nav below is `data-sveltekit-noscroll`.
		//
		// Unless there is only one column, and then the document is the scroller
		// and the document is what changed. Whether the detail is a scroll port of
		// its own is the honest question to ask about that: the media query in
		// `site.css` is what flips it, so this reads the layout in force rather
		// than restating its breakpoint here in a second place.
		const detail = document.querySelector<HTMLElement>('.rules__detail');
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
			void goto(indexHref);
		}
	}
</script>

<!-- Master and detail, in the workbench's own arrangement: the thing you are
     working through on the left, the thing you are reading on the right. The
     detail column is first in the DOM because it holds the `<main>` and the
     page's `<h1>`, and the list is a `<nav>` of every rule in the set — which
     would otherwise stand between a reader and the document they opened. The
     grid areas put it back on the left visually. -->
<div class="rules" data-view={selectedSlug ? 'rule' : 'index'}>
	<div class="rules__detail">
		{#if selectedSlug}
			<!-- Narrow screens only, where the list is not on screen to return to.
			     It goes back rather than forward to a fresh `/rules`, so the reader
			     lands on the row they pressed instead of at the top of the list. -->
			<button class="button button--quiet rules__back" type="button" onclick={showIndex}>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="15"
					height="15"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				>
					<path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
				</svg>
				All rules
			</button>
		{/if}

		{@render children()}
	</div>

	<RuleIndex bind:this={index} {groups} {selectedSlug} />
</div>
