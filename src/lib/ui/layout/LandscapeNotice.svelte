<script lang="ts">
	// The landscape gate's content. It is always in the document and hidden by
	// default; `responsive.css` decides when it replaces the app. Doing that in
	// CSS rather than in a `matchMedia` check is deliberate — the app is
	// prerendered, so a JS gate would ship the workbench markup first and swap it
	// for this notice a frame later, on exactly the devices least able to hide the
	// flash.
	//
	// It asks for a rotation and nothing else. The way out is one gesture the
	// reader is already holding the device to make, so a link somewhere else would
	// be answering a question they did not ask — which is what separates this from
	// the whole-phone gate it replaced, where there was no way forward on the
	// device at all.
	import AppWordmark from './AppWordmark.svelte';
</script>

<div class="landscape-notice">
	<div>
		<h1><AppWordmark /> needs the tall side</h1>
		<p>
			The editor and the linter stack one above the other, and a phone held sideways leaves neither
			of them a usable height.
		</p>
		<p>Turn the phone upright to keep going.</p>
	</div>
</div>
