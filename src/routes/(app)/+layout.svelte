<script lang="ts">
	import '$lib/ui/styles/workbench.css';
	import { resolve } from '$app/paths';
	import LiveRegion from '$lib/ui/primitives/LiveRegion.svelte';
	import ToastRegion from '$lib/ui/primitives/ToastRegion.svelte';
	import { useFeedbackState } from '$lib/ui/state/feedback.svelte.js';

	let { children } = $props();
	const feedback = useFeedbackState();
</script>

<!-- The workbench requires JavaScript; the reading sections remain available without it. -->
<noscript>
	<style>
		.app-shell {
			display: none;
		}
	</style>
	<div class="error-page">
		<div>
			<h1>LyricLint needs JavaScript</h1>
			<p>
				The workbench runs entirely in your browser — the linter, the editor and your saved 'scribes
				are all script. The <a href={resolve('/guidelines/')}>transcription guide</a>
				reads fine without it.
			</p>
		</div>
	</div>
</noscript>

<div class="app-shell">
	{@render children()}
	<LiveRegion {feedback} />
	<ToastRegion {feedback} />
</div>
