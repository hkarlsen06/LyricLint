<script lang="ts">
	import SmallScreenNotice from '$lib/ui/layout/SmallScreenNotice.svelte';
	import LiveRegion from '$lib/ui/primitives/LiveRegion.svelte';
	import ToastRegion from '$lib/ui/primitives/ToastRegion.svelte';
	import { useFeedbackState } from '$lib/ui/state/feedback.svelte.js';

	let { children } = $props();
	const feedback = useFeedbackState();
</script>

<!-- The whole app hangs off one wrapper so the phone gate can take it out of
     both the layout and the accessibility tree with a single rule. The regions
     belong inside it: their toasts are fixed-position and would otherwise paint
     over the notice while the hidden workspace kept autosaving.

     This is a group layout rather than the root one because the gate must not
     reach the pages under `(site)`. Those exist to be read on a phone — the
     notice links to them — and a gate that hid them would send a phone user to
     a page it had already blanked. -->
<div class="app-shell">
	{@render children()}
	<LiveRegion {feedback} />
	<ToastRegion {feedback} />
</div>
<SmallScreenNotice />
