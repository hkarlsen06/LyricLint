<script lang="ts">
	import SmallScreenNotice from '$lib/ui/layout/SmallScreenNotice.svelte';
	import LiveRegion from '$lib/ui/primitives/LiveRegion.svelte';
	import ToastRegion from '$lib/ui/primitives/ToastRegion.svelte';
	import { provideFeedbackState } from '$lib/ui/state/feedback.svelte.js';
	import '$lib/ui/styles/global.css';

	let { children } = $props();
	const feedback = provideFeedbackState();
</script>

<svelte:head>
	<!-- The bracketed-waveform mark. The SVG is what modern browsers pick up; the
	     PNGs cover tab strips, pinned tiles, and iOS home screens that never ask
	     for the vector. -->
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
	<link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<!-- The layout owns what is true of every route: icons, the default description,
	     and the browser-chrome tint. Titles belong to the leaf routes — SvelteKit
	     concatenates heads rather than deduping them, and with two <title> elements
	     in the document the first one wins, so a layout title would silently defeat
	     the error page's. -->
	<meta
		name="description"
		content="A local-first lyric editor and source-backed Genius convention linter."
	/>
	<!-- Browser-chrome tint, tracking --color-canvas (the recessed page surface the
	     chrome sits against). Hex rather than oklch() on purpose: theme-color is
	     honored by Safari/iOS 15.0–15.3 and Chromium before 111, none of which can
	     parse oklch() and would silently drop the tint. Keep in sync with tokens.css:
	       light #e7e7ea = oklch(93% 0.004 285)
	       dark  #0c0c10 = oklch(15.5% 0.008 285) -->
	<meta name="theme-color" media="(prefers-color-scheme: light)" content="#e7e7ea" />
	<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#161618" />
</svelte:head>

<!-- The whole app hangs off one wrapper so the phone gate can take it out of
     both the layout and the accessibility tree with a single rule. The regions
     belong inside it: their toasts are fixed-position and would otherwise paint
     over the notice while the hidden workspace kept autosaving. -->
<div class="app-shell">
	{@render children()}
	<LiveRegion {feedback} />
	<ToastRegion {feedback} />
</div>
<SmallScreenNotice />
