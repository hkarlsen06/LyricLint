<script lang="ts">
	import '$lib/ui/styles/site.css';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ReferenceSearchSync from '$lib/ui/site/ReferenceSearchSync.svelte';
	import { referenceHref } from '$lib/ui/site/reference-search.svelte.js';
	import { siteUrl } from '$lib/seo.js';
	import AppWordmark from '$lib/ui/layout/AppWordmark.svelte';
	// Import the manifest directly. The rules barrel also exports the engine and
	// Harper adapter; a footer version must not pull either into every site page.
	import { currentRuleSet } from '$lib/rules/data/rule-set.js';

	let { children } = $props();
	const socialImageUrl = siteUrl('/social-preview.png');

	// The masthead's hairline arrives with the first scroll (see `.site-header`
	// below). Read off the window, so the rule reference, whose shell
	// scrolls internally and never moves the document, simply never draws it.
	let scrollY = $state(0);

	// Trailing slashes and the index route both have to match, so compare the
	// path prefix rather than the string. `/guidelines/checks/spelling-standardized/` is still
	// inside the guide.
	function current(href: string): 'page' | undefined {
		const path = page.url.pathname.replace(/\/$/, '') || '/';
		const target = href.replace(/\/$/, '') || '/';
		return path === target || (target !== '/' && path.startsWith(`${target}/`))
			? 'page'
			: undefined;
	}

	// The unified reference uses the window shell, and the window shell has
	// no footer. Its columns own the viewport's height, so a footer there is a
	// permanent band of colophon pinned under content somebody is reading, on
	// every screen, saying nothing about either column. The colophon belongs to
	// the document pages, which end; the Apple attribution it carries is a
	// once-per-site requirement and the document pages still state it.
	const windowShell = $derived(Boolean(current('/guidelines')));

	// The section the masthead names beside the brand, and the front page its
	// title links to.
	const section = $derived(
		current('/guidelines')
			? { title: 'Transcription guide', href: resolve('/guidelines/') }
			: current('/docs')
				? { title: 'Docs', href: resolve('/docs/') }
				: undefined
	);
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
     the app's chrome (the same band, the same lockup, the same tokens), so the
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
     than an article: independent panes, each of which has to be
     scrolled without moving the other or taking the header off the top of the
     screen. There the shell is the workbench's own: exactly the viewport tall,
     and the scrolling happens inside it. On narrow screens, one pane fills the horizontal strip, and vertical
     scrolling stays inside that pane. -->
<svelte:window bind:scrollY />
{#if windowShell}<ReferenceSearchSync />{/if}

<div class="site" data-shell={windowShell ? 'window' : 'document'}>
	<!-- The first tab stop on every page in this section, drawn only while it
	     holds focus. Every page's `<main>` answers to `#main` and carries
	     `tabindex="-1"`, because a fragment jump moves the scroll on its own and
	     not reliably the focus, which is the half a keyboard reader needs. -->
	<a class="button button--contrast site-skip" href="#main">Skip to content</a>
	<header class="site-header" data-scrolled={scrollY > 8 ? true : undefined}>
		<!-- The band spans the window; its contents align with the page container,
		     so the brand shares a left edge with the headline and every paragraph
		     rather than hugging the viewport. -->
		<div class="site-header__inner">
			<!-- The wordmark already carries `LyricLint` as its own accessible name
			     (`role="img"`), so the sr-only text adds only the word the lockup
			     cannot say, spelled `LyricLint home` here, the link announced as
			     `LyricLint LyricLint home`. -->
			<a class="site-home" href={resolve('/')}>
				<AppWordmark animated={!current('/')} />
				<span class="sr-only">home</span>
			</a>
			{#if section}
				<!-- The brand, then what it is a masthead over: the workbench's own
				     toolbar arrangement, where the lockup is followed by the name of
				     the thing on screen. Not a heading: the page under it owns the
				     document's outline, and this says where the reader is rather than
				     what they are reading. It links the section's front page, as the
				     wordmark links the site's. -->
				<span class="site-header__section">
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- both hrefs above come from resolve(). -->
					<a class="site-header__section-link" href={section.href}>{section.title}</a>
				</span>
			{/if}
			<!-- Named for what it is, not for the product: every landmark on the page
			     belongs to LyricLint, so "LyricLint" told a reader listing them
			     nothing about which one this is. -->
			<!-- The destinations that are not already the brand. There is no
			     `About`: the wordmark beside this nav links the same landing page
			     from every page, and two controls for one press on one band is the
			     duplication the toolbar's own rules remove, since a command is offered
			     once. What that gives up is a *labeled* way to the answer of "what
			     is this product", carried now by the logo-is-home convention
			     alone. -->
			<nav class="site-nav" aria-label="Site">
				<a href={resolve('/docs/')} aria-current={current('/docs')}>Docs</a>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- referenceHref decorates resolve() URLs with shared search parameters. -->
				<a
					href={windowShell ? referenceHref(resolve('/guidelines/')) : resolve('/guidelines/')}
					aria-current={current('/guidelines')}>Guide</a
				>

				<!-- eslint-enable svelte/no-navigation-without-resolve -->
				<!-- Drawn at every width. A comment here used to claim it was dropped
				     on a phone, from the era of a whole-phone gate that no longer
				     exists: the workbench supports a phone held upright (only
				     landscape is refused, by height and pointer; see
				     `responsive.css`), so the link leads somewhere on every device
				     this masthead draws on. `App` rather than `Workbench` for the
				     row's width, since the product's own name for the surface stays
				     `workbench` everywhere prose has room for it. -->
				<a href={resolve('/workbench/')}>App</a>
			</nav>
		</div>
	</header>

	{@render children()}

	{#if !windowShell}
		<footer class="site-footer">
			<div class="site-footer__inner">
				<span
					>Local-first · <a href={resolve('/about/')}>About</a> ·
					<a href={resolve('/privacy/')}>Privacy</a></span
				>
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

<style>
	/*
	 * The first tab stop in the section, drawn only while it holds focus.
	 *
	 * Out of flow at every state, and that is structural rather than cosmetic:
	 * `.site` is a three-row grid, and an in-flow child here would take the row the
	 * header is sized into. It rides above the pinned masthead so a focused skip
	 * link is never behind the band it is skipping.
	 *
	 * Hidden by clipping rather than by fading (opacity is never a state carrier
	 * here), and it takes the shared contrast tier rather than drawing a control of
	 * its own.
	 */
	.site-skip {
		position: absolute;
		z-index: var(--layer-menu);
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		inset-block-start: var(--space-2);
		inset-inline-start: var(--space-2);
		white-space: nowrap;
		text-decoration: none;
	}

	.site-skip:focus-visible {
		overflow: visible;
		clip: auto;
	}

	/* Chrome, like the document toolbar, so arriving at the workbench from here is
	   not a change of material: the same band, the same brand, in the same place. */
	.site-header,
	.site-footer {
		background: var(--color-chrome);
	}

	/*
	 * The masthead travels with the reader.
	 *
	 * Its height is fixed by something outside this file and must not move:
	 * `e2e/lyriclint.spec.ts` asserts that this band is exactly as tall as the
	 * workbench's document toolbar, which is what makes arriving at the tool from
	 * here read as the same window rather than as a second product. Its *contents*
	 * are aligned differently on purpose: the brand shares a left edge with the
	 * page container (the headline, every paragraph) rather than with the
	 * viewport, because a marketing page's masthead belongs to the column being
	 * read, where the workbench's toolbar belongs to the window being operated.
	 * The e2e test pins that alignment too.
	 *
	 * The fill is the site's own chrome grey, translucent, over a `backdrop-filter`.
	 * Chrome rather than canvas because the band sits over the hero's lit grid,
	 * and the grid's hairlines lift that region a step above bare canvas. A
	 * pure-canvas band up there read as a black strip on a grey field, which is
	 * the two-mismatched-bands failure the phone rule below describes, arrived at
	 * from the other direction. The blur is what keeps the type legible once a
	 * paragraph or a screenshot scrolls behind it.
	 */
	.site-header {
		background: color-mix(in srgb, var(--color-chrome) 80%, transparent);
		-webkit-backdrop-filter: blur(12px);
		backdrop-filter: blur(12px);
	}

	/* Pane content clips below this chrome, so there is nothing behind it to blur. */
	.site[data-shell='window'] .site-header {
		background: transparent;
		-webkit-backdrop-filter: none;
		backdrop-filter: none;
	}

	.site-header {
		display: flex;
		position: sticky;
		z-index: var(--layer-toolbar);
		min-height: var(--header-height);
		padding: 0;
		border-bottom: var(--border-width) solid transparent;
		/* The inner stretches to the band rather than carrying a height of its own:
		   given `min-height: var(--header-height)` it would sit *inside* the border
		   and push the box to 57px, which is the 1px the e2e height pin exists to
		   catch. */
		align-items: stretch;
		inset-block-start: 0;
	}

	/* The hairline arrives with the first scroll and not before. At rest the band
	   sits on the hero and separates nothing; once content moves under it there is
	   an edge worth drawing. Colour only, on a border that is already there
	   transparent, so nothing shifts. The layout toggles `data-scrolled` off the
	   window's own scroll, which the rule reference never produces. */
	.site-header[data-scrolled] {
		border-bottom-color: var(--color-border);
	}

	@media (prefers-reduced-motion: no-preference) {
		.site-header {
			transition: border-color var(--duration-slow) var(--ease-out-quart);
		}
	}

	.site-header__inner {
		display: flex;
		width: 100%;
		max-width: var(--measure-split);
		padding: var(--space-2) var(--space-5);
		gap: var(--space-4);
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		margin-inline: auto;
	}

	/* The colophon, and the rule above it is the whole of its chrome. A filled band
	   at the foot of a page that ends in a call to action is a second surface
	   competing with the last thing the reader is meant to press; the hairline
	   already says where the article stops. */
	.site-footer {
		border-top: var(--border-width) solid var(--color-border);
		background: transparent;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.site-footer__inner {
		display: flex;
		width: 100%;
		max-width: var(--measure-split);
		padding: var(--space-3) var(--space-5);
		gap: var(--space-4);
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		margin-inline: auto;
	}

	/* The lockup is the link, so the link may not paint over it: the wordmark tints
	   its own brackets off `--wm-open` and an inherited accent color would fight
	   that arithmetic for the same pixels. It reads as a link from its position and
	   from the pointer, the way a masthead does. */
	/* Both masthead links stay unscoped at one class of specificity, so
	   base.css's `a:hover` (0,1,1) still outranks their `color: inherit` exactly
	   as it did before these rules moved here; a scoped copy would win it. */
	:global(.site-home) {
		display: inline-flex;
		color: inherit;
		text-decoration: none;
	}

	/*
	 * Which section is on screen (the transcription guide or the docs), said in
	 * the band rather than left to the nav's `aria-current`. It began when the
	 * guide was two deliberately alike sections (one shell, one finder, one run
	 * of rows), and at a glance the only difference between `/rules/` and
	 * `/guidelines/` was a 15px link a shade brighter than its neighbours, which
	 * is a difference nobody reads.
	 *
	 * It is the biggest type in the band, and that is the whole of the effect: the
	 * lockup beside it is set at the body size, so what a reader lands on first is
	 * where they are. It fits inside the band's own height rather than growing it.
	 * `e2e/lyriclint.spec.ts` pins that height against the workbench's toolbar, and
	 * `--font-size-xl` on a tight line sits well inside it with the band's padding.
	 *
	 * The divider is drawn rather than typed, so nothing is announced between the
	 * brand and the section, and the rule reads as the seam it is.
	 */
	.site-header__section {
		display: flex;
		gap: var(--space-4);
		align-items: center;
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}

	.site-header__section::before {
		content: '';
		align-self: stretch;
		border-inline-start: var(--border-width) solid var(--color-border);
	}

	/* Same contract as `.site-home`: it reads as a link from its position and the
	   pointer, not from an accent color, and the seam stays outside the focus ring. */
	:global(.site-header__section-link) {
		color: inherit;
		text-decoration: none;
	}

	/* The brand and the section it is over sit together at the start of the band,
	   and the nav takes the far end. `space-between` alone would strand the
	   section title in the middle of the row. */
	.site-nav {
		display: flex;
		gap: var(--space-4);
		flex-wrap: wrap;
		align-items: center;
		margin-inline-start: auto;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
	}

	/* A masthead is chrome, and chrome does not underline. Set as prose links these
	   were three accent-blue, underlined words crowded against the wordmark, a link
	   list where a masthead should be, and on a phone the busiest thing on the first
	   screen. They are quiet text now: muted, resolving to the body color under the
	   pointer, which is the same way the workbench's own toolbar commands answer one.

	   The page the reader is already on is named but not linked, so the nav says
	   where they are without offering to take them there again, which is now a step
	   up in color rather than the absence of an underline. */
	.site-nav a {
		color: var(--color-text-muted);
		text-decoration: none;
	}

	.site-nav a:hover,
	.site-nav [aria-current='page'] {
		color: var(--color-text);
	}

	@media (max-width: 46rem) {
		/*
		 * The chrome band comes off on a phone, and the reason is the strip of screen
		 * above it. `theme-color` is `--color-canvas`, so the browser paints the
		 * status bar and the safe area with the *page* color, and a header filled
		 * with `--color-chrome` meets that at a seam a few percent lighter than it,
		 * across the full width, at the very top of the first screen. The first thing
		 * the page said was that it was two mismatched strips.
		 *
		 * Nothing here was earning the fill. A band separates pinned chrome from the
		 * content moving under it, and at this width the header scrolls away with the
		 * document like everything else, so there is nothing to separate. The border
		 * goes with it: a hairline under a band the same color as the page is a line
		 * ruled across the canvas for no reason. The wordmark and the nav sit
		 * directly on the canvas, and the top of the screen is one surface from the
		 * status bar down.
		 *
		 * The footer keeps its hairline and loses its fill for the same trade: the
		 * rule is what separates the end of the article from the colophon, and it
		 * does that job on its own.
		 *
		 * On a laptop the band stays. There the header is a masthead over a wide
		 * page with no browser tint above it to disagree with, and it is the same
		 * band the workbench wears, which is the point of it.
		 */
		.site-footer {
			/* The inner carries the same gutter as the header at every width; the
			   footer itself only owns the full-width hairline. */
			background: transparent;
		}

		/* Unpinned as well as unfilled, which is what the paragraph above claims and
		   what the fill coming off depends on: a band left `sticky` with no fill of
		   its own is a transparent blur strip travelling over the article, so every
		   line the reader scrolls under it is smeared by a `backdrop-filter` that no
		   longer has a surface to keep type legible against. Both go together: the
		   band either separates pinned chrome from the content moving under it, or it
		   scrolls away with the document and separates nothing. */
		/* The guide's fixed chrome remains transparent above its separately scrolling panes. */
		.site:not([data-shell='window']) .site-header {
			position: static;
			border-bottom: none;
			background: transparent;
			-webkit-backdrop-filter: none;
			backdrop-filter: none;
		}

		/* Touch targets, matching what responsive.css already does for the app's
		   controls at this width. And the far-end margin comes off with the section
		   title it was added for: here the nav wraps to a row of its own, where an
		   auto margin parks it at the right edge while the brand above it sits at
		   the page's gutter, two rows of chrome on opposite edges. `space-between`
		   is what it was, and with nothing beside the brand on the first row it does
		   the same job the margin does on a wide screen. */
		.site-nav {
			gap: var(--space-3);
			margin-inline-start: 0;
		}

		/* A bare text link's hit box is its line box, ~20px at this size, under a
		   thumb, in the row every page's navigation runs through. The padding grows
		   the target without moving the type: block only, because the gap already
		   spaces the row, and the visual hierarchy is the words, not a box. */
		.site-nav a {
			padding-block: var(--space-1);
		}

		/* The band has room for the brand or the section and the nav, not both: with
		   all three the nav wraps to a second row and the masthead doubles in height,
		   on the screen with the least of it to spend. The section is what comes off,
		   because at this width the columns stack and the page's own heading is the
		   first thing under the band, which is the question this title answers on a
		   wide screen, where the choreography has pushed that heading away. */
		.site-header__section {
			display: none;
		}
	}
</style>
