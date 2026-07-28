<script lang="ts">
	import { tick } from 'svelte';
	import type { MediaStore } from '../state/media-store.svelte.js';
	import type { SpotifySearchResult } from '../state/media-spotify.js';
	import type { AppleMusicSearchResult } from '../state/media-apple.js';
	import { formatTime } from '../state/media-player.svelte.js';
	import { youtubeSearchTerm } from '../state/media-youtube.js';
	import { DEFAULT_DRAFT_TITLE } from '$lib/persistence/draft-repository.js';
	import LoadingMark from '../primitives/LoadingMark.svelte';

	let { media, draftTitle }: { media: MediaStore; draftTitle?: string } = $props();

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

	let dialog: HTMLDialogElement;
	let trigger: HTMLButtonElement;
	let urlInput: HTMLInputElement;
	let url = $state('');
	let query = $state('');
	// One message per answer rather than one for the dialog: a refusal belongs
	// under the field that caused it, and a shared slot would print a Spotify
	// error under a YouTube link the user is still looking at.
	let error = $state<string | undefined>(undefined);
	let trackError = $state<string | undefined>(undefined);
	let results = $state<SpotifySearchResult[]>([]);
	let searched = $state(false);
	let songQuery = $state('');
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

	// The slot never moves and the label follows the state, the way the toolbar's
	// one contrast action swaps between `Copy lyrics` and `Paste lyrics`. A
	// control that disappeared once audio was attached would take the only way to
	// swap tracks with it.
	const label = $derived(
		media.player.attached || media.pendingName ? 'Change audio source' : 'Add audio source'
	);

	// The link already in use, in the form worth having on a clipboard. A draft on
	// a video knows which one, so the field opens holding it — and holds it
	// selected, because the two things done to a link that is already there are
	// copying it out and typing over it, and a selection is the one state that
	// serves both without a clearing press first.
	async function open(): Promise<void> {
		url = media.videoId ? `https://youtu.be/${media.videoId}` : '';
		error = undefined;
		trackError = undefined;
		songError = undefined;
		results = [];
		songResults = [];
		searched = false;
		songSearched = false;
		// The press that pays for Apple's SDK, so that the press which signs in does
		// not have to. A sign-in pop-up is only allowed out of an activation the
		// browser can still see, and awaiting a 600KB script and its `configure()`
		// round trips spends one — see `prepareAppleMusic`. This is the earliest
		// press on the way to that one, and it is the surface that offers Apple
		// Music in the first place.
		media.prepareAppleMusic();
		dialog.showModal();
		await tick();
		urlInput.select();
	}

	// A sign-in interrupts whatever the user was searching for, and this is how
	// they get it back: the query rode across the redirect, and the picker reopens
	// on it and runs it. Reading the query clears it, so this fires once — an
	// effect that reopened a dialog on every render would be impossible to close.
	$effect(() => {
		const resumed = media.takeResumedQuery();
		if (resumed === undefined) return;
		void (async () => {
			await open();
			query = resumed;
			await runSearch();
		})();
	});

	function close(): void {
		dialog.close();
		trigger.focus();
	}

	// Escape and the close control hand focus back; an outside press does not,
	// because the press has already named where the user is going.
	function dismissOnBackdrop(event: MouseEvent): void {
		if (event.target === dialog) dialog.close();
	}

	async function chooseFile(): Promise<void> {
		if (await media.attach()) close();
	}

	async function useVideo(): Promise<void> {
		error = await media.attachYouTube(url);
		if (error === undefined) close();
	}

	/**
	 * Search, or attach outright when what was typed turns out to be a link.
	 *
	 * `{ results: [] }` therefore means two different things and both end the
	 * same way: nothing matched, or a pasted link attached and the dialog is
	 * already closing. `searched` is what tells the empty list from the state
	 * before anything was asked, so "No matches" cannot greet a user who has not
	 * typed anything yet.
	 */
	async function runSearch(): Promise<void> {
		trackError = undefined;
		searching = true;
		let outcome;
		try {
			outcome = await media.searchSpotify(query);
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
		if (media.player.sourceKind === 'spotify' && media.trackId !== undefined) {
			close();
			return;
		}
		results = outcome.results;
		searched = true;
	}

	async function useResult(track: SpotifySearchResult): Promise<void> {
		attachingId = track.trackId;
		try {
			await media.attachSpotifyTrack(track.trackId, track.name);
		} finally {
			attachingId = undefined;
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
			outcome = await media.searchAppleMusic(songQuery);
		} finally {
			songSearching = false;
		}

		if ('error' in outcome) {
			songError = outcome.error;
			return;
		}
		// A pasted link attaches inside the store, so the dialog's work is done.
		if (media.player.sourceKind === 'apple' && media.songId !== undefined) {
			close();
			return;
		}
		songResults = outcome.results;
		songSearched = true;
	}

	async function useSong(song: AppleMusicSearchResult): Promise<void> {
		attachingId = song.songId;
		try {
			await media.attachAppleMusicSong(song.songId, song.name);
		} finally {
			attachingId = undefined;
		}
		close();
	}
</script>

<button
	bind:this={trigger}
	type="button"
	class="button--quiet status-bar__media"
	aria-haspopup="dialog"
	onclick={open}
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
		<path d="M6 12.25V3.5l7-1.25v8.5" />
		<circle cx="4.25" cy="12.25" r="1.75" />
		<circle cx="11.25" cy="10.75" r="1.75" />
	</svg>
	<span>{label}</span>
</button>

<!--
	One question — where is the song? — asked in one place, with the answers
	stacked rather than scattered as commands the user has to tell apart in a list.
	It is a modal because it is a detour: nothing else in the workbench is worth
	doing until it is answered or abandoned.

	Two of the four are conditional, for the same reason and on different facts.
	Spotify draws only where the build has an app registered behind it
	(`PUBLIC_SPOTIFY_CLIENT_ID`), which production deliberately leaves unset.
	Apple Music draws only where the build's developer token is present *and in
	date* — it expires within six months, and a stale one has to stop being
	offered rather than start failing under a press. An answer that cannot be
	carried out is worse
	than one fewer answer — the same reason the rate control renders
	`availableRates` rather than the workbench's full offer.

	Neither answer is boxed. The dialog is already the surface, and giving each
	option a border would be two cards inside the card the user is looking at; a
	hairline between them is a separator, which is a different thing.

	YouTube is first because it is where most transcribers' audio already is.

	Each answer is a control and a line of facts under it, in the meta idiom the
	diagnostic card established — interpuncts, muted, small. It used to be a
	heading, a paragraph of prose, and then the control: two blocks of grey to
	read before either press, which read as a warning about the thing it was
	offering. A requirement stated as a specification reads as a specification;
	the same requirement spelled out in sentences reads as an apology for the
	button under it.
-->
<dialog
	bind:this={dialog}
	class="media-dialog"
	aria-labelledby="media-dialog-title"
	onclick={dismissOnBackdrop}
>
	<div class="media-dialog__surface">
		<div class="media-dialog__header">
			<h2 id="media-dialog-title">Add audio</h2>
			<button type="button" class="icon-button button--quiet" aria-label="Close" onclick={close}>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="16"
					height="16"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				>
					<path d="m4 4 8 8M12 4l-8 8" />
				</svg>
			</button>
		</div>

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
							bind:value={songQuery}
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
							disabled={media.busy || songSearching || songQuery.trim() === ''}
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
					{:else if songSearched && songQuery.trim() !== ''}
						<p class="media-dialog__meta">No matches on Apple Music.</p>
					{/if}
					<!-- Two facts, and no third about the speed control: this source keeps
					     it, so there is nothing to warn about — the same reason the file
					     row says nothing about rates either. -->
					<!-- Not "Signs in with Apple", which is the name of a different Apple
					     technology with its own branding rules — MusicKit's `authorize()`
					     is an Apple Music authorization and nothing to do with it. -->
					<p class="media-dialog__meta">Needs an Apple Music subscription · Sign-in required</p>
					<div aria-live="polite">
						{#if songError}
							<p class="media-dialog__error">{songError}</p>
						{/if}
					</div>
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
							bind:value={query}
							type="search"
							placeholder="Search Spotify, or paste a link"
							aria-label="Spotify search"
							autocomplete="off"
							spellcheck="false"
						/>
						<button
							type="submit"
							class="button media-dialog__search"
							disabled={media.busy || searching || query.trim() === ''}
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
					{:else if searched && query.trim() !== ''}
						<p class="media-dialog__meta">No matches on Spotify.</p>
					{/if}
					<!-- The three facts a press here actually costs. The rate one is not
					     a caveat buried in a sentence: Spotify exposes no playback-rate
					     control at any layer, so the transport's speed menu collapses to
					     1× for as long as a track is attached, and that is worth knowing
					     before the press rather than after it. -->
					<p class="media-dialog__meta">
						Needs Spotify Premium · Signs in with Spotify · No speed control
					</p>
					<div aria-live="polite">
						{#if trackError}
							<p class="media-dialog__error">{trackError}</p>
						{/if}
					</div>
				</section>
			{/if}

			<section>
				<button
					type="button"
					class="button"
					onclick={() => void chooseFile()}
					disabled={media.busy}
				>
					Choose a file…
				</button>
				<p class="media-dialog__meta">Plays from your disk · Nothing is uploaded</p>
			</section>
		</div>
	</div>
</dialog>

<style>
	/* Quiet enough to belong in the quietest row in the window, and still a
	   control: it keeps the row's small type but takes the body color, so it
	   reads as pressable beside the muted counts rather than as one of them. */
	.status-bar__media {
		display: inline-flex;
		min-height: var(--control-height-sm);
		padding: 0 var(--space-1-5);
		gap: var(--space-1-5);
		align-items: center;
		color: var(--color-text);
		font-size: var(--font-size-xs);
	}

	.status-bar__media svg {
		flex: none;
		color: var(--color-text-muted);
	}

	.status-bar__media:hover svg {
		color: var(--color-text);
	}

	.media-dialog {
		width: min(30rem, calc(100vw - var(--space-4)));
		max-width: none;
		padding: 0;
		border: var(--border-width) solid var(--color-border-strong);
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}

	.media-dialog::backdrop {
		background: var(--color-backdrop);
	}

	/* The title sits on the body rather than in a band of its own: a rule under a
	   header of this height is chrome around four lines of content. */
	.media-dialog__header {
		display: flex;
		padding: var(--space-3) var(--space-2) 0 var(--space-4);
		align-items: center;
		justify-content: space-between;
	}

	.media-dialog__header h2 {
		margin: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
	}

	.media-dialog__body {
		padding: var(--space-3) var(--space-4) var(--space-4);
	}

	/* The separator goes *between* the two answers, never above the first. */
	.media-dialog__body section + section {
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: var(--border-width) solid var(--color-border);
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

	/* A run of rows, the way the linter's findings are: no gap, no rounding, a
	   hairline between neighbours. Nothing here draws a box — the dialog is the
	   surface these sit on. */
	.media-dialog__results {
		margin: var(--space-2) 0 0 0;
		padding: 0;
		list-style: none;
	}

	.media-dialog__results li + li {
		border-top: var(--border-width) solid var(--color-border);
	}

	.media-dialog__result {
		display: flex;
		width: 100%;
		padding: var(--space-2) var(--space-1-5);
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

	.media-dialog__result:hover {
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
