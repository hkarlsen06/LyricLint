<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AppWordmark from '$lib/ui/layout/AppWordmark.svelte';
	import { currentRuleSet } from '$lib/rules/index.js';

	let { children } = $props();

	// Trailing slashes and the index route both have to match, so compare the
	// path prefix rather than the string. `/rules/spelling-standardized` is still
	// inside Rules.
	function current(href: string): 'page' | undefined {
		const path = page.url.pathname.replace(/\/$/, '');
		return path === href || path.startsWith(`${href}/`) ? 'page' : undefined;
	}
</script>

<!-- The chrome the landing page and the rule reference share. It is deliberately
     the app's chrome — the same band, the same lockup, the same tokens — so the
     reference does not read as a different product from the workbench it
     documents.

     The wordmark is the home link here, and home is the workbench. In the app it
     stays inert: there it is already home, and its press latches the lockup open,
     so a link on it would fire a navigation every time someone toggled the brand.

     It also runs its intro backwards on the landing page, and only there. The
     workbench leads with the word and contracts because the brand is a masthead
     on a tool someone came to use; `/about` is the page they came to for the
     product itself, and is for most readers the first time they have seen it — so
     the mark arrives first and opens into the word, which is the one place that
     movement is the content rather than an interruption of it. The rule reference
     keeps the workbench's intro: it is a document people come back to, and a logo
     that unfolded on every visit would be furniture that moves.

     `data-shell` says which of two things this chrome wraps. `document` is the
     ordinary case and the landing page's: one column of prose that scrolls the
     viewport, header and footer travelling with it. `window` is the rule
     reference, which is a master and a detail rather than an article — two runs
     of different lengths, each of which has to be scrolled without moving the
     other or taking the header off the top of the screen. There the shell is the
     workbench's own: exactly the viewport tall, and the scrolling happens inside
     it. `site.css` drops back to `document` on narrow screens, where there is
     only one column on show and the document is the honest scroller again. -->
<div class="site" data-shell={current('/rules') ? 'window' : 'document'}>
	<header class="site-header">
		<a class="site-home" href={resolve('/')}>
			<AppWordmark entrance={current('/about') ? 'reveal' : 'hold'} />
			<span class="sr-only">Open the LyricLint workbench</span>
		</a>
		<nav class="site-nav" aria-label="LyricLint">
			<a href={resolve('/about')} aria-current={current('/about')}>About</a>
			<a href={resolve('/rules')} aria-current={current('/rules')}>Rules</a>
			<a href={resolve('/')}>Open the app</a>
		</nav>
	</header>

	{@render children()}

	<footer class="site-footer">
		<span>Local-first. No account, no upload, no tracking.</span>
		<span class="site-code">
			Rule set {currentRuleSet.version} · published {currentRuleSet.publishedAt}
		</span>
	</footer>
</div>
