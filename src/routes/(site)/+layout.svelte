<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { siteUrl } from '$lib/seo.js';
	import AppWordmark from '$lib/ui/layout/AppWordmark.svelte';
	import { currentRuleSet } from '$lib/rules/index.js';

	let { children } = $props();
	const socialImageUrl = siteUrl('/social-preview.png');

	// Trailing slashes and the index route both have to match, so compare the
	// path prefix rather than the string. `/rules/spelling-standardized` is still
	// inside Rules.
	function current(href: string): 'page' | undefined {
		const path = page.url.pathname.replace(/\/$/, '') || '/';
		const target = href.replace(/\/$/, '') || '/';
		return path === target || (target !== '/' && path.startsWith(`${target}/`))
			? 'page'
			: undefined;
	}
</script>

<svelte:head>
	<meta property="og:site_name" content="LyricLint" />
	<meta property="og:image" content={socialImageUrl} />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta
		property="og:image:alt"
		content="LyricLint: Catch Genius formatting problems before you submit."
	/>
	<meta name="twitter:image" content={socialImageUrl} />
	<meta
		name="twitter:image:alt"
		content="LyricLint: Catch Genius formatting problems before you submit."
	/>
</svelte:head>

<!-- The chrome the landing page and the rule reference share. It is deliberately
     the app's chrome — the same band, the same lockup, the same tokens — so the
     reference does not read as a different product from the workbench it
     documents.

     The wordmark is the marketing site's home link, including from the workbench:
     the same brand in the same position returns to the same starting place.

     The landing page parks the full wordmark open with no transition. The rule
     reference keeps the workbench's animated intro: it is a document people come
     back to, so the brand yields to what they came to read.

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
			<AppWordmark animated={!current('/')} />
			<span class="sr-only">LyricLint home</span>
		</a>
		<nav class="site-nav" aria-label="LyricLint">
			<a href={resolve('/')} aria-current={current('/')}>About</a>
			<a href={resolve('/rules/')} aria-current={current('/rules')}>Rules</a>
			<!-- Dropped on a phone, where it is the one link in the masthead that
			     cannot lead anywhere: the workbench is removed at that size and the
			     gate takes its place. See `site.css`. -->
			<a class="site-nav__app" href={resolve('/lint/')}>Open the app</a>
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
