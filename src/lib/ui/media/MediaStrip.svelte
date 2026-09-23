<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon';
	import ListIcon from 'phosphor-svelte/lib/ListIcon';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import CursorClickIcon from 'phosphor-svelte/lib/CursorClickIcon';
	import RepeatIcon from 'phosphor-svelte/lib/RepeatIcon';
	import TextAlignLeftIcon from 'phosphor-svelte/lib/TextAlignLeftIcon';
	import TimerIcon from 'phosphor-svelte/lib/TimerIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { PHONE_WORKSPACE_QUERY } from '../state/phone-layout.js';
	import { MediaQuery } from 'svelte/reactivity';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import { describeControl } from '../state/control-tooltip.svelte.js';
	import { drawsCoverBand, formatTime } from '../state/media-player.svelte.js';
	import type { MediaStore } from '../state/media-store.svelte.js';
	import { pendingMediaLabel } from './pending-media-label.js';
	import MediaTransport from './MediaTransport.svelte';
	import MediaAttribution from './MediaAttribution.svelte';
	import MediaArtwork from './MediaArtwork.svelte';
	import LoadingMark from '../primitives/LoadingMark.svelte';

	/**
	 * Timing the whole lyric, which is a transport activity and therefore lives in
	 * the transport. Optional because the editor owns the mode and a strip rendered
	 * without one (the tests do this) has nothing to toggle.
	 */
	interface LyricSyncControl {
		readonly active: boolean;
		/** Every line a run would tap already has a time. */
		readonly complete?: boolean;
		/**
		 * A selection is standing, so the press scopes the run to it: the first
		 * tap times the selection's first line, and timing its last ends the run.
		 * It outranks `complete` in the label: a user who has selected lines over
		 * a fully timed song is asking to re-time exactly those.
		 */
		readonly scopesSelection?: boolean;
		/**
		 * A run standing here has timed lines between it and the next untimed one,
		 * so `skip` would actually move. False hides the control rather than
		 * disabling it: a skip with nowhere to go is a state that could not have
		 * been otherwise, like the empty transport.
		 */
		readonly canSkip?: boolean;
		toggle(): void;
		/** One tap of a run. The same command `Space` runs. See `tapLyricSync`. */
		tap(): void;
		/** Jump the run to the last timed line before the next untimed one. */
		skip?(): void;
	}

	/**
	 * Following the playhead. Shown only when the song has enough timed lines for
	 * a scroll to mean anything: one anchor scrolls nowhere.
	 */
	interface FollowControl {
		readonly available: boolean;
		readonly active: boolean;
		toggle(): void;
	}

	let {
		media,
		sync,
		follow,
		announce
	}: {
		media: MediaStore;
		sync?: LyricSyncControl;
		follow?: FollowControl;
		announce?: (message: string) => void;
	} = $props();

	const player = $derived(media.player);
	const phone = new MediaQuery(PHONE_WORKSPACE_QUERY);
	const detailsId = $props.id();
	let detailsOpen = $state(false);
	let disclosure = $state<HTMLButtonElement>();
	const detailsVisible = $derived(detailsOpen || !!sync?.active);

	function dismissDetails() {
		detailsOpen = false;
	}

	function dismissOnEscape(event: KeyboardEvent) {
		if (phone.current && detailsOpen && !sync?.active && event.key === 'Escape') {
			event.preventDefault();
			if (document.getElementById(detailsId)?.contains(document.activeElement)) disclosure?.focus();
			detailsOpen = false;
		}
	}

	$effect(() => {
		if (sync?.active) player.clearLoop();
	});

	// NaN until the browser has read the file's metadata, and a scrubber with no
	// range is a control that cannot be aimed, so it waits rather than pretending
	// to span a second.
	const seekable = $derived(Number.isFinite(player.duration) && player.duration > 0);

	// The elapsed share of the track, for the scrubber's own fill. WebKit has no
	// progress pseudo-element, so the stylesheet draws the played half as a
	// hard-stop gradient and this is the stop. It rides the same `currentTime`
	// mirror the readout beside it prints, so the two cannot disagree.
	const seekFill = $derived(
		seekable ? `${(Math.min(player.currentTime, player.duration) / player.duration) * 100}%` : '0%'
	);

	/**
	 * Keep the caret where the user put it.
	 *
	 * Focus moves on `mousedown`, so preventing its default is what stops a press
	 * here from taking focus off the document, and on a phone, focus leaving the
	 * document is the keyboard closing. The loop this row exists for is listen,
	 * pause, type: a pause that dismissed the keyboard would cost a tap to bring it
	 * back and a scroll to find the line again, every single time.
	 *
	 * Buttons only. A `<select>` and a `range` need their default press to open and
	 * to drag, so the rate control and the scrubber are left alone. They are also
	 * the two controls here that are aimed rather than tapped, where losing the
	 * keyboard is the smaller cost.
	 *
	 * Leave `pointerdown` alone: cancelling a touch pointerdown suppresses the
	 * activation click in WebKit. Its compatibility mousedown is the focus gate;
	 * cancelling that keeps the keyboard open while the real tap still plays.
	 *
	 * `click` is not a default action of `mousedown` and still fires, so every
	 * control keeps working exactly as it did. This is the same move a rich-text
	 * toolbar makes for the same reason.
	 *
	 * An attachment rather than an inline handler because the row is a `<div>`: a
	 * mouse handler written on it is an interactive element with no role, and the
	 * honest answer is that the row is not interactive: its buttons are, and this
	 * listens on their behalf.
	 */
	function keepFocus(node: HTMLElement) {
		const onPress = (event: MouseEvent) => {
			const target = event.target;
			if (target instanceof Element && target.closest('button')) event.preventDefault();
		};
		node.addEventListener('mousedown', onPress);
		return () => {
			node.removeEventListener('mousedown', onPress);
		};
	}

	/**
	 * Publish this row's height, so a toast can clear it.
	 *
	 * The toast region is `position: fixed`, centred on the window, and mounted by
	 * the app layout, nowhere near this element in the tree, so nothing in CSS
	 * can tell it how tall this row currently is. Left at the status bar's height
	 * alone, a toast raised while audio is attached lands over the transport: the
	 * one row a transcriber is operating while everything that raises a toast is
	 * happening.
	 *
	 * It has to be measured rather than named as a constant, for the same reason
	 * `responsive.css` moves this row onto the keyboard with a `- 100%` translate
	 * instead of an offset: the row is one control tall at rest, taller under a
	 * coarse pointer where every `.button` steps up to `--control-height-lg`, and
	 * taller again while a decode error wraps across it.
	 *
	 * On `<html>`, beside `--keyboard-top`, and removed on teardown. A height left
	 * behind holds every later toast above a strip that is no longer drawn, which
	 * is this same bug wearing the other hat.
	 */
	function publishStripHeight(node: HTMLElement) {
		const root = document.documentElement;
		const observer = new ResizeObserver(() => {
			root.style.setProperty('--media-strip-height', `${node.getBoundingClientRect().height}px`);
		});
		observer.observe(node);
		return () => {
			observer.disconnect();
			root.style.removeProperty('--media-strip-height');
		};
	}

	// A remote source is *loaded* and a local file is *reconnected*, because what
	// the press actually spends differs: one is a session's consent or sign-in, the
	// other is the permission the browser will only re-grant to a gesture.
	const pendingLabel = $derived(
		media.pendingName === undefined
			? undefined
			: pendingMediaLabel(media.pendingName, media.pendingSource)
	);
</script>

<svelte:document onkeydown={dismissOnEscape} />

<!--
	The audio transport, in the stable workspace media row shared by every view.

	It is not a fourth panel tab, because tabs are exclusive and that would make
	the user choose between seeing diagnostics and controlling audio during the one
	activity where both are live. It is not a floating card either: this row lives
	for as long as a file is attached, and a persistent box over the document
	occludes the thing being transcribed.

	It draws nothing until there is something to control, and the parent renders it
	only then. An empty transport is the same failure as a status bar full of
	zeroes: chrome reporting a state that could not have been otherwise.

	The controls are the same controls whichever source is attached, and this row
	holds all of them. A video's picture is not one of them and is not here: it
	draws in its own stable workspace row, below the panel on desktop and above
	playback on phones, so switching task views never hides or rebuilds it. Which
	source is attached shows in this row only in which rates the speed control
	offers.
-->
<div
	class="media-strip"
	data-testid="media-strip"
	data-loaded={player.attached}
	data-details-open={detailsVisible}
	{@attach publishStripHeight}
	{@attach keepFocus}
	{@attach dismissOnOutside(dismissDetails)}
>
	{#if player.attached && drawsCoverBand(player.sourceKind)}
		<MediaArtwork {media} {announce} />
	{/if}
	<div class="media-strip__controls">
		{#if player.attached}
			<div class="media-strip__transport">
				<MediaTransport {player} />

				<span class="media-strip__time" data-testid="media-elapsed">
					{formatTime(player.currentTime)}
				</span>
			</div>

			{#if player.error}
				<!-- Prose in the row it belongs to, not a tinted box that pops into
			     existence. The editor tray keeps the change-source action in place. -->
				<p class="media-strip__error">{player.error}</p>
			{:else}
				<!-- The value is clamped to the range that exists, and it is the same
			     `seekable` the range is drawn from rather than a second condition.
			     A restored position is reported the moment a draft opens, before the
			     metadata that says how long the song is, so an unclamped `112` was
			     handed to an element still spanning one second, the browser clamped
			     the DOM value to 1, and Svelte never pushed it again because
			     `currentTime` had not changed since the value it cached. The thumb
			     stayed at 1/161 beside a readout printing 1:52.

			     `aria-valuetext` because the raw pair is a hundredth-of-a-second step
			     against a duration in seconds: what a screen reader read out was
			     `112.35 of 241.4`, several times a second while the track ran. It says
			     what the two readouts either side of it say, in the same `m:ss`, and
			     before the metadata lands it says why the control cannot be aimed
			     rather than reporting a range that is not the song's. -->
				<input
					class="media-strip__seek"
					type="range"
					min="0"
					max={seekable ? player.duration : 1}
					step="0.05"
					value={seekable ? Math.min(player.currentTime, player.duration) : 0}
					disabled={!seekable}
					style="--seek-fill: {seekFill}"
					aria-label="Seek"
					aria-valuetext={seekable
						? `${formatTime(player.currentTime)} of ${formatTime(player.duration)}`
						: 'Not seekable yet'}
					oninput={(event) => player.seek(event.currentTarget.valueAsNumber)}
				/>
			{/if}

			<button
				type="button"
				class="button button--quiet media-strip__disclosure"
				bind:this={disclosure}
				aria-label="Audio details"
				aria-expanded={detailsVisible}
				aria-controls={detailsId}
				disabled={!!sync?.active}
				onclick={() => (detailsOpen = !detailsOpen)}
			>
				Audio
				{#if detailsVisible}
					<CaretUpIcon aria-hidden="true" size={14} weight="bold" />
				{:else}
					<CaretDownIcon aria-hidden="true" size={14} weight="bold" />
				{/if}
			</button>

			<div class="media-strip__meta" id={detailsId}>
				<span class="media-strip__time media-strip__duration">{formatTime(player.duration)}</span>
				<div class="media-strip__options">
					<!-- The rates the attached source can actually apply, not the rates the
			     workbench would like to offer. YouTube has a menu of its own and
			     ignores anything off it without a word, so a control listing the
			     constant would be offering presses that silently do nothing. -->
					<label class="media-strip__rate">
						<span class="sr-only">Playback speed</span>
						<select
							value={player.rate}
							onchange={(event) => player.setRate(Number(event.currentTarget.value))}
						>
							{#each player.availableRates as rate (rate)}
								<option value={rate}>{rate}×</option>
							{/each}
						</select>
					</label>

					<!--
				Timing the whole lyric. It sits here because syncing is a transport
				activity (you press play and tap along) and because this row only
				exists once there is something to tap along to.

				While a run is under way the slot beside it stops naming the file and
				states the two keys instead. That is the one thing a modal state owes
				the user: the document has quietly stopped taking typing, and a control
				reading `Stop syncing` explains that only to someone who already knows
				what syncing is.
			-->
					{#if seekable && !sync?.active}
						<div class="media-strip__loop">
							<button
								type="button"
								class="button"
								class:button--quiet={!player.loop}
								aria-label={player.loop?.end !== undefined
									? `Stop loop: ${formatTime(player.loop.start)}–${formatTime(player.loop.end)}`
									: player.loop
										? 'End here'
										: 'Loop from here'}
								aria-pressed={player.loop?.end !== undefined}
								disabled={!!player.loop &&
									player.loop.end === undefined &&
									player.currentTime < player.loop.start + 0.25}
								onclick={() => {
									if (player.loop?.end !== undefined) player.clearLoop();
									else if (player.loop) player.finishLoop();
									else player.setLoopStart();
								}}
								{@attach describeControl(() => ({
									label:
										player.loop?.end !== undefined
											? `Stop loop: ${formatTime(player.loop.start)}–${formatTime(player.loop.end)}`
											: player.loop
												? `Loop from ${formatTime(player.loop.start)} to here: play or seek ahead to set the end`
												: 'Loop from here: mark the start of a passage to repeat'
								}))}
							>
								<RepeatIcon aria-hidden="true" size={14} weight="bold" />
								{#if player.loop?.end !== undefined}
									<span class="media-strip__time"
										>{formatTime(player.loop.start)}–{formatTime(player.loop.end)}</span
									>
								{:else}
									{player.loop ? 'End here' : 'Loop'}
								{/if}
							</button>
							{#if player.loop && player.loop.end === undefined}
								<button
									type="button"
									class="button--quiet icon-button"
									aria-label="Cancel loop"
									onclick={() => player.clearLoop()}
									{@attach describeControl(() => ({ label: 'Cancel loop' }))}
								>
									<XIcon aria-hidden="true" size={14} weight="bold" />
								</button>
							{/if}
							<span class="sr-only" aria-live="polite"
								>{player.loop && player.loop.end === undefined
									? `Loop starts at ${formatTime(player.loop.start)}. Play or seek ahead, then press End here.`
									: ''}</span
							>
						</div>
					{/if}

					{#if follow?.available}
						<button
							type="button"
							class="button--quiet icon-button"
							aria-pressed={follow.active}
							aria-label="Follow the playing line"
							title={follow.active ? 'Stop following the playing line' : 'Follow the playing line'}
							onclick={follow.toggle}
						>
							{#if follow.active}
								<ListIcon aria-hidden="true" size={14} weight="bold" />
							{:else}
								<TextAlignLeftIcon aria-hidden="true" size={14} weight="bold" />
							{/if}
						</button>
					{/if}
				</div>
				<div class="media-strip__timing">
					{#if sync}
						<!--
					A finished song says so rather than offering the job again, but it is
					still the same control and still one press: `runStart` reads a fully
					timed lyric as a fresh pass from the top, which is the only sensible
					reading of pressing sync on finished work. The checkmark is the state
					and the title is what the press does; a readout that could not be
					pressed would take away the only way to re-time a song.

					A standing selection renames the press before it is made, to `Sync
					selection`, because the scope is decided at entry, and a label that
					only changed afterwards would be a control doing something it never
					offered. It outranks the finished state: selected lines over a fully
					timed song are a request to re-time exactly those lines.

					The idle title also names the slower rate, because slow-rate tapping
					is the sanctioned way to time a fast song and nothing else on screen
					connects the two controls: the tap offset scales with the rate, so a
					practice-rate run is as accurate as a full-speed one, and the anchors
					come out in track time either way.
				-->
						<button
							type="button"
							class="button media-strip__sync"
							title={sync.active
								? 'Stop timing and go back to editing'
								: sync.scopesSelection
									? 'Play and tap Space at each selected line to time it. The run stops after the last selected line'
									: sync.complete
										? 'Every line is timed. Play the song from the start and tap Space to time it again'
										: 'Play the song from the start and tap Space at each line to time it. Slowing the playback rate makes fast lines easier to tap'}
							onclick={sync.toggle}
						>
							{#if !sync.active && sync.complete && !sync.scopesSelection}
								<CheckIcon aria-hidden="true" size={13} weight="bold" />
							{:else}
								<TimerIcon aria-hidden="true" size={13} weight="bold" />
							{/if}
							<span>
								{sync.active
									? 'Stop syncing'
									: sync.scopesSelection
										? 'Sync selection'
										: sync.complete
											? 'Retime lyrics'
											: 'Sync lyrics'}
							</span>
						</button>
					{/if}

					{#if sync?.active}
						{#if sync.canSkip && sync.skip}
							<!--
						The way past lyrics that are already timed. A song synced once and
						then edited (a line split into several, in more than one place) is
						timed everywhere except the new lines, and a run walking towards the
						next one re-listens through whole verses that are already right.
						The press lands the run on the last timed line before the next
						untimed one and plays from that line's own moment, so there is a
						whole line of run-up to tap against, exactly as a resumed run gives
						itself.

						It draws only while there is somewhere to skip to. Offered over a
						song with no gap ahead it would be a press that does nothing, which
						is the failure `availableRates` exists to prevent, and its own
						disappearance after the last gap is the one sign the run gives that
						nothing ahead still wants a time.
					-->
							<button
								type="button"
								class="button media-strip__skip"
								title="Play from the last timed line before the next untimed one"
								onclick={sync.skip}
							>
								Skip timed lines
							</button>
						{/if}
						<!--
					The tap itself, because a finger has no `Space`. It takes the slot the
					hint took: the run's instruction is now the thing you press, which is
					shorter to read and is the only way to drive a run on a phone.

					It is a control on every pointer rather than one that appears under a
					coarse one. The command is the same command, pressing it is a legitimate
					way to time a line with a mouse, and a button that exists only on some
					devices is one nobody documents and nobody tests. What the pointer
					changes is its width (this file's styles): under a finger it takes the
					row's slack, because a target tapped in rhythm has to be found without
					looking.

					`Space` and `Enter` both activate a focused button, and both are the
					run's own keys, so a press here leaves the keyboard path working
					exactly as it did, on the button instead of in the document.

					The visible label is one word and a mark, and the mark is the
					tapping hand, the gesture the button exists for, drawn as every
					touch UI already draws it. A target pressed in rhythm is found by
					shape, not by reading three words, and the word beside the glyph
					confirms rather than instructs. The stopwatch would tie this to
					the mode better, but the sync control beside it already wears it,
					and one glyph on two adjacent controls is no glyph at all. The
					whole instruction stays the accessible name, because a glyph says
					nothing to a screen reader.
				-->
						<button
							type="button"
							class="button media-strip__tap"
							aria-label="Tap each line"
							aria-keyshortcuts="Space Enter"
							title="Time the line that is starting now"
							onclick={sync.tap}
						>
							<CursorClickIcon aria-hidden="true" size={14} weight="bold" />
							Tap
						</button>
						<span class="media-strip__hint">Esc stops</span>
					{/if}
				</div>
				{#if !sync?.active}
					<!--
					The name and the mark are said once, and both are said wherever the song
					is being shown: on the artwork band's own bar for a source that has one,
					here for a source that does not.

					**The condition is the source kind and not `player.artwork`, which is the
					bug this replaces.** A catalogue source is named before its cover arrives,
					because the read that fetches one is a round trip behind the attach, so keying on
					the picture put the title and the badge in this row for as long as that
					took and then moved them to the band underneath. What the user sees is the
					name flashing into the shortest row in the window and leaving again, which
					reads as a glitch rather than as a hand-off. Where a band is coming, this
					row never draws them at all.
				-->
					{#if !drawsCoverBand(player.sourceKind)}
						<div class="media-strip__source">
							<span class="media-strip__name" title={player.name}>{player.name}</span>
							<MediaAttribution {media} />
						</div>
					{/if}
				{/if}

				<!--
			No detach control, and there used to be one: an X at the end of the
			most-operated row in the window, a few pixels from the transport, so
			the press that missed threw the track away in the middle of the loop
			this row exists to serve. Detaching is a decision about what the
			draft's song is, not a transport operation, so it lives in the audio
			dialog beside every other answer to that question
			(`MediaPicker.svelte`), behind the same deliberate press, for a
			remembered source no less than an attached one.
		-->
			</div>
		{:else if media.pendingName}
			<!--
			The draft remembers its audio but nothing may act on that without a
			press, so the row asks for one. The source is named in the button rather
			than in a sentence beside it: the name is what the press is about, and a
			label plus a generic "Reconnect" would be two controls' worth of words
			for one control.
		-->
			<!-- A bare Escape loads the pending source, the fallback under the
		     transport's toggle, which the listener binds while a source is merely
		     pending. The keystroke was in `aria-keyshortcuts` alone, which made it
		     the one binding in the workbench nothing on screen could teach; the
		     shared box is where every other named control already says it. -->
			<span class="media-strip__pending-name" title={media.pendingName}>{media.pendingName}</span>
			<button
				type="button"
				class="button media-strip__reconnect"
				aria-label={media.busy ? `Loading… ${media.pendingName}` : pendingLabel}
				aria-busy={media.busy}
				onclick={() => void media.reconnect()}
				disabled={media.busy}
				aria-keyshortcuts="Escape"
				{@attach describeControl(() =>
					pendingLabel ? { label: pendingLabel, shortcut: 'Esc' } : undefined
				)}
			>
				{#if media.busy}
					<LoadingMark />
				{:else}
					<PlayIcon aria-hidden="true" size={16} weight="fill" />
				{/if}
				{media.busy
					? 'Loading…'
					: media.pendingSource === 'file'
						? 'Reconnect audio'
						: 'Load audio'}
			</button>
		{/if}
	</div>
</div>

<style>
	/*
		The row scrolls sideways rather than dropping controls off its end. Every
		control here is `flex: none` on purpose (a transport glyph that shrank would
		stop being aimable), so in a narrow window the sync button, the track's name
		and the detach control simply left the strip, silently, clipped by the editor
		column. There is no second place any of them appear. Scrolling keeps the row
		one line tall, which is what the strip is worth, and keeps every control
		reachable. The bar itself is hidden: it would draw a permanent grey rule
		across the shortest row in the window for an overflow that only happens at
		the narrowest widths.
	*/
	.media-strip__controls {
		display: flex;
		min-height: var(--control-height-lg);
		/* Let the outer controls' shadow rings clear the scrollport without moving them. */
		margin-inline: calc(-1 * var(--space-0-5));
		padding-inline: var(--space-0-5);
		overflow-x: auto;
		scrollbar-width: thin;
		gap: var(--space-3);
		align-items: center;
	}

	/* Animate the whole player so catalogue identity and attribution arrive with
	   playback, including the wide layout where artwork uses display: contents.
	   Playback ticks do not restart the entrance; layout height stays unchanged. */
	@media (prefers-reduced-motion: no-preference) {
		.media-strip[data-loaded='true'] {
			animation: media-strip-arrive var(--duration-slow) var(--ease-out-quart);
		}
	}

	@keyframes media-strip-arrive {
		from {
			translate: 0 var(--space-2);
		}
		to {
			translate: 0 0;
		}
	}

	/* Identity and controls share a surface; the cover remains an artwork action. */
	.media-strip :global(.media-artwork) {
		--media-thumb: var(--control-height-lg);
		padding: var(--space-1) 0 var(--space-2);
		background: transparent;
	}

	/* Two compact caption lines, aligned to the transport rather than body prose. */
	.media-strip :global(.media-artwork__meta) {
		gap: 0;
		line-height: var(--line-height-tight);
	}

	.media-strip :global(.media-artwork__title),
	.media-strip :global(.media-artwork__artist) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* The pending row is the song at one end and its one command at the other: the
	   name holds the start while the Load control takes the far end, so the action
	   keeps a stable home instead of sliding with the length of the song's name. */
	.media-strip__pending-name {
		flex: 0 1 auto;
		min-width: 0;
		max-width: var(--measure-prose);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-text);
		font-size: var(--font-size-sm);
	}

	.media-strip__transport,
	.media-strip__meta {
		display: flex;
		flex: none;
		min-width: 0;
		gap: var(--space-1);
		align-items: center;
	}

	.media-strip__meta {
		gap: var(--space-2);
	}

	/* Tabular so the elapsed readout does not shuffle its neighbours every tick. */
	.media-strip__time {
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.media-strip__name {
		max-width: 14rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/*
	 * The one bordered control in the row, and it earns the step up.
	 *
	 * Set quiet, it was a word in the same muted type as the readouts either side of
	 * it, in the shortest row in the window: the entry point to a whole mode,
	 * indistinguishable from the track's name. Everything else here is a transport
	 * glyph the user already knows how to find or a number they read; this is the
	 * only thing in the strip that starts something, so it is the only thing in the
	 * strip drawn as a command.
	 *
	 * Bordered rather than contrast: the tier above belongs to a surface's primary
	 * action, and the primary thing this row does is play and pause. A white button
	 * beside the transport would compete for attention on every glance with the
	 * controls used constantly, for the sake of one pressed once per song.
	 */
	.media-strip__sync {
		display: inline-flex;
		flex: none;
		min-height: var(--control-height-sm);
		padding: 0 var(--space-2);
		gap: var(--space-1-5);
		align-items: center;
		font-size: var(--font-size-xs);
		white-space: nowrap;
	}

	.media-strip__sync :global(svg) {
		flex: none;
		color: var(--color-text-muted);
	}

	.media-strip__sync:hover :global(svg) {
		color: var(--color-text);
	}

	/* The tap and the way out, in the slot the file name gives up while a run is
	   under way. The tap is bordered like the sync control beside it: both are
	   commands rather than readouts, and the row's contrast tier belongs to play.
	   Its width is the pointer's business; see the coarse-pointer block below. */
	.media-strip__tap {
		flex: none;
		white-space: nowrap;
	}

	/* The skip past already-timed lines, drawn only while a run has somewhere to
	   skip to. It sits before the tap so the tap keeps its place next to the hint
	   (the coarse-pointer block below hides `Esc stops` off that adjacency), and it
	   never takes the row's slack: the control found without looking is the tap,
	   not this one. */
	.media-strip__skip {
		flex: none;
		white-space: nowrap;
	}

	.media-strip__hint {
		white-space: nowrap;
	}

	.media-strip__error {
		flex: 1 1 auto;
		margin: 0;
		color: var(--color-danger);
	}

	/*
	 * The scrubber takes the slack between the two ends, which is what keeps the
	 * strip from being one control marooned in half a row of empty gutter.
	 *
	 * It has to opt out of the shared `input` silhouette in controls.css (a range
	 * with a border, a fill and a 2rem min-height draws a box around a track), so
	 * every one of those is reset here rather than weakened there.
	 *
	 * It is drawn rather than left to `accent-color`, because the browser's stock
	 * range is the one dated control in the most-operated row of the window: a
	 * thick track, no elapsed side, and a thumb sized for a settings page. The
	 * drawn one is the transport idiom every player has taught (a thin track, the
	 * played half filled in accent, a round thumb that grows under the pointer),
	 * and the fill's stop is `--seek-fill`, fed by the component from the same
	 * `currentTime` mirror the readouts print. The input's own box stays a full
	 * control height, so the thin track costs nothing in aimability.
	 */
	.media-strip__seek {
		min-width: 6rem;
		min-height: 0;
		height: var(--control-height-sm);
		flex: 1 1 auto;
		padding: 0;
		border: none;
		box-shadow: none;
		background: transparent;
		appearance: none;
		cursor: pointer;
	}

	.media-strip__seek:hover:not(:disabled) {
		border: none;
		background: transparent;
	}

	/* WebKit has no progress pseudo-element, so the played half is a hard-stop
	   gradient. Firefox gets the honest pseudo below. */
	.media-strip__seek::-webkit-slider-runnable-track {
		height: var(--space-1);
		border-radius: var(--radius-pill);
		background: linear-gradient(
			to right,
			var(--color-accent) var(--seek-fill, 0%),
			var(--color-fill-strong) var(--seek-fill, 0%)
		);
	}

	/* The thumb centers on the thin track by its own arithmetic: WebKit positions
	   it against the track's top edge, so half the height difference pulls it up. */
	.media-strip__seek::-webkit-slider-thumb {
		width: var(--space-3);
		height: var(--space-3);
		margin-top: calc((var(--space-1) - var(--space-3)) / 2);
		border: none;
		border-radius: var(--radius-round);
		background: var(--color-accent);
		appearance: none;
	}

	.media-strip__seek::-moz-range-track {
		height: var(--space-1);
		border-radius: var(--radius-pill);
		background: var(--color-fill-strong);
	}

	.media-strip__seek::-moz-range-progress {
		height: var(--space-1);
		border-radius: var(--radius-pill);
		background: var(--color-accent);
	}

	.media-strip__seek::-moz-range-thumb {
		width: var(--space-3);
		height: var(--space-3);
		border: none;
		border-radius: var(--radius-round);
		background: var(--color-accent);
	}

	/* The grown thumb is the scrubber answering the pointer that is about to drag
	   it: hover, the drag itself, and keyboard focus all mean the same aim. The
	   growth is a transform, so nothing in the row reflows under the pointer. */
	.media-strip__seek:hover:not(:disabled)::-webkit-slider-thumb,
	.media-strip__seek:active:not(:disabled)::-webkit-slider-thumb,
	.media-strip__seek:focus-visible::-webkit-slider-thumb {
		transform: scale(1.3);
	}

	.media-strip__seek:hover:not(:disabled)::-moz-range-thumb,
	.media-strip__seek:active:not(:disabled)::-moz-range-thumb,
	.media-strip__seek:focus-visible::-moz-range-thumb {
		transform: scale(1.3);
	}

	@media (prefers-reduced-motion: no-preference) {
		.media-strip__seek::-webkit-slider-thumb {
			transition: transform var(--duration-fast) var(--ease-out-quart);
		}

		.media-strip__seek::-moz-range-thumb {
			transition: transform var(--duration-fast) var(--ease-out-quart);
		}
	}

	/* Disabled is a real color and a real cursor, never opacity: the track has to
	   stay legible while the browser is still reading the file's duration. */
	.media-strip__seek:disabled {
		background: transparent;
		cursor: default;
	}

	.media-strip__seek:disabled::-webkit-slider-runnable-track {
		background: var(--color-fill);
	}

	.media-strip__seek:disabled::-webkit-slider-thumb {
		background: var(--color-control-disabled);
	}

	.media-strip__seek:disabled::-moz-range-track {
		background: var(--color-fill);
	}

	.media-strip__seek:disabled::-moz-range-thumb {
		background: var(--color-control-disabled);
	}

	/* No indicator glyph: the number is the control, and a chevron beside four
	   characters of muted type is a second mark for the press the pointer is
	   already on. */
	.media-strip__rate select {
		appearance: none;
		/* A select is otherwise as wide as `0.75×` in every state, including the
		   `1×` it sits at nearly always. */
		field-sizing: content;
		min-height: var(--control-height-sm);
		padding: 0 var(--space-1);
		border-color: transparent;
		background: transparent;
		box-shadow: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-variant-numeric: tabular-nums;
	}

	.media-strip__rate select:hover:not(:disabled) {
		background: var(--color-control-hover);
		color: var(--color-text);
	}

	.media-strip__reconnect {
		flex: none;
		margin-inline-start: auto;
		min-height: var(--control-height-md);
		font-size: var(--font-size-sm);
	}

	/* `:root .button` in responsive-shared.css steps every button up to `lg` at
	   this width. Scoped, the two heights above would outrank it, so the step is
	   restated here to keep it. */
	@media (max-width: 46rem) {
		.media-strip__sync,
		.media-strip__reconnect {
			min-height: var(--control-height-lg);
		}
	}

	/* Global because the artwork dialog's close control, rendered by MediaArtwork
	   inside this row, wears the same size. */
	.media-strip :global(.icon-button) {
		width: var(--control-height-sm);
		min-height: var(--control-height-sm);
		color: var(--color-text);
	}

	/* A wide editor can keep identity and playback on the same baseline. Narrower
	   layouts keep the two rows, preserving useful seek width and source marks. */
	@media (min-width: 90rem) {
		.media-strip:has(> :global(.media-artwork)) {
			display: grid;
			grid-template-columns: auto fit-content(12rem) minmax(0, 1fr) auto;
			gap: var(--space-3);
			align-items: center;
		}

		.media-strip :global(.media-artwork) {
			--media-thumb: var(--control-height-md);
			display: contents;
			padding: 0;
			gap: var(--space-2);
		}

		.media-strip:has(> :global(.media-artwork)) > .media-strip__controls {
			grid-column: 3;
			grid-row: 1;
			min-width: 0;
		}

		.media-strip :global(.media-artwork__thumb) {
			grid-column: 1;
			grid-row: 1;
		}

		.media-strip :global(.media-artwork__identity) {
			grid-column: 2;
			grid-row: 1;
		}

		.media-strip :global(.media-artwork__aside) {
			grid-column: 4;
			grid-row: 1;
		}
	}

	/* Waiting is a small action group, not a bar stretched across the document.
	   Pending and loaded controls use the same row height and outer spacing.
	   Keep the pending button's shadow clear of the scrolling row's edges. */
	.media-strip:not(:has(.media-strip__transport)) .media-strip__controls {
		justify-content: flex-start;
		padding-block: var(--space-0-5);
	}

	/* Keep the temporary cancel beside the endpoint control, without a second surface. */
	.media-strip__loop {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex: none;
	}

	.media-strip__options,
	.media-strip__timing,
	.media-strip__source {
		display: contents;
	}

	/* Audio details expand in the existing strip; playback keeps its own row. */
	.media-strip__disclosure {
		display: none;
	}

	@media (pointer: coarse) and (max-width: 46rem) {
		.media-strip .media-strip__controls {
			min-height: var(--control-height-touch);
			flex-wrap: wrap;
			gap: var(--space-1);
		}

		.media-strip .media-strip__disclosure {
			display: inline-flex;
			flex: none;
			gap: var(--space-1);
			padding-inline: var(--space-1);
		}

		.media-strip[data-details-open='false'] > :global(.media-artwork),
		.media-strip[data-details-open='false'] .media-strip__meta {
			display: none;
		}

		.media-strip .media-strip__meta {
			flex: 1 0 100%;
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-1);
			padding-block: var(--space-1);
		}

		.media-strip .media-strip__duration,
		.media-strip .media-strip__hint {
			display: none;
		}

		.media-strip__options,
		.media-strip__timing,
		.media-strip__source {
			display: flex;
			align-items: center;
			gap: var(--space-2);
			min-width: 0;
		}

		.media-strip__options {
			justify-content: space-between;
		}

		.media-strip__timing {
			flex-wrap: wrap;
		}

		.media-strip__timing:empty {
			display: none;
		}

		.media-strip .media-strip__sync,
		.media-strip .media-strip__tap {
			flex: 1 1 auto;
			justify-content: center;
		}

		.media-strip .media-strip__skip {
			order: 1;
			flex-basis: 100%;
		}

		.media-strip .media-strip__seek {
			min-width: 0;
			width: 0;
			height: var(--control-height-touch);
		}
	}

	/* The most-pressed controls in the workbench, at a size a finger can aim. Every
	   button already steps up on a coarse pointer, but the scoped sizes in this row
	   and MediaTransport would outrank that, and a tablet in landscape is a coarse
	   pointer at a wide layout. The key is the pointer, not the width.

	   It costs the strip the height the phone layout already spends, which is what
	   `publishStripHeight` measures and republishes rather than assuming. The
	   desktop measurement `MediaStrip.svelte.test.ts` makes is untouched: that
	   suite runs on a fine pointer, where this block does not apply.

	   Global parts reach the transport glyphs (MediaTransport) and the artwork
	   dialog's controls (MediaArtwork, ArtworkActions) inside this row. */
	@media (pointer: coarse) {
		.media-strip :global(.media-strip__transport-button),
		.media-strip :global(.icon-button),
		.media-strip :global(.button),
		.media-strip :global(.button--quiet),
		.media-strip .media-strip__rate select {
			min-width: var(--control-height-touch);
			min-height: var(--control-height-touch);
		}

		.media-strip .media-strip__rate select {
			font-size: var(--font-size-lg);
		}
	}

	@media (pointer: coarse) {
		/* The one control in the window that is pressed in rhythm, on the one pointer
		   that cannot use the key it stands in for. It takes the row's slack so it can
		   be found without looking away from the lyric, which is also why the hint
		   beside it goes: a target this wide has nothing to share the slot with, and
		   `Esc` is not a key this device has. */
		.media-strip__tap {
			flex: 1 1 auto;
		}

		.media-strip__tap + .media-strip__hint {
			display: none;
		}
	}

	@media (pointer: fine) and (max-width: 40rem) {
		.media-strip__controls {
			flex-wrap: wrap;
			gap: var(--space-2);
		}

		.media-strip__meta {
			flex: 1 0 100%;
			overflow-x: auto;
			padding-bottom: var(--space-1);
		}

		.media-strip__seek {
			min-width: 0;
			width: 0;
		}
	}
</style>
