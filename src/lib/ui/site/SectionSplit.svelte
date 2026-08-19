<script lang="ts">
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	import type { Snippet } from 'svelte';
	import { ArrowLeft, ExternalLink } from 'lucide-svelte';
	import { afterNavigate, goto, onNavigate } from '$app/navigation';

	let {
		indexHref,
		detailOpen,
		backLabel,
		reveal,
		section,
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
		/**
		 * A hook for section-specific layout — `site.css` reads it as
		 * `data-section`. The guidance catalog uses it for its wash's paint
		 * lane; the arrangement and the choreography are the same for every
		 * section, so nothing else hangs off it.
		 */
		section?: string | undefined;
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

	// Where the last press landed — in the index column or anywhere else. Read
	// off the document in the capture phase so a handler on the way down cannot
	// eat it; a keyboard activation of a link fires a click too, so this covers
	// both ways a row is pressed.
	let lastPressInList = false;

	function notePress(event: Event): void {
		lastPressInList =
			event.target instanceof Element && event.target.closest('.site-split__index') !== null;
	}

	/**
	 * Whether the reader got here by pressing one of the list's own rows. Two
	 * halves, and both are load-bearing. The navigation has to start inside the
	 * section, because only then was the list on screen at all — deliberately
	 * the whole section rather than the index page alone, since going from one
	 * detail page to another is a press on a row too and never passes through
	 * the index route (`arrivedFromIndex` above answers the different question,
	 * "is the list one entry back in history", for the back button).
	 *
	 * And the press has to have landed in the index column, because an
	 * in-section origin alone cannot tell a row from a link in the detail
	 * column — the guidance catalog's topic list on its welcome page, the rule
	 * guide's check runs — and the difference is the whole question: a row the
	 * reader pressed is by definition one they can see, so the list must not
	 * move, while a press in the detail column says nothing about the list,
	 * which is then left parked wherever it was, marking the arrived-at page to
	 * nobody.
	 */
	function pressedARow(navigation: { from: { url: URL } | null }): boolean {
		return inSection(navigation.from?.url) && lastPressInList;
	}

	function inSection(url: URL | undefined): boolean {
		const path = url?.pathname.replace(/\/$/, '') ?? '';
		return path === indexPath || path.startsWith(`${indexPath}/`);
	}

	/**
	 * Whether the columns have stacked into one — the layout actually in force,
	 * read off the detail column giving up its own scroll port, rather than the
	 * breakpoint in `site.css` restated here in a second place that could drift
	 * from it. `afterNavigate` asks the same question below, for the scroller it
	 * has to send to the top.
	 */
	function stacked(): boolean {
		return !detail || getComputedStyle(detail).overflowY === 'visible';
	}

	// Opening a page is choreographed rather than swapped: the three views a
	// section can show — intro, list, page — behave as one strip of paper, and
	// a navigation pulls the strip one slot sideways through a slit at the
	// container's edges. Pressing a row pulls it left: the intro is drawn out
	// through the left edge, the list crosses from the right slot to the left
	// one, and the page is drawn in through the right; going back pulls the
	// same strip right. All of it is CSS in `site.css`: the columns carry
	// `view-transition-name`s, and the detail column's is keyed off
	// `data-view`, which is what encodes the direction without this component
	// knowing which way a navigation runs — a name captured on only one side
	// of the swap is an exit or an entrance, and which side it stood on says
	// which.
	//
	// Four gates, and the last is the one that was missing. Only inside the
	// section: a navigation out to another section or the landing page changes
	// the whole shell, and animating half of it would read as the site tearing.
	// Reduced motion, the same gate every transition here carries. A browser
	// without `startViewTransition` simply swaps, which is what these sections
	// did before.
	//
	// And only while there are two columns to cross. Stacked, there is no
	// journey to animate and three things are true at once that a transition
	// cannot survive: the list is `display: none` while a page is open, so a
	// named column vanishes mid-capture; the document rather than the column is
	// the scroller, so `afterNavigate` sends the whole page to the top under
	// the animation; and the two columns occupy one grid area, so the crossing
	// the names describe does not exist. That is the arrangement a reader is in
	// when they *tap* a row, which is why this read as unstable exactly where
	// it was least affordable.
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (prefersReducedMotion()) return;
		if (!inSection(navigation.from?.url) || !inSection(navigation.to?.url)) return;
		if (stacked()) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

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
		// and the document is what changed. `stacked()` is that question, asked
		// the same way the transition gate asks it.
		if (!detail) return;
		detail.scrollTop = 0;
		if (stacked()) {
			window.scrollTo(0, 0);
		}
	});

	function showIndex(): void {
		if (arrivedFromIndex) {
			history.back();
		} else {
			// The contract is that `indexHref` arrives resolved; the rule cannot
			// see through a prop, and both callers pass `resolve(...)` inline.
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- both callers pass an already-resolved href prop.
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
<svelte:document onclickcapture={notePress} />

<div class="site-split" data-view={detailOpen ? 'detail' : 'index'} data-section={section}>
	<div class="site-split__detail" bind:this={detail}>
		{#if detailOpen}
			<!-- The way out of an open page and back to the section's welcome view —
			     which the choreography pushed off screen, so a wide screen needs
			     this as much as a narrow one, where it is also the way back to the
			     list. It goes back rather than forward to a fresh index where the
			     index really is behind this page, so a popped list keeps the scroll
			     the reader left it at.

			     It rides the top of this column rather than scrolling away with the
			     page, for the reason the index's finder is pinned: this column is
			     its own scroll port on a wide screen, and a reader who has read
			     down a page — or who arrived at a guideline by fragment, which
			     lands them mid-column with the control already above the fold —
			     would otherwise have to scroll back up to find the way out.

			     An arrow rather than a list glyph: what the press does is go back
			     to where the row was pressed, and that is the one mark everybody
			     already reads as exactly that. The label is still the section's own
			     (`All rules`, `All guidelines`), so the destination is named rather
			     than left to the arrow. -->
			<div class="site-split__backbar">
				<button class="button button--quiet site-split__back" type="button" onclick={showIndex}>
					<ArrowLeft aria-hidden="true" size={15} strokeWidth={2.25} />
					{backLabel}
				</button>
			</div>
		{/if}

		{@render children()}

		<!-- The way to reach the maintainer, at the foot of the reading column on
		     every page of both sections: the reader who has just met a wrong call
		     or a missing convention is at the end of what they were reading, and
		     this is where they look. It scrolls with the content rather than
		     pinning — the window shell has no footer, and this is the column's own
		     last line, not chrome. It opens a tab for the guidance rows' reason:
		     the contact page is a lookup beside the reading, not the next thing to
		     read, and taken in place it costs the reader the place they had. The
		     sr-only note is what the aria-hidden mark cannot say.

		     A <footer> rather than a <p>, because inside a plain div it maps to
		     the contentinfo landmark — the window shell has no footer of its own,
		     so this line was the one piece of the page outside every landmark,
		     which is the thing a screen reader's landmark navigation then cannot
		     reach. It is also what the line is: the column's colophon. -->
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

	{@render list()}
</div>
