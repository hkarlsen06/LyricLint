<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * What a touch user is told on the way in: the workbench runs here, and it runs
	 * better on a laptop.
	 *
	 * It is a modal because it is the one thing on screen worth reading before
	 * anything else happens, and because a banner would have to live somewhere in a
	 * layout whose whole problem is that it has no room to spare. It is also the
	 * shortest-lived surface in the application — one press and it is gone for the
	 * session — which is what makes a modal proportionate rather than rude.
	 *
	 * Nothing inside it is boxed. The dialog is already the surface, so a bordered
	 * panel around the copy would be a card inside the card the reader is looking
	 * at ("No cards inside cards").
	 */

	/**
	 * A coarse pointer *and* the stacked layout. The pointer alone would stop a
	 * tablet in landscape, where the workbench is in its two-column form and there
	 * is nothing to warn about; the width alone would stop a narrow window on a
	 * laptop, which is a supported size with a keyboard behind it. `68rem` is the
	 * breakpoint that folds the panel under the editor, so this fires exactly where
	 * the layout is the compromised one.
	 */
	const QUERY = '(pointer: coarse) and (max-width: 68rem)';

	/**
	 * Session-scoped, like the ignored rules and for the same reason: a warning
	 * that has been read is noise, and one that is never repeated is a warning the
	 * user cannot get back. Closing the tab is what forgets it.
	 */
	const SEEN_KEY = 'lyriclint:session-touch-notice';

	let dialog: HTMLDialogElement;

	function dismiss(): void {
		dialog.close();
	}

	// `close` rather than the button's own handler, so `Escape` and a press on the
	// backdrop are remembered too — every way out is the same way out.
	function remember(): void {
		try {
			sessionStorage.setItem(SEEN_KEY, '1');
		} catch {
			// A browser refusing storage is not a reason to fail to open a draft. The
			// cost is the notice appearing again next time, which is the harmless
			// direction.
		}
	}

	// A press on the backdrop is a press outside the surface, which is one of the
	// three ways every transient surface here closes.
	function dismissOnBackdrop(event: MouseEvent): void {
		if (event.target === dialog) dialog.close();
	}

	// A browser refusing storage reads as "not seen", which shows the notice once
	// per load rather than losing it — the harmless direction of the same failure
	// `remember` swallows.
	function alreadySeen(): boolean {
		try {
			return sessionStorage.getItem(SEEN_KEY) !== null;
		} catch {
			return false;
		}
	}

	onMount(() => {
		if (alreadySeen() || !window.matchMedia(QUERY).matches) return;
		dialog.showModal();
	});
</script>

<dialog
	bind:this={dialog}
	class="touch-notice"
	aria-labelledby="touch-notice-title"
	onclick={dismissOnBackdrop}
	onclose={remember}
>
	<div class="touch-notice__body">
		<h2 id="touch-notice-title">LyricLint works best on a laptop</h2>
		<p>
			The workbench was built for a wide screen and a keyboard: the lyrics and the findings sit side
			by side, and every fix has a shortcut. On a phone they stack, and the panel is a scroll away.
		</p>
		<p>Everything here works. It will just be quicker on a desktop.</p>
		<!-- One action, because there is only one thing to decide. It takes the
		     contrast tier as the surface's primary action; there is no second
		     control to compete with it and no `Cancel`, because there is nothing to
		     cancel — the dialog closes three ways and all of them mean the same. -->
		<p class="touch-notice__action">
			<button type="button" class="button button--contrast" onclick={dismiss}>Got it</button>
		</p>
	</div>
</dialog>

<style>
	.touch-notice {
		width: min(30rem, calc(100vw - var(--space-4)));
		max-width: none;
		padding: 0;
		border: var(--border-width) solid var(--color-border-strong);
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}

	.touch-notice::backdrop {
		background: var(--color-backdrop);
	}

	.touch-notice__body {
		padding: var(--space-4);
	}

	.touch-notice__body h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}

	.touch-notice__body p {
		margin: 0 0 var(--space-3);
		color: var(--color-text-muted);
	}

	/* The action is a `<p>` so it inherits the reading rhythm, and it wants air
	   above it rather than that rhythm. Full width because there is one control
	   and a finger is what will press it. */
	.touch-notice__action {
		margin: var(--space-4) 0 0;
	}

	.touch-notice__action .button {
		width: 100%;
		min-height: var(--control-height-lg);
	}
</style>
