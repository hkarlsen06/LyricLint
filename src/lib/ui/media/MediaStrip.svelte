<script lang="ts">
	import { formatTime } from '../state/media-player.svelte.js';
	import type { MediaStore } from '../state/media-store.svelte.js';

	/**
	 * Timing the whole lyric, which is a transport activity and therefore lives in
	 * the transport. Optional because the editor owns the mode and a strip rendered
	 * without one — the tests do this — has nothing to toggle.
	 */
	interface LyricSyncControl {
		readonly active: boolean;
		toggle(): void;
	}

	let { media, sync }: { media: MediaStore; sync?: LyricSyncControl } = $props();

	const player = $derived(media.player);

	// NaN until the browser has read the file's metadata, and a scrubber with no
	// range is a control that cannot be aimed — so it waits rather than pretending
	// to span a second.
	const seekable = $derived(Number.isFinite(player.duration) && player.duration > 0);

	// The waiting control says which of the two questions it is asking. A file
	// wants a gesture the browser insists on; a video wants this session's consent
	// to load Google's player, and a control that did not say so would spend it
	// without asking.
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
<div class="media-strip" data-testid="media-strip">
	{#if player.attached}
		<div class="media-strip__transport">
			<button
				type="button"
				class="button--quiet icon-button"
				onclick={() => player.transport('back')}
				aria-label="Back 3 seconds"
				title="Back 3 seconds (Ctrl+Alt+J)"
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
			</button>

			<button
				type="button"
				class="button--quiet icon-button"
				onclick={() => player.transport('toggle')}
				aria-label={player.playing ? 'Pause' : 'Play'}
				title={player.playing ? 'Pause (Ctrl+Alt+K)' : 'Play (Ctrl+Alt+K)'}
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
			</button>

			<button
				type="button"
				class="button--quiet icon-button"
				onclick={() => player.transport('forward')}
				aria-label="Forward 3 seconds"
				title="Forward 3 seconds (Ctrl+Alt+L)"
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
			{#if sync}
				<button
					type="button"
					class="button media-strip__sync"
					title={sync.active
						? 'Stop timing and go back to editing'
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
						<circle cx="8" cy="9.25" r="5.25" />
						<path d="M8 6.75v2.5h2M6.25 1.75h3.5" />
					</svg>
					<span>{sync.active ? 'Stop syncing' : 'Sync lyrics'}</span>
				</button>
			{/if}

			{#if sync?.active}
				<span class="media-strip__hint">Tap Space as each line starts · Esc stops</span>
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
