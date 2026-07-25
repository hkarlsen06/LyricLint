<script lang="ts">
	// The phone gate's content. It is always in the document and hidden by
	// default; `responsive.css` decides when it replaces the app. Doing that in
	// CSS rather than in a `matchMedia` check is deliberate — the app is
	// prerendered, so a JS gate would ship the workbench markup first and swap it
	// for this notice a frame later, on exactly the devices least able to hide
	// the flash.
	import AppWordmark from './AppWordmark.svelte';
</script>

<div class="small-screen-notice">
	<div>
		<AppWordmark interactive={false} />
		<h1>LyricLint needs a bigger screen</h1>
		<p>
			The lyric editor and the linter panel work side by side, and fixing a diagnostic means
			selecting text and typing — none of which survives a phone-sized viewport.
		</p>
		<p>Open this page on a laptop or desktop to get started.</p>
	</div>
</div>
