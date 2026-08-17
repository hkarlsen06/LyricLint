<script lang="ts">
	import { resolve } from '$app/paths';
	import LandscapeNotice from '$lib/ui/layout/LandscapeNotice.svelte';
	import LiveRegion from '$lib/ui/primitives/LiveRegion.svelte';
	import ToastRegion from '$lib/ui/primitives/ToastRegion.svelte';
	import { useFeedbackState } from '$lib/ui/state/feedback.svelte.js';

	let { children } = $props();
	const feedback = useFeedbackState();
</script>

<!-- The whole app hangs off one wrapper so the landscape gate can take it out of
     both the layout and the accessibility tree with a single rule. The regions
     belong inside it: their toasts are fixed-position and would otherwise paint
     over the notice while the hidden workspace kept autosaving.

     This is a group layout rather than the root one because the gate must not
     reach the pages under `(site)`. Those are prose and read perfectly well on a
     phone held either way round.

     The touch notice draws here too, because it is a toast like any other now.
     What is *not* here is the decision to raise it: that waits for the boot
     screen, which is the workbench page's own state and not something a layout
     can see, so the page speaks it and this region draws it. -->

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
				are all script. The <a href={resolve('/rules/')}>linter rules</a> and the
				<a href={resolve('/guidelines/')}>guidelines</a> read fine without it.
			</p>
		</div>
	</div>
</noscript>

<div class="app-shell">
	{@render children()}
	<LiveRegion {feedback} />
	<ToastRegion {feedback} />
</div>
<LandscapeNotice />
