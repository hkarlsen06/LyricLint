<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import type { TimedLyricsFormat } from '$lib/core/timed-lyrics.js';
	import { copyText, downloadImage } from '../clipboard.js';
	import SongFacts, { hasSongFacts } from '../media/SongFacts.svelte';
	import LoadingMark from '../primitives/LoadingMark.svelte';

	let { controller }: { controller: WorkbenchController } = $props();
	let confirmClearAnchors = $state(false);
	let savingArtwork = $state(false);
	let timedLyricsFormat = $state<TimedLyricsFormat>('lrc');

	const artwork = $derived(controller.media?.player.artwork);
	const details = $derived(controller.media?.player.songDetails);
	/**
	 * Whether any of the facts *this list draws* are known — the list's own
	 * predicate, so the section gate and the list cannot disagree. Artist and
	 * title are not asked for here, because the toolbar and the cover band both
	 * already say them.
	 */
	const listedFacts = $derived(hasSongFacts(details));
	/**
	 * The watch page for an attached video, which the workbench already knows.
	 *
	 * `videoId` is the draft's video rather than the player's, so this answers
	 * before a pending video has been through the session's opt-in: the link is a
	 * fact about the draft, and copying it contacts nobody.
	 */
	const videoUrl = $derived(
		controller.media?.videoId === undefined
			? undefined
			: `https://www.youtube.com/watch?v=${controller.media.videoId}`
	);

	/** A track name is a filename here, and `Artist — Track` is full of nothing a
	 *  file system minds except the separators. */
	function artworkFilename(): string {
		const name = controller.media?.player.name ?? 'Album art';
		return `${name.replace(/[\\/:*?"<>|]/gu, '-').trim()}.jpg`;
	}

	async function saveArtwork(url: string): Promise<void> {
		savingArtwork = true;
		try {
			await downloadImage(url, artworkFilename());
		} finally {
			savingArtwork = false;
		}
	}

	async function copyVideoUrl(url: string): Promise<void> {
		try {
			await copyText(url);
			controller.feedback.announce('YouTube link copied.');
		} catch {
			controller.feedback.announce('The link could not be copied.');
		}
	}
</script>

<!--
	The song half of what was one catch-all tab. Everything here is about the
	transcription in front of the user rather than the application around it: what
	the attached song is, and the files this draft turns into. The workspace and
	the app's own settings moved to the Preferences tab, which is what let this one
	be named for the one thing it is.

	The two rules the old panel earned still hold: a section is a heading over at
	most two things, and a section's actions fit on one row.
-->
<div class="panel-content panel-sections song-panel">
	<!--
		What the attached song is, in the forms somebody filling in a song page
		elsewhere has to paste: its facts, its cover and its link.

		It leads, because it is the one section here that comes and goes with the
		attachment — a section that is only sometimes there leads or it is somewhere
		different on every draft. Each part draws only where its own fact exists, so
		a local file shows no heading at all, and nothing here contacts anyone: the
		facts and the cover's address arrived on the read that named the song, and
		the link is derived from the id the draft already stores.
	-->
	{#if artwork || videoUrl || listedFacts}
		<section>
			<!-- No sentence under the heading. `Song metadata` over a column of
			     labelled facts and two self-describing commands is already the whole
			     of what a paragraph there would have said. -->
			<h3>Song metadata</h3>
			{#if details && listedFacts}
				<SongFacts {details} />
			{/if}
			<div class="tool-actions">
				{#if videoUrl}
					<button type="button" class="button" onclick={() => copyVideoUrl(videoUrl)}>
						Copy YouTube link
					</button>
				{/if}
				{#if artwork}
					<!-- The label stays put and a loading mark joins it: a control whose text
					     changes under the press reflows the row it was pressed in. -->
					<button
						type="button"
						class="button"
						disabled={savingArtwork}
						aria-busy={savingArtwork}
						onclick={() => saveArtwork(artwork)}
					>
						{#if savingArtwork}
							<LoadingMark />
						{/if}
						Download album art
					</button>
				{/if}
			</div>
		</section>
	{/if}

	<!--
		One action, because an export is wanted once, on the way out. `Copy lyrics`
		is not here at all: the toolbar carries it as the window's one contrast
		action, and a second copy of it in a panel was a second command for a press
		the user already has. `current draft` is gone from the label rather than
		shortened for room — the toolbar names the draft.
	-->
	<section>
		<h3>Document</h3>
		<div class="tool-actions">
			<button type="button" class="button" onclick={() => controller.exportDraft()}>
				Export .txt
			</button>
			<button type="button" class="button" onclick={() => controller.exportScribe()}>
				Export Scribe
			</button>
		</div>
		<p>
			Text holds the canonical lyrics. A Scribe keeps the editable LyricLint project as an .lls
			file.
		</p>
	</section>

	<!--
		Everything about the draft's timings in one place: the export, and the way to
		clear them. Drawn only where there is something to write — a draft with no
		timings is offered neither, the same rule `availableRates` and the cover
		section follow.

		The three formats are one native `<select>` rather than three buttons: the
		choice is which container, and the command is still one press. The delete is
		the destructive confirm-in-place, in the section it belongs to rather than
		beside `Delete all local data`, which is a different scope and now a different
		tab — the two were only ever together because both are destructive.
	-->
	{#if controller.lineAnchorCount > 0}
		<section>
			<h3>Timed lyrics</h3>
			<div class="tool-actions">
				<label class="sr-only" for="timed-lyrics-format">Timed lyrics format</label>
				<select id="timed-lyrics-format" bind:value={timedLyricsFormat}>
					<option value="lrc">LRC</option>
					<option value="srt">SRT</option>
					<option value="vtt">VTT</option>
				</select>
				<button
					type="button"
					class="button"
					onclick={() => controller.exportTimedLyrics(timedLyricsFormat)}
				>
					Export timings
				</button>
			</div>
			<p>
				{controller.lineAnchorCount} timed {controller.lineAnchorCount === 1 ? 'line' : 'lines'}, in
				time order, without the markup a player cannot read.
			</p>
			<div aria-live="polite">
				{#if confirmClearAnchors}
					<p class="danger-text">
						Delete {controller.lineAnchorCount} line {controller.lineAnchorCount === 1
							? 'timing'
							: 'timings'} on this transcription? The lyrics are untouched.
					</p>
					<div class="tool-actions">
						<button
							type="button"
							class="button button--danger"
							onclick={() => {
								controller.clearLineAnchors();
								confirmClearAnchors = false;
							}}>Delete line timings</button
						>
						<button
							type="button"
							class="button button--quiet"
							onclick={() => (confirmClearAnchors = false)}>Cancel</button
						>
					</div>
				{:else}
					<div class="tool-actions tool-actions--flush">
						<button
							type="button"
							class="button button--quiet danger-text"
							onclick={() => (confirmClearAnchors = true)}>Delete line timings…</button
						>
					</div>
				{/if}
			</div>
		</section>
	{/if}
</div>
