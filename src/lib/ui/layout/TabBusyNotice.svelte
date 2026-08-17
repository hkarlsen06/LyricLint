<script lang="ts">
	// What a second tab is told instead of a workbench, while the first one still
	// has it. `tab-guard.ts` decides when, this says what.
	//
	// Nothing here is interactive, and that is the message rather than an
	// omission: the way out is closing the other tab, and this page takes the
	// workbench over on its own the moment that happens. A "use this tab instead"
	// button would be a control for a decision the user has already made by
	// walking over here, and it would have to steal a lock from a tab that may be
	// mid-save — which is the loss this guard exists to prevent, offered as a
	// press.
	//
	// Prose on the canvas: no border, no fill, no card. The message is the whole
	// page, so it has nothing to be separated from — see "A card has to earn its
	// border" in AGENTS.md, and `.error-page` in `overlays.css`, which is the same
	// shape for the same reason.
	import AppWordmark from './AppWordmark.svelte';
</script>

<div class="tab-busy-notice">
	<div>
		<h1><AppWordmark /> is open in another tab</h1>
		<p>
			Your 'scribes are saved in this browser, and two tabs saving them at once would write over
			each other — so the tab that opened the workbench first keeps it.
		</p>
		<p>Close that tab and this page picks the workbench up on its own.</p>
	</div>
</div>

<style>
	.tab-busy-notice {
		display: grid;
		/* `dvh` for the reason `.error-page` takes it: a full-window message sized to
		   the large viewport is taller than a phone's window by the URL bar, so the
		   one page that says only "not here" would also scroll. */
		min-height: 100vh;
		min-height: 100dvh;
		padding: var(--space-6);
		place-content: center;
		background: var(--color-canvas);
	}

	/* Measure only. */
	.tab-busy-notice > div {
		max-width: 34rem;
	}

	/* The brand is the first word of the headline rather than a logo above it, so
	   it runs at the heading's size and not at one of its own. Every dimension in
	   the lockup is already expressed against its own type, so inheriting a
	   font-size is the whole override. */
	.tab-busy-notice h1 {
		margin: 0 0 var(--space-4);
		font-size: var(--font-size-2xl);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}

	/* The same baseline correction `.landscape-notice h1 .app-wordmark` makes, for
	   the same reason: the lockup is inline-flex whose first item holds only
	   absolutely positioned letters, so it has no baseline of its own and the
	   browser synthesises one from the bottom of its margin box — which rides the
	   brand above the sentence it is the first word of. Stable in `em` because the
	   wordmark and the body copy are the mono and sans cuts of one family. */
	.tab-busy-notice h1 :global(.app-wordmark) {
		font-size: inherit;
		vertical-align: -0.181em;
	}

	.tab-busy-notice p {
		margin: 0 0 var(--space-3);
		color: var(--color-text-muted);
	}

	.tab-busy-notice p:last-child {
		margin-bottom: 0;
	}
</style>
