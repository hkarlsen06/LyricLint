<script lang="ts">
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

     The touch notice is not here, and that is deliberate: it has to wait for the
     boot screen, which is the workbench page's own state and not something a
     layout can see. It is rendered from there instead — still inside this
     wrapper, since the page is. -->
<div class="app-shell">
	{@render children()}
	<LiveRegion {feedback} />
	<ToastRegion {feedback} />
</div>
<LandscapeNotice />
