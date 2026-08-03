<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import type { LinkDifference, TextRange } from '$lib/core/types.js';
	import { describeControl } from '$lib/ui/state/control-tooltip.svelte.js';
	import type { ScreenRect } from '../contracts.js';
	import type { LinkOccurrence } from '../section-links.js';

	interface Props {
		/** Every section of this kind, in document order, the current one included. */
		occurrences: readonly LinkOccurrence[];
		/** The one the card was opened from: the source every decision resolves against. */
		currentHeaderFrom: number;
		/** Header offsets already tied to this one, so the card opens on the truth. */
		initialSelected?: readonly number[];
		/**
		 * What the group of these headers would disagree on, asked afresh whenever
		 * the ticked sections change — the shape of a set that is not yet a group is
		 * not stored anywhere, it is worked out from the words.
		 */
		differencesFor: (headerOffsets: number[]) => LinkDifference[];
		/** Words selected for a local replacement or a new link difference. */
		pendingSelection?: TextRange;
		pendingSelectionText?: string;
		/** The caret is in shared text of this already-linked section. */
		typeOnlyHereAvailable?: boolean;
		anchor?: ScreenRect;
		placement?: 'above' | 'below';
		onApply: (choice: {
			headers: number[];
			keepDifferent: boolean[];
			makeDifferent?: TextRange;
			replaceFrom?: number;
		}) => void;
		onTypeOnlyHere?: () => void;
		onCancel: () => void;
		returnFocus: () => void;
	}

	let {
		occurrences,
		currentHeaderFrom,
		initialSelected = [],
		differencesFor,
		pendingSelection,
		pendingSelectionText,
		typeOnlyHereAvailable = false,
		anchor,
		placement = 'above',
		onApply,
		onTypeOnlyHere,
		onCancel,
		returnFocus
	}: Props = $props();

	const others = $derived(
		occurrences.filter((occurrence) => occurrence.headerFrom !== currentHeaderFrom)
	);
	const current = $derived(
		occurrences.find((occurrence) => occurrence.headerFrom === currentHeaderFrom)
	);
	const kind = $derived(current?.label.replace(/\s+\d+$/u, '') ?? 'section');
	const kindWord = $derived(kind.toLocaleLowerCase());

	let selected = $state<number[]>([...untrack(() => initialSelected)]);
	/**
	 * The one decision the card asks about the words, and it is a two-way choice
	 * rather than a tick per difference.
	 *
	 * A checkbox per difference is what this used to be, and it was unreadable for
	 * a reason worth keeping written down: ticked meant *keep these words apart*,
	 * six pixels under a list where ticked meant *include this section*. One
	 * control, two opposite meanings, on one card. A radio pair states both
	 * outcomes as sentences and can only be read one way.
	 */
	let replaceWords = $state(false);
	/** Whose version wins where a difference is closed. The opened copy by default. */
	let replaceFrom = $state(untrack(() => currentHeaderFrom));
	let activeIndex = $state(0);
	let keyboardNavigated = $state(false);
	let root: HTMLDivElement;
	const mac =
		typeof navigator === 'undefined' ? false : /Mac|iPhone|iPad|iPod/iu.test(navigator.platform);
	const typeOnlyHereShortcut = mac ? '⌃⌥H' : 'Ctrl+Alt+H';

	const headers = $derived([currentHeaderFrom, ...selected]);
	const wasLinked = $derived(initialSelected.length > 0);
	const membershipChanged = $derived(
		selected.length !== initialSelected.length ||
			selected.some((headerFrom) => !initialSelected.includes(headerFrom))
	);

	/**
	 * What the ticked copies disagree on — and nothing at all until some are
	 * ticked.
	 *
	 * The card asks one thing at a time: which sections, then what to do about the
	 * words they differ on. A previous version showed the comparison and the
	 * decision up front, for what a copy the user had not picked yet would differ
	 * on, which is a question asked before the one it depends on has been
	 * answered. It was there to stop the card growing on the first tick; growth is
	 * handled by pinning the card's top instead — see `pinnedTop`.
	 */
	const differences = $derived(headers.length > 1 ? differencesFor(headers) : []);
	/**
	 * A missing body is not a lyric variation worth preserving. When every
	 * disagreement is one real wording against emptiness while membership is
	 * changing, filling the empty copy is the only meaningful link outcome, so
	 * there is no decision to ask for. An empty wording in a group already linked
	 * can be a deliberate `Type only here` insertion and must stay a difference.
	 */
	const fillsOnlyEmptyCopies = $derived(
		membershipChanged &&
			differences.length > 0 &&
			differences.every((difference) => {
				const nonEmpty = new Set(
					difference.wordings
						.map((wording) => wording.text)
						.filter((wording) => wording.trim().length > 0)
				);
				return (
					nonEmpty.size === 1 &&
					difference.wordings.some((wording) => wording.text.trim().length === 0)
				);
			})
	);
	const replacing = $derived(replaceWords || fillsOnlyEmptyCopies);

	// Roving tabindex counts only the section rows that can be pressed — the
	// source's own row is in the list, greyed, because that is where the reader
	// looks to see which copy they are working from, and it has no index of its
	// own. The radios are a Tab stop and handle their own arrow keys.
	const rowIndex = $derived(
		new Map(others.map((occurrence, index) => [occurrence.headerFrom, index]))
	);

	const labelFor = $derived(
		new Map(
			occurrences.map((occurrence) => [occurrence.headerFrom, `${kind} ${occurrence.ordinal}`])
		)
	);

	/**
	 * Copies that say the same thing are one possible replacement, not several
	 * choices with different names and the same result. Their complete vector of
	 * divergent wordings is the identity of a version; shared text is identical
	 * by construction and therefore does not need to be repeated in the key.
	 */
	const replaceOptions = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a local accumulator inside a derived, discarded before anything reads it
		const groups = new Map<string, number[]>();
		for (const header of headers) {
			const version = JSON.stringify(
				differences.map(
					(difference) =>
						difference.wordings.find((wording) => wording.headerFrom === header)?.text ?? ''
				)
			);
			groups.set(version, [...(groups.get(version) ?? []), header]);
		}
		return [...groups.values()].map((members) => {
			const ordinals = members.map(
				(header) => occurrences.find((occurrence) => occurrence.headerFrom === header)?.ordinal ?? 0
			);
			const suffix =
				ordinals.length < 3
					? ordinals.join(' & ')
					: `${ordinals.slice(0, -1).join(', ')} & ${ordinals.at(-1)}`;
			return { value: members[0] ?? currentHeaderFrom, members, label: `${kind} ${suffix}` };
		});
	});
	const replaceOptionValue = $derived(
		replaceOptions.find((option) => option.members.includes(replaceFrom))?.value ?? replaceFrom
	);

	// Whether the card *opened* on a group that was already complete, which is the
	// one state where the note has no linking left to describe: every peer is in,
	// so all that is on offer is taking one out.
	//
	// Read once, not derived live. Unticking a row would otherwise swap the
	// sentence back, and the two wrap to different heights — which is the resize
	// under the pointer this card is built not to do.
	const openedComplete = untrack(
		() => initialSelected.length > 0 && initialSelected.length === occurrences.length - 1
	);

	/**
	 * The card's own top edge, measured once it has drawn, after which it grows
	 * downwards.
	 *
	 * What the "must not resize" rule is really protecting is the **position** of
	 * whatever the pointer is on, and freezing the card's size was the wrong way
	 * to get it: the card hangs from its bottom edge, so anything appearing lower
	 * down pushes the section list — the very checkboxes being ticked — up the
	 * screen. Reserving that space instead meant the card opened as a tall box
	 * full of decisions about copies nobody had picked yet.
	 *
	 * Pinned at the top, the list stays exactly where it is and the card extends
	 * downwards into space the user is not pointing at. Only the `above`
	 * placement needs it; `below` is already measured from its top.
	 */
	let pinnedTop = $state<number | undefined>();

	const changed = $derived(membershipChanged || replacing || pendingSelection !== undefined);
	const typeOnlyHereReady = $derived(
		wasLinked &&
			!membershipChanged &&
			!replacing &&
			typeOnlyHereAvailable &&
			onTypeOnlyHere !== undefined
	);

	const top = $derived(
		pinnedTop ?? Math.max(8, placement === 'above' ? (anchor?.top ?? 8) : (anchor?.bottom ?? 0) + 6)
	);
	const position = $derived(
		anchor
			? `--ll-anchor-left: ${Math.max(8, anchor.left)}px; top: ${top}px; --ll-room: ${Math.max(120, window.innerHeight - top - 8)}px;`
			: undefined
	);

	function rowInputs(): HTMLInputElement[] {
		return root ? [...root.querySelectorAll<HTMLInputElement>('[data-link-row]')] : [];
	}

	function focusActive(): void {
		rowInputs()[activeIndex]?.focus();
	}

	function move(delta: number): void {
		const rows = rowInputs();
		if (rows.length === 0) {
			return;
		}
		activeIndex = (activeIndex + delta + rows.length) % rows.length;
		void tick().then(focusActive);
	}

	// Roving tabindex leaves one stop in the list, so a plain Tab would land on
	// the workbench behind an open card. Cycle within; Escape and Apply are the
	// ways out. Same rule as the performer picker.
	function tabStops(): HTMLElement[] {
		if (!root) {
			return [];
		}
		const row = rowInputs()[activeIndex];
		return [
			...(row ? [row] : []),
			...root.querySelectorAll<HTMLElement>(
				'.outcome input:checked, .actions button:not(:disabled)'
			)
		];
	}

	function trapTab(event: KeyboardEvent): void {
		event.preventDefault();
		const stops = tabStops();
		if (stops.length < 2) {
			return;
		}
		const index = stops.findIndex((stop) => stop === document.activeElement);
		const delta = event.shiftKey ? -1 : 1;
		stops[(Math.max(0, index) + delta + stops.length) % stops.length]?.focus();
	}

	function toggle(headerFrom: number): void {
		selected = selected.includes(headerFrom)
			? selected.filter((candidate) => candidate !== headerFrom)
			: [...selected, headerFrom];
		// A copy that is no longer in the group cannot be the one whose version wins.
		if (!selected.includes(replaceFrom) && replaceFrom !== currentHeaderFrom) {
			replaceFrom = currentHeaderFrom;
		}
	}

	function apply(): void {
		if (!changed) {
			return;
		}
		const restoreFocus = returnFocus;
		// Asked again for the copies actually ticked: the comparison above may be
		// showing the offer for all of them, which is a different list.
		onApply({
			headers,
			keepDifferent: (headers.length > 1 ? differencesFor(headers) : []).map(() => !replacing),
			makeDifferent: pendingSelection,
			replaceFrom
		});
		void tick().then(restoreFocus);
	}

	function beginTypeOnlyHere(): void {
		if (!typeOnlyHereReady || !onTypeOnlyHere) {
			return;
		}
		const restoreFocus = returnFocus;
		onTypeOnlyHere();
		void tick().then(restoreFocus);
	}

	function cancel(): void {
		const restoreFocus = returnFocus;
		onCancel();
		void tick().then(restoreFocus);
	}

	// The press has already chosen where the user is working next, so unlike
	// Escape this hands no focus back.
	function dismiss(): void {
		onCancel();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (
			typeOnlyHereReady &&
			event.ctrlKey &&
			event.altKey &&
			event.key.toLocaleLowerCase() === 'h'
		) {
			event.preventDefault();
			beginTypeOnlyHere();
			return;
		}
		if (event.key === 'Tab') {
			trapTab(event);
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			if (typeOnlyHereReady) {
				beginTypeOnlyHere();
			} else {
				apply();
			}
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			cancel();
			return;
		}
		// Arrows belong to the radio group while it holds focus, which is what a
		// radio group is for. Only the section list roves.
		if (!(document.activeElement as HTMLElement | null)?.hasAttribute('data-link-row')) {
			return;
		}
		switch (event.key) {
			case 'ArrowDown':
			case 'ArrowRight':
				event.preventDefault();
				move(1);
				break;
			case 'ArrowUp':
			case 'ArrowLeft':
				event.preventDefault();
				move(-1);
				break;
		}
	}

	/**
	 * Enough of the line either side to place the run, and no more.
	 *
	 * Trimmed towards the middle rather than left to the browser's own ellipsis,
	 * which cuts from the end and would drop the run itself off the edge of a
	 * narrow card whenever the line's opening is long. A leading `…` says the line
	 * carries on.
	 */
	const CONTEXT = 22;

	function lead(before: string): string {
		const flat = oneLine(before);
		return flat.length > CONTEXT ? `…${flat.slice(-CONTEXT)}` : flat;
	}

	function trail(after: string): string {
		const flat = oneLine(after);
		return flat.length > CONTEXT ? `${flat.slice(0, CONTEXT)}…` : flat;
	}

	/** A run may span lines; the row is one line, so the breaks are shown as marks. */
	function oneLine(text: string): string {
		return text.replace(/\n/gu, ' ⏎ ');
	}

	/**
	 * The version every copy ends up with, once replacing is chosen.
	 *
	 * The picked copy's, unless it has nothing there — an empty wording never
	 * wins, exactly as `winningWording` decides it in the editor. The two have to
	 * agree, because this is the row that promises what that one is about to do.
	 */
	function winningText(difference: LinkDifference): string {
		const picked = difference.wordings.find((wording) => wording.headerFrom === replaceFrom);
		if (picked && picked.text.trim().length > 0) {
			return picked.text;
		}
		return (
			difference.wordings.find((wording) => wording.text.trim().length > 0)?.text ??
			picked?.text ??
			''
		);
	}

	function fullLine(wording: { before: string; text: string; after: string }): string {
		return oneLine(`${wording.before}${wording.text}${wording.after}`);
	}

	onMount(() => {
		focusActive();
		// After the first paint, so the measurement is of a card that has drawn.
		if (anchor && placement === 'above') {
			requestAnimationFrame(() => {
				const measured = root?.getBoundingClientRect().top;
				if (measured !== undefined) {
					pinnedTop = Math.max(8, measured);
				}
			});
		}
		// The card takes focus as it opens, so :focus-visible would ring the first
		// row before anyone navigated to it. Reveal on the first Tab or arrow.
		const revealFocusRing = (event: KeyboardEvent): void => {
			if (event.key === 'Tab' || event.key.startsWith('Arrow')) {
				keyboardNavigated = true;
			}
		};
		window.addEventListener('keydown', revealFocusRing, true);
		return () => window.removeEventListener('keydown', revealFocusRing, true);
	});
</script>

<div
	class="picker-layer"
	class:anchored={anchor}
	class:below={anchor && placement === 'below'}
	class:pinned={pinnedTop !== undefined}
	style={position}
	{@attach dismissOnOutside(dismiss)}
>
	<div
		bind:this={root}
		class="picker"
		class:show-focus={keyboardNavigated}
		role="dialog"
		tabindex="-1"
		aria-label={`Link this ${kindWord}`}
		onkeydown={handleKeydown}
		onmousedown={(event) => {
			// Keep presses on the card from handing focus back to the editor, but do
			// not cancel the native gesture that opens the version picker. A select
			// needs its mousedown default action in browsers even though its later
			// change event is all the application itself handles.
			if (!(event.target instanceof HTMLElement && event.target.closest('select'))) {
				event.preventDefault();
			}
		}}
	>
		<p class="picker__prompt">Link this {kindWord} to</p>
		<ul class="rows">
			{#each occurrences as occurrence (occurrence.headerFrom)}
				{@const isCurrent = occurrence.headerFrom === currentHeaderFrom}
				{@const isSelected = selected.includes(occurrence.headerFrom)}
				<li>
					{#if isCurrent}
						<label class="row row--current">
							<input class="row__check" type="checkbox" checked disabled />
							<span class="row__label">{kind} {occurrence.ordinal}</span>
							<span class="row__meta">This section · line {occurrence.line}</span>
						</label>
					{:else}
						<label class="row" class:row--matching={occurrence.comparison === 'same'}>
							<input
								type="checkbox"
								data-link-row
								data-header={occurrence.headerFrom}
								class="row__check"
								checked={isSelected}
								tabindex={rowIndex.get(occurrence.headerFrom) === activeIndex ? 0 : -1}
								onchange={() => toggle(occurrence.headerFrom)}
								onfocus={() => (activeIndex = rowIndex.get(occurrence.headerFrom) ?? 0)}
							/>
							<span class="row__label">{kind} {occurrence.ordinal}</span>
							<span class="row__meta">
								{occurrence.comparison === 'same'
									? 'Same lyrics'
									: occurrence.comparison === 'empty'
										? 'Empty'
										: 'Differs'}
								· line {occurrence.line}
							</span>
						</label>
					{/if}
				</li>
			{/each}
		</ul>

		{#if headers.length > 1}
			<!-- A diff, not a control. Each version on its own line under the name of
			     the section it belongs to, and each shown *in* its own line so the
			     shared halves stack up and the differing run is the only thing that
			     moves. Nothing in here is pressable. -->
			<p class="compare__head">
				{differences.length === 0
					? 'These copies say the same thing.'
					: `They differ in ${differences.length} ${differences.length === 1 ? 'place' : 'places'}`}
			</p>
			{#if differences.length > 0}
				<ul class="compare">
					{#each differences as difference (difference.index)}
						{@const winning = winningText(difference)}
						{#each difference.wordings as wording (wording.headerFrom)}
							{@const settled = !replacing || wording.text === winning}
							<li class="compare__side" class:compare__side--settled={replacing && settled}>
								<span class="compare__who">{labelFor.get(wording.headerFrom) ?? ''}</span>
								<span class="compare__line" title={fullLine(wording)}
									><span class="compare__shared">{lead(wording.before)}</span
									>{#if settled}{#if wording.text}<span class="compare__run"
												>{oneLine(wording.text)}</span
											>{:else}<span
												class="compare__run compare__run--empty"
												aria-label="nothing here"
											></span>{/if}{:else}{#if wording.text}<del class="compare__drop"
												>{oneLine(wording.text)}</del
											>{/if}{#if winning}<ins class="compare__add">{oneLine(winning)}</ins
											>{/if}{/if}<span class="compare__shared">{trail(wording.after)}</span></span
								>
							</li>
						{/each}
					{/each}
				</ul>
			{/if}
		{/if}

		{#if differences.length > 0 && !fillsOnlyEmptyCopies}
			<!-- The one decision, stated as two outcomes rather than as a tick whose
			     polarity has to be worked out. -->
			<fieldset class="outcome">
				<legend class="sr-only">What to do with the words that differ</legend>
				<label class="outcome__choice">
					<input
						type="radio"
						name="link-words"
						checked={!replaceWords}
						onchange={() => (replaceWords = false)}
					/>
					<span>Respect differences between them</span>
				</label>
				<div class="outcome__choice">
					<input
						id="link-words-replace"
						type="radio"
						name="link-words"
						checked={replaceWords}
						aria-label="Replace them with another section’s version"
						onchange={() => (replaceWords = true)}
					/>
					<label for="link-words-replace">Replace them with</label>
					<!-- Any copy, not the one the card happens to be open on: noticing that
					     the third chorus has the wording worth keeping is the ordinary case,
					     and hard-wiring the opened section makes the repair "close the card
					     and open it again from the right copy". -->
					<select
						class="outcome__select"
						aria-label="Which section’s version to use"
						value={replaceOptionValue}
						onchange={(event) => {
							replaceFrom = Number(event.currentTarget.value);
							replaceWords = true;
						}}
					>
						{#each replaceOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
					<label for="link-words-replace">’s version</label>
				</div>
			</fieldset>
		{/if}

		{#if pendingSelection && !typeOnlyHereReady}
			<p class="picker__note">
				The words you selected — <span class="picker__quote">{pendingSelectionText?.trim()}</span> — will
				be left out of the link.
			</p>
		{:else}
			<!-- One sentence per *opening*, never one per tick, so the note cannot
			     rewrap to a different height under the pointer that just ticked a row. -->
			<p class="picker__note">
				{others.length === 0
					? `This is the only ${kindWord} in the song.`
					: openedComplete
						? `These ${occurrences.length} sections are linked: editing one edits the others.`
						: 'Linked sections stay in sync as you edit them.'}
			</p>
		{/if}
		{#if typeOnlyHereReady}
			<div class="type-only-here-action">
				<p class="picker__note">
					Your next edit at the caret won’t be copied to the other linked sections.
				</p>
				<div class="actions actions--single">
					<button
						type="button"
						class="button apply type-only-here"
						aria-keyshortcuts="Control+Alt+H"
						onclick={beginTypeOnlyHere}
						{@attach describeControl(() => ({
							label: 'Type only here',
							shortcut: typeOnlyHereShortcut
						}))}
					>
						Type only here
					</button>
				</div>
			</div>
		{:else}
			<div class="actions">
				<button
					type="button"
					class="button button--contrast apply"
					disabled={!changed}
					onclick={apply}
				>
					{membershipChanged && selected.length > 0
						? `Link ${selected.length + 1} sections`
						: membershipChanged
							? 'Unlink'
							: replacing
								? 'Replace words'
								: pendingSelection
									? 'Leave out'
									: wasLinked
										? 'Unlink'
										: 'Link'}
					<span aria-hidden="true" class="apply__key">↵</span>
				</button>
				<button type="button" class="button button--quiet" onclick={cancel}>Cancel</button>
			</div>
		{/if}
	</div>
</div>

<style>
	/* A width, not a max-width. Sized to its content the card grew and shrank as
	   rows were ticked — and it hangs from its own bottom edge, so every change
	   moved it under the pointer that caused it. Nothing in here may depend on
	   what is selected. */
	.picker-layer {
		z-index: var(--layer-picker);
		display: grid;
		width: min(24rem, calc(100vw - 1rem));
	}

	.picker {
		display: grid;
		width: 100%;
		max-height: inherit;
		overflow-y: auto;
		gap: var(--space-2);
		padding: var(--space-2-5);
		border: var(--border-width) solid var(--color-border-strong);
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
		font-family: var(--font-ui);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-tight);
	}

	.anchored {
		position: fixed;
		left: clamp(0.5rem, var(--ll-anchor-left), calc(100vw - 24.5rem));
		transform: translateY(calc(-100% - 0.45rem));
	}

	/* Measured once it has drawn, after which the top is where it stays and the
	   card extends downwards — see `pinnedTop`. `--ll-room` is what is left below
	   it, so a comparison longer than the screen scrolls rather than putting the
	   actions out of reach. */
	.anchored.pinned {
		max-height: var(--ll-room);
		transform: none;
	}

	.anchored.below {
		transform: none;
	}

	/* The card's own question, in the card's own type: set muted and small it
	   reads as a caption on the list rather than as the thing being asked. */
	.picker__prompt {
		margin: 0;
		font-weight: var(--font-weight-semibold);
	}

	.picker__note {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-regular);
	}

	.picker__quote {
		color: var(--color-text);
		font-family: var(--font-mono);
	}

	.rows {
		display: grid;
		max-height: 13rem;
		margin: 0;
		padding: 0;
		gap: var(--space-0-5);
		overflow-y: auto;
		list-style: none;
	}

	.rows li {
		margin: 0;
	}

	/* Away from the rows above it: the list of sections is one thing and what they
	   differ on is another, and with the card's own uniform gap between them they
	   read as one run of six rows. */
	.compare__head {
		margin: var(--space-2) 0 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-regular);
	}

	/* Bounded rather than fixed: the card grows downwards from a pinned top, so
	   there is nothing to reserve — only a point past which a long comparison
	   should scroll instead of pushing the actions off the screen. */
	.compare {
		display: grid;
		max-height: 9rem;
		align-content: start;
		margin: 0;
		padding: 0;
		gap: var(--space-0-5);
		overflow-y: auto;
		list-style: none;
	}

	.compare__side {
		display: grid;
		align-items: baseline;
		gap: var(--space-1-5);
		grid-template-columns: auto 1fr;
	}

	.compare__who {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-regular);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	/* The lyric, in the editor's own face: the row is quoting the document rather
	   than naming a section. One line, so two versions of the same line sit
	   directly above one another and only the run between them moves. */
	.compare__line {
		min-width: 0;
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		line-height: var(--line-height-snug);
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}

	/* The shared halves are context, not content: quiet, so the eye lands on the
	   one span in the row that is actually different. */
	.compare__shared {
		color: var(--color-text-muted);
	}

	/* No `box-shadow` spread. It painted a band a pixel out from the run on every
	   side, which on the rows either side of it read as a stripe lying behind
	   words that are not part of the difference at all — the highlight has to end
	   where the run ends. Padding for the same reason: an inline box's own
	   horizontal padding, so it grows around its text rather than over the text
	   beside it. */
	.compare__run {
		padding: 0 0.15em;
		border-radius: var(--radius-sm);
		background: var(--color-warning-soft);
		color: var(--color-text);
	}

	/* Where this copy simply stops, or has nothing yet. An insertion caret rather
	   than the words "nothing here": it is the same mark a diff uses, it sits at
	   the exact point the other copies' words would go, and it costs the row no
	   width it would have to steal from the lyric. */
	.compare__run--empty {
		display: inline-block;
		width: 0;
		height: 1em;
		padding: 0;
		border-inline-start: 2px solid var(--color-warning);
		background: none;
		vertical-align: -0.2em;
	}

	/* Once replacing is chosen, a row that is changing shows the change rather
	   than its current state: the words it loses stay put, struck through, and the
	   words it gains sit beside them. That is the editor's own fix-preview idiom,
	   and it is the only arrangement that answers "what would actually happen" —
	   colouring a row red said only that something was wrong with it.
	   Struck through as well as coloured, because colour alone is never a state
	   carrier here. */
	.compare__drop {
		padding: 0 0.15em;
		border-radius: var(--radius-sm);
		background: var(--color-danger-surface);
		color: var(--color-danger);
		text-decoration: line-through;
	}

	.compare__add {
		padding: 0 0.15em;
		border-radius: var(--radius-sm);
		background: var(--color-success-surface);
		color: var(--color-text);
		text-decoration: none;
	}

	.compare__drop + .compare__add {
		margin-inline-start: 0.2em;
	}

	/* A row that is already saying the winning version has nothing to show as a
	   change, so it is marked as the version rather than as an edit. */
	.compare__side--settled .compare__run {
		background: var(--color-success-surface);
	}

	/* A caret only survives into the replacing state on a row that is not changing
	   — where the winning version is itself nothing. Everywhere else the green
	   insertion has taken its place, which is a better answer to "where do the
	   words go" than a bar. */
	.compare__side--settled .compare__run--empty {
		border-inline-start-color: var(--color-success);
		background: none;
	}

	.compare__side--settled .compare__who {
		color: var(--color-success);
	}

	/* No border and no legend drawn: a fieldset here is for the grouping the radio
	   pair needs in the accessible tree, not a box inside the card. */
	.outcome {
		display: grid;
		margin: var(--space-1) 0 0;
		padding: 0;
		border: 0;
		gap: 0;
	}

	/* One line each and no minimum height. Set to `--control-height-sm` with its
	   own padding on top, two sentences sat a whole row apart with nothing between
	   them, which read as two separate things rather than as one either/or. */
	.outcome__choice {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-control);
	}

	.outcome__choice label {
		white-space: nowrap;
	}

	/* Bordered, because it is the one thing in this row that can be operated, and
	   the row's own text is what it sits between. */
	.outcome__select {
		min-width: 0;
		max-width: 9rem;
		margin: 0 calc(-1 * var(--space-1));
		padding: 0 var(--space-1);
		border: var(--border-width) solid var(--color-border-strong);
		border-radius: var(--radius-control);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
	}

	.outcome__choice:hover {
		background: var(--color-control-hover);
	}

	.outcome__choice input {
		flex: none;
		width: 1rem;
		height: 1rem;
		margin: 0;
		accent-color: var(--color-accent);
	}

	/* Rows, not action buttons: full width, start-aligned, selection carried by
	   the row itself. The apply action uses the global tiers. */
	.row {
		display: flex;
		width: 100%;
		min-height: var(--control-height-sm);
		gap: var(--space-2);
		align-items: center;
		padding: var(--space-1) var(--space-2);
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-control);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: start;
	}

	.row:hover:not(.row--current) {
		background: var(--color-control-hover);
	}

	/* The source is greyed rather than dimmed: an opaque muted color, never
	   opacity, which would drop the whole row's contrast below AA. */
	.row--current {
		color: var(--color-text-muted);
	}

	.row--matching .row__meta {
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}

	.row:has(.row__check:checked):not(.row--current) {
		border-color: var(--color-border-strong);
		background: var(--color-selected);
	}

	.row__check {
		flex: none;
		width: 1rem;
		height: 1rem;
		margin: 0;
		accent-color: var(--color-accent);
		opacity: 1;
	}

	.row__label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row__meta {
		flex: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-variant-numeric: tabular-nums;
	}

	/* The apply action takes the row's free width rather than its own label's, so
	   `Link` becoming `Link 3 sections` moves neither button. */
	.actions {
		display: grid;
		gap: var(--space-1-5);
		grid-template-columns: 1fr auto;
	}

	/* A separate thought from the link status above, then a tight explanation →
	   action pair. No border or fill: grouping is spatial, not another card
	   inside the picker. */
	.type-only-here-action {
		display: grid;
		margin-block-start: var(--space-3);
		gap: var(--space-1-5);
	}

	.actions--single {
		grid-template-columns: 1fr;
	}

	.apply {
		min-height: var(--control-height-sm);
		padding: var(--space-1) var(--space-2-5);
	}

	/* This is the one decision in the already-linked state, and unlike the
	   ordinary link form there is no Cancel competing beside it. Blue names it
	   as the deliberate local exception without inventing another global tier. */
	.button.type-only-here {
		border-color: var(--color-accent);
		background: var(--color-accent);
		color: var(--color-accent-text);
	}

	.button.type-only-here:hover:not(:disabled) {
		border-color: var(--color-accent-hover);
		background: var(--color-accent-hover);
		color: var(--color-accent-text);
	}

	.button.type-only-here:active:not(:disabled) {
		border-color: var(--color-accent-active);
		background: var(--color-accent-active);
	}

	/* Secondary through weight and a mix against the button's own fill, never
	   opacity: the label beside it keeps full contrast on the inverted surface. */
	.apply__key {
		color: color-mix(in oklch, var(--color-canvas) 78%, var(--color-text));
		font-weight: var(--font-weight-regular);
	}

	.picker:not(.show-focus) :is(button, input):focus-visible {
		outline: none;
	}

	.show-focus :is(button, input):focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}

	@media (prefers-reduced-motion: no-preference) {
		button {
			transition:
				background-color var(--duration-fast) var(--ease-out-quart),
				border-color var(--duration-fast) var(--ease-out-quart),
				color var(--duration-fast) var(--ease-out-quart);
		}
	}

	@media (max-width: 34rem) {
		.picker-layer {
			right: 0.5rem;
			left: 0.5rem !important;
			max-width: none;
		}
	}
</style>
