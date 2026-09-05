<script lang="ts">
	import { resolve } from '$app/paths';
	import LiveRegion from '$lib/ui/primitives/LiveRegion.svelte';
	import ToastRegion from '$lib/ui/primitives/ToastRegion.svelte';
	import { useFeedbackState } from '$lib/ui/state/feedback.svelte.js';

	let { children } = $props();
	const feedback = useFeedbackState();
</script>

<!-- With scripting off the boot screen is what is left: a wordmark and
     "Loading your workspace…" over a canvas that never opens, which reads as a
     load that failed rather than as a requirement. It is prose on the canvas,
     not a box, and it says the two true things — the workbench needs a script,
     and the reading sections do not. It hangs off the `(app)` group with the
     rest of the shell so it cannot reach the `(site)` pages, which have nothing
     to apologise for. -->
<noscript>
	<!-- Parsed only where scripting is off, which is the one place this rule is
	     wanted: the boot screen covers the window at `--layer-boot` and would
	     otherwise sit over this message, and the shell behind it is an empty
	     workbench. A stacking context above the boot screen would need a layer
	     token for a state no script can ever reach. -->
	<style>
		.app-shell,
		.boot-screen {
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
