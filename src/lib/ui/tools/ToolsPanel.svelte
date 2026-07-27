<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import SourceLink from '$lib/diagnostics/SourceLink.svelte';
	import type { WorkspaceBackupState } from '$lib/persistence/backup.js';
	import type { TimedLyricsFormat } from '$lib/core/timed-lyrics.js';
	import { copyText, downloadImage } from '../clipboard.js';
	import SongFacts, { hasSongFacts } from '../media/SongFacts.svelte';
	import { onMount } from 'svelte';
	import LoadingMark from '../primitives/LoadingMark.svelte';

	let { controller }: { controller: WorkbenchController } = $props();
	let confirmDeleteAll = $state(false);
	let confirmClearAnchors = $state(false);
	let backupInput = $state<HTMLInputElement>();
	let importingBackup = $state(false);
	let backupState = $state<WorkspaceBackupState | undefined>();
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

	const reviewedSources = $derived(
		[...controller.sources.values()].filter((source) => source.reviewStatus === 'reviewed')
	);
	const backupActionLabel = $derived.by(() => {
		if (!backupState?.supported) return 'Download backup';
		if (!backupState.linkedFileName) return 'Choose backup file…';
		if (backupState.permission !== 'granted') return 'Allow backup access';
		return 'Change backup file…';
	});

	onMount(() => {
		backupState = controller.backup?.state();
		return controller.backup?.subscribe((state) => (backupState = state));
	});

	async function runBackupAction(): Promise<void> {
		if (backupState?.linkedFileName && backupState.permission !== 'granted') {
			await controller.allowBackupAccess();
			return;
		}
		await controller.backupWorkspace();
	}

	async function importBackup(file: File | undefined): Promise<void> {
		if (!file) return;
		importingBackup = true;
		await controller.restoreWorkspaceBackup(file);
		importingBackup = false;
	}
</script>

<!--
	Three sections, and each one is a heading over at most two things.

	It used to be a panel you had to read rather than scan. The Document section
	alone carried four actions that wrapped into a ragged two-by-two of mixed
	tiers, and the privacy story was told three separate times — once about audio
	under those buttons, once under `Local data`, and once more in a trailing
	sentence with no heading over it at all. Skimming it meant reading all of it.

	Two rules came out of the repair, and both are worth keeping:

	**A section's actions fit on one row.** Two is what fits at this panel's width,
	so the third and fourth had to be somewhere honest rather than somewhere
	convenient — attaching audio is now the status bar's picker, in the row the
	transport itself appears in. Adding an action here means asking what leaves.

	**A claim is made once, where the reader is deciding.** Everything local is
	said under `Local data` and nowhere else; the sentence about what YouTube
	costs lives in the picker, next to the press that spends it, because a warning
	the reader meets an hour before the decision is a warning they have forgotten.
-->
<div class="panel-content tools-panel">
	<!--
		What the attached song is, in the forms somebody filling in a song page
		elsewhere has to paste: its facts, its cover and its link.

		It leads the panel, because it is the only section here that is about the
		song in front of the user rather than about the application: it comes and
		goes with the attachment, it is read while transcribing, and everything
		under it is a setting or a way out. A section that is only sometimes there
		leads or it is somewhere different on every draft.

		One section rather than three, because they are one job: everything the
		workbench happens to know about this song that is not the words. Each part
		draws only where its own fact exists, so a local file shows no heading at
		all, and nothing here contacts anyone — the facts and the cover's address
		arrived on the read that named the song, and the link is derived from the id
		the draft already stores.
	-->
	{#if artwork || videoUrl || listedFacts}
		<section>
			<!-- No sentence under the heading. `Song metadata` over a column of
			     labelled facts and two self-describing commands is already the whole
			     of what a paragraph there would have said, and two lines of grey
			     between a heading and the data it introduces is how this panel got
			     hard to skim the first time. -->
			<h3>Song metadata</h3>
			<!-- The facts before the two things that can be taken away. The list is
			     `SongFacts.svelte`, shared with the receipt the copy button opens —
			     two copies of it would be two places for a field to be added to. -->
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

	{#if controller.backup}
		<section>
			<h3>Workspace backup</h3>
			<p>Backs up everything. Imports add to this workspace, but local audio needs reconnecting.</p>

			<div class="tool-actions">
				<button type="button" class="button" disabled={importingBackup} onclick={runBackupAction}>
					{backupActionLabel}
				</button>
				<button
					type="button"
					class="button button--quiet"
					disabled={importingBackup}
					onclick={() => backupInput?.click()}
				>
					{importingBackup ? 'Importing…' : 'Import backup…'}
				</button>
				<input
					bind:this={backupInput}
					hidden
					type="file"
					accept="application/json,.json"
					onchange={(event) => {
						const input = event.currentTarget;
						void importBackup(input.files?.[0]);
						input.value = '';
					}}
				/>
			</div>

			<p class="backup-status" aria-live="polite">
				{#if backupState?.linkedFileName}
					{#if backupState.permission === 'granted'}
						Autosaving to {backupState.linkedFileName}.
					{:else}
						Access to {backupState.linkedFileName} is needed. In Chrome, choose “Allow on every visit”
						to keep backups running after you reopen LyricLint.
					{/if}
				{:else if backupState?.supported}
					Choose a file once to autosave the whole workspace. Chrome can keep access between visits.
				{/if}
				{#if backupState?.status === 'saving'}
					Saving…
				{:else if backupState?.status === 'failed'}
					The last automatic backup failed.
				{/if}
			</p>
		</section>
	{/if}

	<section>
		<h3>Local data</h3>
		<p>
			Drafts stay in this browser; audio stays on your disk. Everything works offline except YouTube
			playback, which needs permission each session.
		</p>
		<!--
			Two ways out, one row, and exactly one question open at a time. The
			timings are the narrower of the two and draw only where there are any —
			a control offering to delete nothing is the same wrong answer as a rate
			that will not apply.

			The row carries the flush pull rather than each button, so the first
			label lines up with the paragraph above it and the gap between the two
			survives. `button--flush` on both would close it.
		-->
		<div aria-live="polite">
			{#if confirmDeleteAll}
				<p class="danger-text">Delete every local draft? This cannot be undone.</p>
				<div class="tool-actions">
					<button
						type="button"
						class="button button--danger"
						onclick={async () => {
							await controller.deleteAllDrafts();
							confirmDeleteAll = false;
						}}>Delete all local data</button
					>
					<button
						type="button"
						class="button button--quiet"
						onclick={() => (confirmDeleteAll = false)}>Cancel</button
					>
				</div>
			{:else if confirmClearAnchors}
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
					{#if controller.lineAnchorCount > 0}
						<button
							type="button"
							class="button button--quiet danger-text"
							onclick={() => (confirmClearAnchors = true)}>Delete line timings…</button
						>
					{/if}
					<button
						type="button"
						class="button button--quiet danger-text"
						onclick={() => (confirmDeleteAll = true)}>Delete all local data…</button
					>
				</div>
			{/if}
		</div>
	</section>

	<!--
		One action, near the foot of the panel, because that is how often it is
		wanted. `Copy lyrics` is not here at all: the toolbar carries it as the
		window's one contrast action, and a second copy of it in a panel three rows
		down was a second command for a press the user already has.

		`current draft` is gone from the label rather than shortened for room: the
		toolbar names the draft, so the words restated what the window already says.
	-->
	<section>
		<h3>Document</h3>
		<div class="tool-actions">
			<button type="button" class="button" onclick={() => controller.exportDraft()}>
				Export .txt
			</button>
		</div>
		<p>The file holds the exact canonical string, including literal supported markup.</p>
	</section>

	<!--
		Beside the export it belongs with, and drawn only where there is something
		to write — a draft with no timings is offered no file, the same rule
		`availableRates` and the cover section follow.

		A section's actions fit on one row, so the three formats are one native
		`<select>` rather than three buttons: the choice is which container, and the
		command is still one press.
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
		</section>
	{/if}

	<section>
		<h3>Reviewed rules</h3>
		{#if controller.ruleSet}
			<dl class="metadata-list">
				<div>
					<dt>Version</dt>
					<dd>{controller.ruleSet.version}</dd>
				</div>
				<div>
					<dt>Published</dt>
					<dd>
						<time datetime={controller.ruleSet.publishedAt}>{controller.ruleSet.publishedAt}</time>
					</dd>
				</div>
				<div>
					<dt>Rules</dt>
					<dd>{controller.ruleSet.ruleIds.length}</dd>
				</div>
			</dl>
		{:else}
			<p class="empty-state">Rule-set metadata is unavailable in this build.</p>
		{/if}

		{#if reviewedSources.length > 0}
			<details class="source-list">
				<summary>Reviewed source snapshot ({reviewedSources.length})</summary>
				{#each reviewedSources as source (source.id)}
					<SourceLink {source} />
				{/each}
			</details>
		{/if}
	</section>
</div>
