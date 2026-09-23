<script lang="ts">
	import AppWordmark from '../layout/AppWordmark.svelte';
</script>

<span class="lyric-icon" aria-hidden="true">
	<AppWordmark animated={false} markOnly />
</span>

<style>
	/* The mark inside a button takes the button's own ink, not the brand amber.
	   These belong to the icon rather than to any one action row: the icon only
	   ever rides a button's label, and scoping them to one row is how the hero's
	   contrast action shipped an amber wave on a near-white fill. The mark
	   inherits, wherever the button is. */
	.lyric-icon {
		display: inline-flex;
		flex: none;
		width: 1.25em;
		height: 1.25em;
		align-items: center;
		justify-content: center;
	}

	.lyric-icon :global(.app-wordmark) {
		color: inherit;
		font-size: 0.64em;
	}

	.lyric-icon :global(.app-wordmark__bracket),
	.lyric-icon :global(.app-wordmark__wave path) {
		stroke: currentColor;
	}
</style>
