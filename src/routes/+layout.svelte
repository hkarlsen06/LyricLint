<script lang="ts">
	import { provideFeedbackState } from '$lib/ui/state/feedback.svelte.js';
	import '$lib/ui/styles/global.css';

	let { children } = $props();
	// Provided at the root rather than inside `(app)` so the error page — which
	// sits above both groups — still resolves the context if it ever announces.
	provideFeedbackState();
</script>

<svelte:head>
	<!-- The bracketed-waveform mark. The SVG is what modern browsers pick up; the
	     PNGs cover tab strips, pinned tiles, and iOS home screens that never ask
	     for the vector. -->
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
	<link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<!-- The layout owns what is true of every route: icons and the browser-chrome
	     tint. Titles and descriptions belong to the leaf routes.

	     There is deliberately no default <meta name="description"> here. SvelteKit
	     concatenates heads rather than deduping them, and where two of the same tag
	     end up in one document the first one wins — a layout-level default would
	     therefore be emitted *above* each rule page's own description and shadow
	     all forty-seven of them, which is the opposite of what a default is for.
	     The same reasoning is why there is no layout <title>: it would silently
	     defeat the error page's. -->

	<!-- Browser-chrome tint, tracking --color-canvas (the recessed page surface the
	     chrome sits against). Hex rather than oklch() on purpose: theme-color is
	     honored by Safari/iOS 15.0–15.3 and Chromium before 111, none of which can
	     parse oklch() and would silently drop the tint. Keep in sync with tokens.css:
	       light #e7e7ea = oklch(93% 0.004 285)
	       dark  #0c0c10 = oklch(15.5% 0.008 285) -->
	<!-- Browser-chrome tint, tracking --color-canvas (the recessed page surface the
	     chrome sits against). Hex rather than oklch() on purpose: theme-color is
	     honored by Safari/iOS 15.0–15.3 and Chromium before 111, none of which can
	     parse oklch() and would silently drop the tint. Keep in sync with tokens.css:
	       light #e7e7ea = oklch(93% 0.004 285)
	       dark  #0c0c10 = oklch(15.5% 0.008 285) -->
	<meta name="theme-color" media="(prefers-color-scheme: light)" content="#e7e7ea" />
	<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#161618" />
</svelte:head>

<!-- Nothing but the head and the stylesheet live here. The workbench's shell
     wrapper, its feedback regions, and the phone gate belong to `(app)`: the
     gate removes the app on a phone, and the pages under `(site)` are the ones
     a phone is meant to be able to read. -->
{@render children()}
