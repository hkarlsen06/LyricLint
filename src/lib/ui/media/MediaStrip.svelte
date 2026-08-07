<script lang="ts">
	import { drawsCoverBand, formatTime } from '../state/media-player.svelte.js';
	import type { MediaStore } from '../state/media-store.svelte.js';
	import MediaTransport from './MediaTransport.svelte';
	import MediaAttribution from './MediaAttribution.svelte';

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

	// NaN until the browser has read the file's metadata, and a scrubber with no
	// range is a control that cannot be aimed — so it waits rather than pretending
	// to span a second.
	const seekable = $derived(Number.isFinite(player.duration) && player.duration > 0);

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

	/**
	 * Publish this row's height, so a toast can clear it.
	 *
	 * The toast region is `position: fixed`, centred on the window, and mounted by
	 * the app layout — nowhere near this element in the tree — so nothing in CSS
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
	 * On `<html>`, beside `--keyboard-top`, and removed on teardown — a height left
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
		media.pendingSource === 'youtube'
			? `Load ${media.pendingName} from YouTube`
			: media.pendingSource === 'spotify'
				? `Load ${media.pendingName} from Spotify`
				: media.pendingSource === 'apple'
					? `Load ${media.pendingName} from Apple Music`
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
<div class="media-strip" data-testid="media-strip" {@attach keepFocus} {@attach publishStripHeight}>
	{#if player.attached}
		<div class="media-strip__transport">
			<MediaTransport {player} />

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
			<!-- The value is clamped to the range that exists, and it is the same
			     `seekable` the range is drawn from rather than a second condition.
			     A restored position is reported the moment a draft opens, before the
			     metadata that says how long the song is — so an unclamped `112` was
			     handed to an element still spanning one second, the browser clamped
			     the DOM value to 1, and Svelte never pushed it again because
			     `currentTime` had not changed since the value it cached. The thumb
			     stayed at 1/161 beside a readout printing 1:52. -->
			<input
				class="media-strip__seek"
				type="range"
				min="0"
				max={seekable ? player.duration : 1}
				step="0.05"
				value={seekable ? Math.min(player.currentTime, player.duration) : 0}
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
				<!--
					The name and the mark are said once, and both are said wherever the song
					is being shown: on the artwork band's own bar for a source that has one,
					here for a source that does not.

					**The condition is the source kind and not `player.artwork`, which is the
					bug this replaces.** A catalogue source is named before its cover arrives —
					the read that fetches one is a round trip behind the attach — so keying on
					the picture put the title and the badge in this row for as long as that
					took and then moved them to the band underneath. What the user sees is the
					name flashing into the shortest row in the window and leaving again, which
					reads as a glitch rather than as a hand-off. Where a band is coming, this
					row never draws them at all.
				-->
				{#if !drawsCoverBand(player.sourceKind)}
					<span class="media-strip__name" title={player.name}>{player.name}</span>
					<MediaAttribution {media} />
				{/if}
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
