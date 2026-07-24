<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import LiveRegion from '$lib/ui/primitives/LiveRegion.svelte';
	import ToastRegion from '$lib/ui/primitives/ToastRegion.svelte';
	import { provideFeedbackState } from '$lib/ui/state/feedback.svelte.js';
	import '$lib/ui/styles/global.css';

	let { children } = $props();
	const feedback = provideFeedbackState();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta
		name="description"
		content="A local-first lyric editor and source-backed Genius convention linter."
	/>
	<meta name="theme-color" content="#f7f4ef" />
	<title>LyricLint</title>
</svelte:head>

{@render children()}
<LiveRegion {feedback} />
<ToastRegion {feedback} />
