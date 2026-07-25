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

	// The lockup behaves the same wherever it is used and takes no props to say
	// otherwise. It opens three ways: on load, under a pointer, and on a press
	// that latches.
	//
	// The press is what touch needs, and `:hover` cannot stand in for it. Tapping
	// an element that carries hover styles does apply them — which is why a tap
	// appears to open the lockup — but they stay applied until the next tap
	// somewhere else, so a second tap on the lockup itself changes nothing. A
	// toggle has to be a real toggle. Once pressed, the latch outranks hover in
	// both directions, or sticky hover would hold open the very thing the second
	// tap just closed; a mouse leaving drops the latch so hover takes over again,
	// and touch never reaches that because `pointerleave` after a tap would undo
	// the tap that caused it.

	/**
	 * How long the wordmark holds before it contracts to the mark on load: long
	 * enough to read the word, and not a moment longer. Silent reading runs about
	 * 238 words a minute, or ~250ms for the five-letter average; `LyricLint` is a
	 * nine-letter compound and costs closer to 400ms. Add a saccade to land on it
	 * in the first place, and a beat to register it before it moves — motion that
	 * begins on the same frame the eye arrives reads as a glitch, not a gesture.
	 *
	 * The old five seconds was a guess, and it was long enough that the
	 * contraction stopped reading as the end of an intro and started reading as
	 * something breaking.
	 */
	const READING_MS = 900;

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
		if (prefersReducedMotion) return;
		const timer = setTimeout(() => (introHolding = false), READING_MS);
		return () => clearTimeout(timer);
	});

	/**
	 * The press latch. `null` is "no one has pressed it — follow the pointer",
	 * which is the state a mouse leaving restores.
	 */
	let latched = $state<boolean | null>(null);

	function togglePress(): void {
		// Inverts what is on screen rather than the latch itself, so the first
		// press during the intro closes the wordmark instead of appearing to do
		// nothing.
		latched = !(latched ?? introHolding);
	}

	function releaseLatch(event: PointerEvent): void {
		// Mouse only. A touch pointer is destroyed when the finger lifts, so
		// `pointerleave` fires immediately after every tap — releasing here would
		// undo each press on the frame it happened.
		if (event.pointerType === 'mouse') latched = null;
	}

	// Not named `state`: that shadows the `$state` rune for the compiler's own
	// type mapping, and the errors it produces point at the rune, not at here.
	const openState = $derived(
		prefersReducedMotion
			? 'static'
			: latched === true
				? 'latched'
				: latched === false
					? 'released'
					: introHolding
						? 'intro'
						: 'idle'
	);
</script>

<!-- A `span`, not a `div`: the lockup is the first word of the phone gate's
     headline, and a heading takes phrasing content only. It also decides how the
     name is computed — a flow-content root gets spaced apart from the text
     beside it, so the heading announced as two fragments.

     It stays `role="img"` with a press handler rather than becoming a `button`,
     and the rule is silenced deliberately. Nothing is behind the press: it
     changes how the brand draws itself and nothing else — no content, no state,
     no navigation — so there is nothing a keyboard or screen-reader user is shut
     out of. A `button` would announce an action to everyone who cannot see the
     one thing it does, and would put a decorative toy in the workbench's tab
     order, ahead of the draft title. The image role is the honest one: this is a
     picture of the product's name that happens to move. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<span
	class="app-wordmark"
	data-state={openState}
	role="img"
	aria-label="LyricLint"
	onclick={togglePress}
	onpointerleave={releaseLatch}
>
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
</span>
