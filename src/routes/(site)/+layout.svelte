<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { siteUrl } from '$lib/seo.js';
	import AppWordmark from '$lib/ui/layout/AppWordmark.svelte';
	// Import the manifest directly. The rules barrel also exports the engine and
	// Harper adapter; a footer version must not pull either into every site page.
	import { currentRuleSet } from '$lib/rules/data/rule-set.js';

	let { children } = $props();
	const socialImageUrl = siteUrl('/social-preview.png');

	// The masthead's hairline arrives with the first scroll (see `.site-header`
	// in site.css). Read off the window, so the rule reference — whose shell
	// scrolls internally and never moves the document — simply never draws it.
	let scrollY = $state(0);

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

	// The two reference sections are the window shell — and the window shell has
	// no footer. Its columns own the viewport's height, so a footer there is a
	// permanent band of colophon pinned under content somebody is reading, on
	// every screen, saying nothing about either column. The colophon belongs to
	// the document pages, which end; the Apple attribution it carries is a
	// once-per-site requirement and the document pages still state it.
	const windowShell = $derived(Boolean(current('/rules') || current('/guidelines')));
</script>

<svelte:head>
	<!-- The landing page's first layout uses this face for every prose line and
	     control. Starting it with the document avoids a fallback-font layout
	     followed by a measurable shift when fonts.css is discovered and the
	     final metrics arrive. The same preload is useful on every site route,
	     whose masthead and reading column share the face. -->
	<link
		rel="preload"
		href="{resolve('/')}fonts/ibm-plex-sans-latin-wght-normal.woff2"
		as="font"
		type="font/woff2"
		fetchpriority="high"
		crossorigin="anonymous"
	/>
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
     reference and the guidance catalog, which are a master and a detail rather
     than an article — two runs of different lengths, each of which has to be
     scrolled without moving the other or taking the header off the top of the
     screen. There the shell is the workbench's own: exactly the viewport tall,
     and the scrolling happens inside it. `site.css` drops back to `document` on
     narrow screens, where there is only one column on show and the document is
     the honest scroller again. -->
<svelte:window bind:scrollY />

<div class="site" data-shell={windowShell ? 'window' : 'document'}>
	<header class="site-header" data-scrolled={scrollY > 8 ? true : undefined}>
		<!-- The band spans the window; its contents align with the page container,
		     so the brand shares a left edge with the headline and every paragraph
		     rather than hugging the viewport. -->
		<div class="site-header__inner">
			<a class="site-home" href={resolve('/')}>
				<AppWordmark animated={!current('/')} />
				<span class="sr-only">LyricLint home</span>
			</a>
			<nav class="site-nav" aria-label="LyricLint">
				<a href={resolve('/')} aria-current={current('/')}>About</a>
				<a href={resolve('/rules/')} aria-current={current('/rules')}>Rules</a>
				<a href={resolve('/guidelines/')} aria-current={current('/guidelines')}>Guidelines</a>
				<!-- Dropped on a phone, where it is the one link in the masthead that
				     cannot lead anywhere: the workbench is removed at that size and the
				     gate takes its place. See `site.css`. -->
				<a href={resolve('/lint/')}>Open the app</a>
			</nav>
		</div>
	</header>

	{@render children()}

	{#if !windowShell}
		<footer class="site-footer">
			<div class="site-footer__inner">
				<span>Local-first · <a href={resolve('/privacy/')}>Privacy</a></span>
				<span class="site-code">
					Rule set {currentRuleSet.version}
				</span>
				<!-- Required by the Apple Music Identity Guidelines, which the Developer
				     Program License Agreement makes binding on anything that calls MusicKit.
				     Once per site, wherever the legal copy is, which is here. -->
				<span
					>Apple and Apple Music are trademarks of Apple Inc., registered in the U.S. and other
					countries.</span
				>
			</div>
		</footer>
	{/if}
</div>
