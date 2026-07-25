<script lang="ts">
	// The brand lockup, as one pair of brackets rather than two. The mark's
	// brackets and the wordmark's `[Lint]` brackets were always the same shape
	// drawn twice, so here they are the same object: closed, the brackets hold
	// the waveform and the lockup is the mark; open, the waveform has flattened
	// into a baseline, `Lint` has grown out of it, and `Lyric` has been uncovered
	// by the left bracket sweeping right.
	//
	// Every part of that is driven by one registered custom property,
	// `--wm-open`, which is the only thing that transitions — the widths, the
	// letter fan-out, the flatten, and the bracket tint are all `calc()` off it.
	// One slider, the way an After Effects control null drives a rig: the states
	// cannot drift apart or race, and reversing mid-flight reverses everything
	// together. `shell.css` holds the arithmetic.
	//
	// Both halves are decoration, so the group carries the single accessible name
	// and the letters stay out of the accessibility tree — a screen reader should
	// hear the product name, not five spans and a bracket.

	let {
		/** When false the lockup stays open and still — it is the page's subject
		 * rather than a toolbar label, so it has nothing to collapse into. */
		interactive = true
	}: { interactive?: boolean } = $props();

	/** How long the wordmark holds before it contracts to the mark on load. */
	const INTRO_MS = 5000;

	const LEAD = ['L', 'y', 'r', 'i', 'c'];
	const WORD = ['L', 'i', 'n', 't'];

	const prefersReducedMotion =
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Starts open so the prerendered HTML is the wordmark: the intro is a hold on
	// the state the page already loaded in, not an animation that has to play.
	let introHolding = $state(true);

	$effect(() => {
		if (!interactive || prefersReducedMotion) return;
		const timer = setTimeout(() => (introHolding = false), INTRO_MS);
		return () => clearTimeout(timer);
	});

	// Not named `state`: that shadows the `$state` rune for the compiler's own
	// type mapping, and the errors it produces point at the rune, not at here.
	const openState = $derived(
		!interactive || prefersReducedMotion ? 'static' : introHolding ? 'intro' : 'idle'
	);
</script>

<div class="app-wordmark" data-state={openState} role="img" aria-label="LyricLint">
	<span class="app-wordmark__lead" aria-hidden="true">
		<span class="app-wordmark__letters">
			{#each LEAD as letter, index (index)}
				<span class="app-wordmark__letter" style="--wm-index: {index}">{letter}</span>
			{/each}
		</span>
	</span>

	<svg
		class="app-wordmark__bracket app-wordmark__bracket--open"
		aria-hidden="true"
		viewBox="4.1 7.4 4.9 17.2"
		fill="none"
	>
		<path d="M9 8.5H5.2v15H9" />
	</svg>

	<span class="app-wordmark__slot" aria-hidden="true">
		<svg class="app-wordmark__wave" viewBox="0 0 32 32" preserveAspectRatio="none" fill="none">
			<path d="M2 16Q9 6.7 16 16T30 16" />
		</svg>
		<span class="app-wordmark__letters app-wordmark__letters--inner">
			{#each WORD as letter, index (index)}
				<span class="app-wordmark__letter" style="--wm-index: {index}">{letter}</span>
			{/each}
		</span>
	</span>

	<svg
		class="app-wordmark__bracket app-wordmark__bracket--close"
		aria-hidden="true"
		viewBox="23 7.4 4.9 17.2"
		fill="none"
	>
		<path d="M23 8.5h3.8v15H23" />
	</svg>
</div>
