<script lang="ts">
	import { formatTime } from '../state/media-player.svelte.js';
	import { transportModifier } from '../state/media-shortcuts.js';
	import type { MediaStore } from '../state/media-store.svelte.js';

	/**
	 * Timing the whole lyric, which is a transport activity and therefore lives in
	 * the transport. Optional because the editor owns the mode and a strip rendered
	 * without one — the tests do this — has nothing to toggle.
	 */
	interface LyricSyncControl {
		readonly active: boolean;
		/** Every line a run would tap already has a time. */
		readonly complete?: boolean;
		toggle(): void;
		/** One tap of a run. The same command `Space` runs — see `tapLyricSync`. */
		tap(): void;
	}

	/**
	 * Following the playhead. Shown only when the song has enough timed lines for
	 * a scroll to mean anything — one anchor scrolls nowhere.
	 */
	interface FollowControl {
		readonly available: boolean;
		readonly active: boolean;
		toggle(): void;
	}

	let {
		media,
		sync,
		follow
	}: { media: MediaStore; sync?: LyricSyncControl; follow?: FollowControl } = $props();

	const player = $derived(media.player);
	const fallbackModifier = transportModifier();
	const fallbackModifierKey = fallbackModifier === 'Control' ? '⌃' : fallbackModifier;

	// NaN until the browser has read the file's metadata, and a scrubber with no
	// range is a control that cannot be aimed — so it waits rather than pretending
	// to span a second.
	const seekable = $derived(Number.isFinite(player.duration) && player.duration > 0);

	// The waiting control says which of the two questions it is asking. A file
	// wants a gesture the browser insists on; a video wants this session's consent
	// to load Google's player, and a control that did not say so would spend it
	// without asking.
	// Once the song has timed lines the side keys step between them, so the
	// controls say so. A button labelled with a number of seconds it no longer
	// moves is worse than one with no number on it at all.
	const timed = $derived(player.cuePoints.length > 0);
	const backLabel = $derived(timed ? 'Previous line' : 'Back 2 seconds');
	const forwardLabel = $derived(timed ? 'Next line' : 'Forward 2 seconds');

	/**
	 * Keep the caret where the user put it.
	 *
	 * Focus moves on `mousedown`, so preventing its default is what stops a press
	 * here from taking focus off the document — and on a phone, focus leaving the
	 * document is the keyboard closing. The loop this row exists for is listen,
	 * pause, type: a pause that dismissed the keyboard would cost a tap to bring it
	 * back and a scroll to find the line again, every single time.
	 *
	 * Buttons only. A `<select>` and a `range` need their default press to open and
	 * to drag, so the rate control and the scrubber are left alone — they are also
	 * the two controls here that are aimed rather than tapped, where losing the
	 * keyboard is the smaller cost.
	 *
	 * `click` is not a default action of `mousedown` and still fires, so every
	 * control keeps working exactly as it did. This is the same move a rich-text
	 * toolbar makes for the same reason.
	 *
	 * An attachment rather than an inline handler because the row is a `<div>`: a
	 * mouse handler written on it is an interactive element with no role, and the
	 * honest answer is that the row is not interactive — its buttons are, and this
	 * listens on their behalf.
	 */
	function keepFocus(node: HTMLElement) {
		const onPress = (event: MouseEvent) => {
			if ((event.target as Element | null)?.closest('button')) event.preventDefault();
		};
		node.addEventListener('mousedown', onPress);
		return () => node.removeEventListener('mousedown', onPress);
	}

	const pendingLabel = $derived(
		media.pendingSource === 'youtube'
			? `Load ${media.pendingName} from YouTube`
			: `Reconnect ${media.pendingName}`
	);
</script>

<!--
	The audio transport, under the editor column and nowhere else.

	It is not a fourth panel tab, because tabs are exclusive and that would make
	the user choose between seeing diagnostics and controlling audio during the one
	activity where both are live. It is not a floating card either: this row lives
	for as long as a file is attached, and a persistent box over the document
	occludes the thing being transcribed.

	It draws nothing until there is something to control — the parent renders it
	only then. An empty transport is the same failure as a status bar full of
	zeroes: chrome reporting a state that could not have been otherwise.

	The controls are the same controls whichever source is attached, and this row
	holds all of them. A video's picture is not one of them and is not here: it
	draws at the foot of the right panel, where two hundred pixels cost a scroll
	through the findings rather than two hundred pixels off the document. Which
	source is attached shows in this row only in which rates the speed control
	offers.
-->
<div class="media-strip" data-testid="media-strip" {@attach keepFocus}>
	{#if player.attached}
		<div class="media-strip__transport">
			<button
				type="button"
				class="button button--quiet media-strip__transport-button"
				onclick={() => player.transport('back')}
				aria-label={backLabel}
				aria-keyshortcuts={`F7 ${fallbackModifier}+J Control+Alt+J`}
				title={`${backLabel} (F7 · ${fallbackModifier}+J)`}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M13 3.5v9L6.5 8Z" />
					<path d="M3.5 3.5v9" />
				</svg>
				<kbd class="media-strip__key" aria-hidden="true">{fallbackModifierKey}J</kbd>
			</button>

			<button
				type="button"
				class="button button--quiet media-strip__transport-button"
				onclick={() => player.transport('toggle')}
				aria-label={player.playing ? 'Pause' : 'Play'}
				aria-keyshortcuts={`F8 Space ${fallbackModifier}+K Control+Alt+K`}
				title={`${player.playing ? 'Pause' : 'Play'} (F8 · ${fallbackModifier}+K)`}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="14"
					height="14"
					fill="currentColor"
					stroke="none"
				>
					{#if player.playing}
						<path d="M4 3h2.6v10H4zM9.4 3H12v10H9.4z" />
					{:else}
						<path d="M4.5 2.8 13 8l-8.5 5.2Z" />
					{/if}
				</svg>
				<kbd class="media-strip__key" aria-hidden="true">{fallbackModifierKey}K</kbd>
			</button>

			<button
				type="button"
				class="button button--quiet media-strip__transport-button"
				onclick={() => player.transport('forward')}
				aria-label={forwardLabel}
				aria-keyshortcuts={`F9 ${fallbackModifier}+L Control+Alt+L`}
				title={`${forwardLabel} (F9 · ${fallbackModifier}+L)`}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M3 3.5v9L9.5 8Z" />
					<path d="M12.5 3.5v9" />
				</svg>
				<kbd class="media-strip__key" aria-hidden="true">{fallbackModifierKey}L</kbd>
			</button>

			<span class="media-strip__time" data-testid="media-elapsed">
				{formatTime(player.currentTime)}
			</span>
		</div>

		{#if player.error}
			<!-- Prose in the row it belongs to, not a tinted box that pops into
			     existence. The file is still named at the far end, so re-attaching
			     is one press away. -->
			<p class="media-strip__error">{player.error}</p>
		{:else}
			<input
				class="media-strip__seek"
				type="range"
				min="0"
				max={seekable ? player.duration : 1}
				step="0.05"
				value={player.currentTime}
				disabled={!seekable}
				aria-label="Seek"
				oninput={(event) => player.seek(event.currentTarget.valueAsNumber)}
			/>
		{/if}

		<div class="media-strip__meta">
			<span class="media-strip__time">{formatTime(player.duration)}</span>

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
				activity — you press play and tap along — and because this row only
				exists once there is something to tap along to.

				While a run is under way the slot beside it stops naming the file and
				states the two keys instead. That is the one thing a modal state owes
				the user: the document has quietly stopped taking typing, and a control
				reading `Stop syncing` explains that only to someone who already knows
				what syncing is.
			-->
			{#if follow?.available}
				<button
					type="button"
					class="button--quiet icon-button"
					aria-pressed={follow.active}
					aria-label="Follow the playing line"
					title={follow.active ? 'Stop following the playing line' : 'Follow the playing line'}
					onclick={follow.toggle}
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 16 16"
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M2.5 4h11M2.5 8h6M2.5 12h4" />
						{#if follow.active}<path d="M11.5 9.5v4M9.75 11.75 11.5 13.5l1.75-1.75" />{/if}
					</svg>
				</button>
			{/if}

			{#if sync}
				<!--
					A finished song says so rather than offering the job again, but it is
					still the same control and still one press: `runStart` reads a fully
					timed lyric as a fresh pass from the top, which is the only sensible
					reading of pressing sync on finished work. The checkmark is the state
					and the title is what the press does — a readout that could not be
					pressed would take away the only way to re-time a song.
				-->
				<button
					type="button"
					class="button media-strip__sync"
					title={sync.active
						? 'Stop timing and go back to editing'
						: sync.complete
							? 'Every line is timed. Play the song from the start and tap Space to time it again'
							: 'Play the song from the start and tap Space at each line to time it'}
					onclick={sync.toggle}
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 16 16"
						width="13"
						height="13"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						{#if !sync.active && sync.complete}
							<path d="M2.75 8.5 6.25 12l7-8" />
						{:else}
							<circle cx="8" cy="9.25" r="5.25" />
							<path d="M8 6.75v2.5h2M6.25 1.75h3.5" />
						{/if}
					</svg>
					<span>
						{sync.active ? 'Stop syncing' : sync.complete ? 'Lyrics synced' : 'Sync lyrics'}
					</span>
				</button>
			{/if}

			{#if sync?.active}
				<!--
					The tap itself, because a finger has no `Space`. It takes the slot the
					hint took — the run's instruction is now the thing you press, which is
					shorter to read and is the only way to drive a run on a phone.

					It is a control on every pointer rather than one that appears under a
					coarse one. The command is the same command, pressing it is a legitimate
					way to time a line with a mouse, and a button that exists only on some
					devices is one nobody documents and nobody tests. What the pointer
					changes is its width (`responsive.css`): under a finger it takes the
					row's slack, because a target tapped in rhythm has to be found without
					looking.

					`Space` and `Enter` both activate a focused button, and both are the
					run's own keys — so a press here leaves the keyboard path working
					exactly as it did, on the button instead of in the document.
				-->
				<button
					type="button"
					class="button media-strip__tap"
					aria-keyshortcuts="Space Enter"
					title="Time the line that is starting now"
					onclick={sync.tap}
				>
					Tap each line
				</button>
				<span class="media-strip__hint">Esc stops</span>
			{:else}
				<span class="media-strip__name" title={player.name}>{player.name}</span>
			{/if}

			<button
				type="button"
				class="button--quiet icon-button"
				onclick={() => void media.detach()}
				aria-label={`Detach ${player.name}`}
				title="Detach audio"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
				</svg>
			</button>
		</div>
	{:else if media.pendingName}
		<!--
			The draft remembers its audio but nothing may act on that without a
			press, so the row asks for one. The source is named in the button rather
			than in a sentence beside it: the name is what the press is about, and a
			label plus a generic "Reconnect" would be two controls' worth of words
			for one control.
		-->
		<button
			type="button"
			class="button button--quiet media-strip__reconnect"
			onclick={() => void media.reconnect()}
			disabled={media.busy}
		>
			{pendingLabel}
		</button>

		<button
			type="button"
			class="button--quiet icon-button"
			onclick={() => void media.detach()}
			aria-label={`Forget ${media.pendingName}`}
			title="Forget this audio"
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				width="14"
				height="14"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
			</svg>
		</button>
	{/if}
</div>
