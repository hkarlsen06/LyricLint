<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import type { MediaStore } from '../state/media-store.svelte.js';
	import type { SpotifySearchResult } from '../state/media-spotify.js';
	import type { AppleMusicSearchResult } from '../state/media-apple.js';
	import { formatTime } from '../state/media-player.svelte.js';
	import { youtubeSearchTerm } from '../state/media-youtube.js';
	import { DEFAULT_DRAFT_TITLE } from '$lib/persistence/draft-repository.js';
	import LoadingMark from '../primitives/LoadingMark.svelte';

	let {
		media,
		draftTitle,
		queries,
		resumedQuery,
		onClose,
		active
	}: {
		media: MediaStore;
		draftTitle?: string;
		queries: { spotify: string; apple: string };
		resumedQuery?: string;
		onClose: () => void;
		active: () => boolean;
	} = $props();

	/**
	 * What this song is called, in the order the names are worth searching for.
	 *
	 * The draft's own title leads because it is the one a person chose — and for
	 * a file it is *already* the cleaned filename, since attaching names an
	 * untitled draft after its source. The placeholder title is not a name, so it
	 * is skipped rather than searched for; a remembered attachment counts, because
	 * a draft waiting on a press still knows what it is waiting for.
	 */
	const searchName = $derived.by(() => {
		const named =
			(draftTitle?.trim() === DEFAULT_DRAFT_TITLE ? undefined : draftTitle?.trim()) ||
			media.player.name ||
			media.pendingName;
		return named === undefined ? undefined : youtubeSearchTerm(named);
	});

	let urlInput = $state<HTMLInputElement>();
	let url = $state(untrack(() => (media.videoId ? `https://youtu.be/${media.videoId}` : '')));
	// One message per answer rather than one for the dialog: a refusal belongs
	// under the field that caused it, and a shared slot would print a Spotify
	// error under a YouTube link the user is still looking at.
	let error = $state<string | undefined>(undefined);
	let trackError = $state<string | undefined>(undefined);
	let results = $state<SpotifySearchResult[]>([]);
	let searched = $state(false);
	let songError = $state<string | undefined>(undefined);
	let songResults = $state<AppleMusicSearchResult[]>([]);
	let songSearched = $state(false);

	/**
	 * Two waits with nothing on screen, and they are the two slowest things here.
	 *
	 * A search is a round trip to a catalogue and an attach is a script, a
	 * sign-in and a queue — and both used to leave the dialog looking exactly as
	 * it did before the press. `media.busy` covers the attach but is not enough on
	 * its own: it disables controls, which reads as the dialog having gone dead
	 * rather than as work being done, and it says nothing about *which* row was
	 * pressed. So the search holds its own flag and the attach remembers the id it
	 * is attaching, which is what lets the loading mark appear on the row the user
	 * actually aimed at.
	 */
	let searching = $state(false);
	let songSearching = $state(false);
	let attachingId = $state<string | undefined>(undefined);

	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});

	// An attachment started in an earlier opening must not dismiss its successor.
	function close(): void {
		if (!disposed && active()) onClose();
	}

	onMount(() => {
		if (disposed || !active()) return;
		urlInput?.select();
		if (resumedQuery !== undefined) {
			queries.spotify = resumedQuery;
			void runSearch();
		}
	});

	async function chooseFile(): Promise<void> {
		if (await media.attach()) close();
	}

	// Detaching answers the dialog's one question with "nowhere", so the
	// dialog's work is as done as it is after any attach.
	async function detach(): Promise<void> {
		await media.detach();
		close();
	}

	async function useVideo(): Promise<void> {
		error = await media.attachYouTube(url);
		if (error === undefined) close();
	}

	/**
	 * Search, or attach outright when what was typed turns out to be a link.
	 *
	 * `{ attached: true }` names a successful attachment explicitly. Existing
	 * player state cannot tell whether this request attached or only searched.
	 * `searched` is what tells the empty list from the state
	 * before anything was asked, so "No matches" cannot greet a user who has not
	 * typed anything yet.
	 */
	async function runSearch(): Promise<void> {
		trackError = undefined;
		searching = true;
		let outcome;
		try {
			outcome = await media.searchSpotify(queries.spotify);
		} finally {
			// `finally`, because a refusal has to give the field back as surely as an
			// answer does — a loading mark left moving over a dead request is worse than
			// the silence this replaced.
			searching = false;
		}

		if ('signingIn' in outcome) return;
		if ('error' in outcome) {
			trackError = outcome.error;
			return;
		}
		// A pasted link attaches inside the store, so the dialog's work is done.
		if ('attached' in outcome) {
			close();
			return;
		}
		results = outcome.results;
		searched = true;
	}

	async function useResult(track: SpotifySearchResult): Promise<void> {
		attachingId = track.trackId;
		let message;
		try {
			message = await media.attachSpotifyTrack(track.trackId, track.name);
		} finally {
			attachingId = undefined;
		}
		// A refusal keeps the dialog open and says so. Closing on one — which is
		// what a method answering `undefined` for both outcomes bought — is the
		// dialog reporting an attachment it did not make.
		if (message !== undefined) {
			trackError = message;
			return;
		}
		close();
	}

	/**
	 * The same two gestures at the same field, one source over.
	 *
	 * Simpler than the Spotify path because nothing here can be interrupted: the
	 * catalogue answers to the build's own token, so a search never leaves the
	 * page and there is no `signingIn` outcome to render nothing for.
	 */
	async function runSongSearch(): Promise<void> {
		songError = undefined;
		songSearching = true;
		let outcome;
		try {
			outcome = await media.searchAppleMusic(queries.apple);
		} finally {
			songSearching = false;
		}

		if ('error' in outcome) {
			songError = outcome.error;
			return;
		}
		// A pasted link attaches inside the store, so the dialog's work is done.
		if ('attached' in outcome) {
			close();
			return;
		}
		songResults = outcome.results;
		songSearched = true;
	}

	async function useSong(song: AppleMusicSearchResult): Promise<void> {
		attachingId = song.songId;
		let message;
		try {
			message = await media.attachAppleMusicSong(song.songId, song.name);
		} finally {
			attachingId = undefined;
		}
		if (message !== undefined) {
			songError = message;
			return;
		}
		close();
	}
</script>

<div class="media-dialog__body">
	<section>
		<form
			class="media-dialog__url"
			onsubmit={(event) => {
				event.preventDefault();
				void useVideo();
			}}
		>
			<input
				bind:this={urlInput}
				bind:value={url}
				type="url"
				placeholder="youtube.com/watch?v=…"
				aria-label="YouTube link"
				autocomplete="off"
				spellcheck="false"
			/>
			<button type="submit" class="button" disabled={media.busy || url.trim() === ''}>
				Use video
			</button>
		</form>
		<!-- The trade, stated before the press that spends it, as facts rather
				     than as prose or a tinted warning box. -->
		<p class="media-dialog__meta">
			Google can theoretically see what you play · Needs internet · Asked once a session
		</p>
		<!--
					The way in for somebody who has the song but not its link, which is
					most people opening this section: the search runs on Google's own
					page, prefilled with what this draft is already called, and the result
					they pick comes back to the field above as a paste.

					It is a link and not a lookup because neither lookup exists. Resolving
					a name to a video needs the Data API, whose quota is a hundred
					searches a day for the whole build behind a key inlined in the bundle;
					and Odesli, the keyless alternative, returns no YouTube link for an
					Apple or Spotify id at all. A search the user runs themselves costs
					nobody a quota and asks this application to guess at nothing.

					It draws only where there is something to search for, so an untitled
					draft with nothing attached is offered no empty query.
				-->
		{#if searchName}
			<p class="media-dialog__meta">
				No link? <a
					href={`https://www.youtube.com/results?search_query=${encodeURIComponent(searchName)}`}
					target="_blank"
					rel="noopener noreferrer"
				>
					Search YouTube for “{searchName}”
				</a>
			</p>
		{/if}
		<div aria-live="polite">
			{#if error}
				<p class="media-dialog__error">{error}</p>
			{/if}
		</div>
	</section>

	{#if media.appleMusicAvailable}
		<section>
			<!--
						One field again, and the sign-in is deliberately *not* here: Apple's
						catalogue answers to this build's own developer token, so a user can
						find their song before being asked for an account. Only the press on
						a result spends one.
					-->
			<form
				class="media-dialog__url"
				onsubmit={(event) => {
					event.preventDefault();
					void runSongSearch();
				}}
			>
				<input
					bind:value={queries.apple}
					type="search"
					placeholder="Search Apple Music, or paste a link"
					aria-label="Apple Music search"
					autocomplete="off"
					spellcheck="false"
				/>
				<!-- The label stays put and a loading mark joins it, rather than the
						     word swapping to `Searching…`: a control whose text changes
						     under the press reflows the row it is in, and this one sits
						     beside a field the user may still be typing into. -->
				<button
					type="submit"
					class="button media-dialog__search"
					disabled={media.busy || songSearching || queries.apple.trim() === ''}
					aria-busy={songSearching}
				>
					{#if songSearching}
						<LoadingMark />
					{/if}
					Search
				</button>
			</form>

			{#if songResults.length > 0}
				<ul class="media-dialog__results">
					{#each songResults as song (song.songId)}
						<li>
							<button
								type="button"
								class="media-dialog__result"
								disabled={media.busy}
								aria-busy={attachingId === song.songId}
								onclick={() => void useSong(song)}
							>
								<span class="media-dialog__result-name">{song.name}</span>
								<!-- The wait takes the duration's slot rather than adding
										     anything, so the row keeps its shape — and it is on the
										     row the user aimed at, which is the thing `media.busy`
										     alone could never say. -->
								<span class="media-dialog__result-time">
									{#if attachingId === song.songId}
										<LoadingMark />
									{:else}
										{formatTime(song.durationSeconds)}
									{/if}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<!--
						Every outcome of a search, in one region and one at a time.

						The results are an ordinary list and `No matches` was ordinary
						prose, so the only thing this section ever announced was an error —
						a search that answered, or answered with nothing, was silent to a
						screen reader and the field simply sat there. Both are now what the
						region says, and the count is `sr-only` because the rows underneath
						are the sighted answer to it.

						One region rather than two, or an error and a count can speak over
						each other; the branches are exclusive for the same reason. It sits
						above the facts line so the no-matches message keeps the place it
						had, directly under the field it answers.
					-->
			<div aria-live="polite">
				{#if songError}
					<p class="media-dialog__error">{songError}</p>
				{:else if songResults.length > 0}
					<p class="sr-only">
						{songResults.length === 1
							? '1 match on Apple Music.'
							: `${songResults.length} matches on Apple Music.`}
					</p>
				{:else if songSearched && queries.apple.trim() !== ''}
					<p class="media-dialog__meta">No matches on Apple Music.</p>
				{/if}
			</div>
			<!-- Two facts, and no third about the speed control: this source keeps
					     it, so there is nothing to warn about — the same reason the file
					     row says nothing about rates either. -->
			<!-- Not "Signs in with Apple", which is the name of a different Apple
					     technology with its own branding rules — MusicKit's `authorize()`
					     is an Apple Music authorization and nothing to do with it. -->
			<p class="media-dialog__meta">Needs an Apple Music subscription · Sign-in required</p>
		</section>
	{/if}

	{#if media.spotifyAvailable}
		<section>
			<!--
						One field for two gestures. Typing a title searches; pasting a link
						attaches. They are the same aim at the same box, and splitting them
						into two controls would put a second row in a section that has room
						for one — and make the user classify their own input before they
						could start.
					-->
			<form
				class="media-dialog__url"
				onsubmit={(event) => {
					event.preventDefault();
					void runSearch();
				}}
			>
				<input
					bind:value={queries.spotify}
					type="search"
					placeholder="Search Spotify, or paste a link"
					aria-label="Spotify search"
					autocomplete="off"
					spellcheck="false"
				/>
				<button
					type="submit"
					class="button media-dialog__search"
					disabled={media.busy || searching || queries.spotify.trim() === ''}
					aria-busy={searching}
				>
					{#if searching}
						<LoadingMark />
					{/if}
					Search
				</button>
			</form>

			<!--
						Results are rows on the dialog, not a boxed list inside it: the
						dialog is already the surface, and a bordered panel here would be
						the card-inside-a-card the design rules exist to prevent. Each row
						carries something at both ends — the track at one, its length at the
						other — so no row is a label alone in half a gutter.
					-->
			{#if results.length > 0}
				<ul class="media-dialog__results">
					{#each results as track (track.trackId)}
						<li>
							<button
								type="button"
								class="media-dialog__result"
								disabled={media.busy}
								aria-busy={attachingId === track.trackId}
								onclick={() => void useResult(track)}
							>
								<span class="media-dialog__result-name">{track.name}</span>
								<span class="media-dialog__result-time">
									{#if attachingId === track.trackId}
										<LoadingMark />
									{:else}
										{formatTime(track.durationSeconds)}
									{/if}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<!-- The same one region, on the same rule as Apple's above. -->
			<div aria-live="polite">
				{#if trackError}
					<p class="media-dialog__error">{trackError}</p>
				{:else if results.length > 0}
					<p class="sr-only">
						{results.length === 1 ? '1 match on Spotify.' : `${results.length} matches on Spotify.`}
					</p>
				{:else if searched && queries.spotify.trim() !== ''}
					<p class="media-dialog__meta">No matches on Spotify.</p>
				{/if}
			</div>
			<!-- The three facts a press here actually costs. The rate one is not
					     a caveat buried in a sentence: Spotify exposes no playback-rate
					     control at any layer, so the transport's speed menu collapses to
					     1× for as long as a track is attached, and that is worth knowing
					     before the press rather than after it. -->
			<p class="media-dialog__meta">
				Needs Spotify Premium · Signs in with Spotify · No speed control
			</p>
		</section>
	{/if}

	<section>
		<button type="button" class="button" onclick={() => void chooseFile()} disabled={media.busy}>
			Choose a file…
		</button>
		<p class="media-dialog__meta">Plays from your disk · Nothing is uploaded</p>
	</section>

	<!--
				The way out, offered where the question is asked. This press used to be
				an X at the end of the transport row, where it was hit by accident more
				often than on purpose — a detach is a decision about what the draft's
				song is, so it belongs behind the same deliberate press every other
				answer here is. It draws only while there is something to detach, the
				rule every conditional answer above follows, and the facts under it say
				what the press does not cost: the timings live on the 'scribe, and no
				file is touched.
			-->
	{#if media.player.attached || media.pendingName}
		<section>
			<button type="button" class="button" onclick={() => void detach()} disabled={media.busy}>
				Detach {media.player.name ?? media.pendingName}
			</button>
			<p class="media-dialog__meta">
				Line timings stay on this 'scribe · Nothing is deleted from your disk
			</p>
		</section>
	{/if}
</div>

<style>
	.media-dialog__body {
		padding: var(--space-3) var(--space-5) var(--space-5);
	}

	/* Each source gets breathing room on the existing dialog surface. */
	.media-dialog__body section + section {
		margin-top: var(--space-5);
	}

	.media-dialog__meta {
		margin: var(--space-2) 0 0 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		line-height: var(--line-height-body);
	}

	.media-dialog__url {
		display: flex;
		gap: var(--space-2);
	}

	.media-dialog__url input {
		flex: 1 1 auto;
		min-width: 0;
	}

	.media-dialog__error {
		margin: var(--space-1) 0 0 0;
		color: var(--color-danger);
		font-size: var(--font-size-xs);
		line-height: var(--line-height-body);
	}

	/* Results share the quiet menu-row treatment, with space between targets. */
	.media-dialog__results {
		display: grid;
		gap: var(--space-1);
		margin: var(--space-3) 0 0 0;
		padding: 0;
		list-style: none;
	}

	.media-dialog__result {
		display: flex;
		width: 100%;
		min-height: var(--control-height-lg);
		padding: var(--space-2-5) var(--space-2);
		border-radius: var(--radius-control);
		gap: var(--space-3);
		align-items: baseline;
		justify-content: space-between;
		border: 0;
		background: none;
		color: var(--color-text);
		font: inherit;
		text-align: start;
		cursor: pointer;
	}

	.media-dialog__result:hover:not(:disabled),
	.media-dialog__result:focus-visible {
		background: var(--color-control-hover);
	}

	.media-dialog__result:disabled {
		color: var(--color-text-disabled);
		cursor: default;
	}

	.media-dialog__result-name {
		min-width: 0;
		font-size: var(--font-size-sm);
	}

	/*
	 * The duration's slot is also the row's wait, so it holds its own width: a
	 * loading mark replacing `3:43` must not reflow the name beside it.
	 */
	.media-dialog__result-time {
		display: inline-flex;
		flex: none;
		min-width: 3ch;
		align-items: center;
		justify-content: flex-end;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-variant-numeric: tabular-nums;
	}

	/*
	 * The search control, which is a word and sometimes a loading mark beside it.
	 *
	 * The label does not change under the press. `Search` becoming `Searching…` is
	 * the obvious version and it reflows the row every time — this one sits
	 * directly beside a field the user may still be typing into, and a control
	 * that resizes under the caret is worse than one that says less.
	 */
	.media-dialog__search {
		display: inline-flex;
		gap: var(--space-1-5);
		align-items: center;
	}
</style>
