<script lang="ts">
	import { dismissOnOutside } from '#lib/interaction/dismiss.js';
	import { tick } from 'svelte';
	import { normalizeGeniusUrl } from '#lib/core/genius-url.js';
	import youtubeIcon from '#lib/assets/youtube-icon.svg';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import type { TimedLyricsFormat } from '#lib/core/timed-lyrics.js';
	import type { ContentKind } from '#lib/conversion/model.js';
	import { DEFAULT_DRAFT_TITLE } from '#lib/persistence/draft-repository.js';
	import { copyText } from '../clipboard.js';
	import ArtworkActions from '../media/ArtworkActions.svelte';
	import SongFacts, { hasSongFacts } from '../media/SongFacts.svelte';
	import { pendingMediaActionLabel } from '../media/pending-media-label.js';
	import { youtubeSearchTerm } from '../state/media-youtube.js';
	import PassageLanguage from './PassageLanguage.svelte';
	import ConversionDetails from './ConversionDetails.svelte';
	import ClipboardReview from './ClipboardReview.svelte';
	import LanguagePicker from '../layout/LanguagePicker.svelte';

	const contentKinds = [
		{ value: 'unknown', label: 'Not specified' },
		{ value: 'original', label: 'Original lyrics' },
		{ value: 'translation', label: 'Translation' },
		{ value: 'romanization', label: 'Romanization' }
	] satisfies readonly { value: ContentKind; label: string }[];

	let { controller, active = true }: { controller: WorkbenchController; active?: boolean } =
		$props();
	let confirmClearAnchors = $state(false);
	let confirmClearDocument = $state(false);
	let clearButton = $state<HTMLButtonElement>();
	let timedLyricsFormat = $state<TimedLyricsFormat>('lrc');
	let advancedOpen = $state(false);
	let advancedSummary = $state<HTMLElement>();
	let handledSectionRequest: WorkbenchController['requestedSection'];
	let handledToolsDraft: string | undefined;
	$effect(() => {
		const request = controller.requestedSection;
		const draft = controller.draftId;
		if (request === handledSectionRequest && draft === handledToolsDraft) return;
		handledSectionRequest = request;
		handledToolsDraft = draft;
		advancedOpen = false;
	});
	async function closeSectionDetails() {
		controller.dismissSectionDetails();
		await tick();
		advancedSummary?.focus();
	}
	const settingsEnabled = $derived(
		!controller.snapshot.conversionRecovery && !controller.snapshot.originalRecovery
	);
	let lastTiming: WorkbenchController['currentLineTiming'];
	const timing = $derived.by(() => {
		if (active) lastTiming = controller.currentLineTiming;
		return lastTiming;
	});
	let exactTime = $state<number>();
	let timeBasis: { draftId: string; timing: WorkbenchController['currentLineTiming'] } | undefined;
	$effect(() => {
		const draftId = controller.draftId;
		const current = timing;
		const previous = timeBasis?.timing;
		if (
			timeBasis?.draftId === draftId &&
			previous?.line === current?.line &&
			previous?.text === current?.text &&
			previous?.time === current?.time
		)
			return;
		timeBasis = { draftId, timing: current };
		exactTime = current?.time === undefined ? undefined : Math.round(current.time * 100) / 100;
	});

	let geniusUrl = $derived.by(() => {
		void controller.draftId;
		return controller.geniusUrl ?? '';
	});
	const geniusPage = $derived(normalizeGeniusUrl(controller.geniusUrl));

	const artwork = $derived(controller.media?.player.artwork);
	const details = $derived(controller.media?.player.songDetails);
	/**
	 * Whether any of the facts *this list draws* are known: the list's own
	 * predicate, so the section gate and the list cannot disagree. Artist and
	 * title are not asked for here, because the toolbar and the cover band both
	 * already say them.
	 */
	const listedFacts = $derived(hasSongFacts(details));
	function count(value: number, noun: string): string | undefined {
		return value > 0 ? `${value} ${noun}${value === 1 ? '' : 's'}` : undefined;
	}
	let lastDocumentStats = { lines: 0, stanzas: 0, performers: 0 };
	const documentStats = $derived.by(() => {
		if (!active) return lastDocumentStats;
		const parsed = controller.snapshot.parsed;
		const lyricLines = parsed.sections.flatMap((section) => section.lines);
		const lines = lyricLines.length;
		lastDocumentStats = {
			lines,
			stanzas: controller.snapshot.conversion
				? controller.snapshot.conversion.model.content
						.trim()
						.split(/\n[^\S\n]*\n/u)
						.filter((stanza) => stanza.trim()).length
				: lyricLines.reduce(
						(total, line, index) =>
							total +
							(index === 0 ||
							/\n[^\S\n]*\n/u.test(
								controller.snapshot.text.slice(lyricLines[index - 1]!.to, line.from)
							)
								? 1
								: 0),
						0
					),
			performers: controller.performers.length
		};
		return lastDocumentStats;
	});
	/**
	 * The document in one run of facts, for the section about the files it turns
	 * into. A count worth stating is one that could have been otherwise, so each
	 * waits until it has something to report; an empty draft states nothing at
	 * all. Local on purpose: the codebase has no shared pluralizer, and these
	 * are panel chrome in English rather than lyric text.
	 */
	const documentCounts = $derived(
		[
			count(documentStats.lines, 'line'),
			count(documentStats.stanzas, 'stanza'),
			count(documentStats.performers, 'performer')
		].filter((label) => label !== undefined)
	);
	/**
	 * Clearing is offered only where there is something to clear. An empty draft
	 * with no retained sections states nothing and offers nothing, the same
	 * rule the counts and the timed-lyrics section follow.
	 */
	const clearable = $derived(
		controller.snapshot.text.trim().length > 0 ||
			(controller.snapshot.conversion?.model.sections.length ?? 0) > 0
	);
	const searchName = $derived.by(() => {
		const title = controller.title.trim();
		return title === DEFAULT_DRAFT_TITLE ? undefined : youtubeSearchTerm(title);
	});
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
<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && confirmClearDocument) {
			event.preventDefault();
			confirmClearDocument = false;
			clearButton?.focus();
		}
	}}
/>
<div class="panel-content panel-sections song-panel">
	<ClipboardReview {controller} />
	{#if controller.snapshot.conversionRecovery || controller.snapshot.originalRecovery}
		<section>
			<h2>Recover retained details</h2>
			<p>
				{(controller.snapshot.conversionRecovery ?? controller.snapshot.originalRecovery)?.reason}
			</p>
			<p>
				Your latest lyrics are preserved. Format conversion waits until their retained details can
				be restored.
			</p>
			{#if (controller.snapshot.conversionRecovery ?? controller.snapshot.originalRecovery)?.sourceDraftId && !(controller.snapshot.conversionRecovery ?? controller.snapshot.originalRecovery)?.localSourceDraftId}
				<p>
					The original data is unavailable in this workspace. A standalone Scribe carries its
					reference, not its original bytes.
				</p>
			{/if}
			<div class="tool-actions">
				<button type="button" class="button" onclick={() => controller.exportScribe()}
					>Export recovery Scribe</button
				>
				{#if (controller.snapshot.conversionRecovery ?? controller.snapshot.originalRecovery)?.localSourceDraftId}
					<button type="button" class="button" onclick={() => controller.exportOriginalRecovery()}
						>Export original data</button
					>
				{/if}
			</div>
		</section>
	{/if}
	{#if controller.requestedSection}
		{#key controller.draftId}
			<ConversionDetails {controller} onclose={closeSectionDetails} />
		{/key}
	{:else}
		<section>
			<h2>Document</h2>
			{#if documentCounts.length > 0}
				<!-- The draft in one run of facts, over the files it turns into: what
			     would be exported, in the order it would be counted. -->
				<p>{documentCounts.join(' · ')}</p>
			{/if}
			<div class="tool-actions">
				<button type="button" class="button" onclick={() => controller.exportDraft()}>
					Export .txt
				</button>
				<button type="button" class="button" onclick={() => controller.exportScribe()}>
					Export Scribe
				</button>
			</div>
			<p>
				.txt: {controller.profile === 'musixmatch' ? 'Musixmatch' : 'Genius'} lyrics. Scribe: both formats
				and all editable details.
			</p>
			<details class="disclosure">
				<summary>Language and content type</summary>
				<div class="document-settings">
					<LanguagePicker
						language={controller.language}
						recentLanguages={controller.recentLanguages}
						label="Document language"
						expandedLabel
						showCoverage
						disabled={!settingsEnabled}
						onchoose={(tag) => controller.setLanguage(tag)}
					/>
					<label
						>Content type
						<select
							disabled={!settingsEnabled}
							value={controller.snapshot.conversion?.model.contentKind ?? 'unknown'}
							onchange={(event) => {
								const value = event.currentTarget.value;
								const kind = contentKinds.find((entry) => entry.value === value);
								if (kind)
									controller.applyConversionAction({
										kind: 'setContentKind',
										contentKind: kind.value
									});
							}}
						>
							{#each contentKinds as kind (kind.value)}
								<option value={kind.value}>{kind.label}</option>
							{/each}
						</select>
					</label>
				</div>
			</details>
			<!--
			The document-scoped delete lives in the section about the document it
			clears, disclosed separately from the exports. The toolbar carries only
			the commands used on every visit. Quiet until pressed, confirm in
			place, in the same shape as the line-timings delete below.
		-->
			{#if clearable}
				<details
					class="disclosure song-panel__delete"
					{@attach dismissOnOutside(() => (confirmClearDocument = false))}
					ontoggle={(event) => {
						if (!event.currentTarget.open) confirmClearDocument = false;
					}}
				>
					<summary>Clear this transcription</summary>
					<div class="clear-decision">
						<button
							bind:this={clearButton}
							type="button"
							class="button {confirmClearDocument ? 'button--danger' : 'button--quiet'}"
							onclick={() => {
								if (!confirmClearDocument) {
									confirmClearDocument = true;
									controller.feedback.announce(
										'Confirm clearing the lyrics and every retained detail.'
									);
									return;
								}
								if (controller.applyConversionAction({ kind: 'clearDocument' }))
									confirmClearDocument = false;
							}}
							>{confirmClearDocument
								? 'Delete lyrics and details'
								: 'Clear lyrics and retained details…'}</button
						>
						{#if confirmClearDocument}<button
								type="button"
								class="button button--quiet"
								onclick={() => {
									confirmClearDocument = false;
									clearButton?.focus();
								}}>Cancel</button
							>{/if}
						<p class:sr-only={!confirmClearDocument} aria-live="polite">
							{#if confirmClearDocument}Delete the lyrics and every retained detail on this
								transcription? Exports already made are untouched.{/if}
						</p>
					</div>
				</details>
			{/if}
		</section>

		{#if controller.lineAnchorCount > 0}
			<section>
				<h2>Timed lyrics</h2>
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
					{controller.lineAnchorCount} timed {controller.lineAnchorCount === 1 ? 'line' : 'lines'},
					in time order, without the markup a player cannot read.
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

		<PassageLanguage {controller} />

		<!--
		What the attached song is, in the forms somebody filling in a song page
		elsewhere has to paste: its facts, its cover and its link.

		Routine file output comes first, regardless of attached metadata. Each fact
		draws only where it exists. Attaching
		itself lives in the workbench through the tray's note button. Nothing else here
		contacts anyone: the facts and the cover's address arrived on the read that
		named the song, and the link is derived from the id the draft already stores.
	-->
		{#if artwork || videoUrl || listedFacts || searchName}
			<section>
				<!-- No sentence under the heading. `Song metadata` over a column of
			     labelled facts and self-describing commands is already the whole
			     of what a paragraph there would have said. -->
				<h2>Song metadata</h2>
				{#if details && listedFacts}
					<SongFacts {details} feedback={controller.feedback} />
				{/if}
				<div class="tool-actions" class:song-metadata-actions--after-facts={details && listedFacts}>
					{#if controller.media?.pendingName}
						<button
							type="button"
							class="button"
							disabled={controller.media.busy}
							onclick={() => void controller.media?.reconnect()}
						>
							{pendingMediaActionLabel(controller.media.pendingSource)}
						</button>
					{/if}
					{#if searchName && !videoUrl}
						<a
							class="button"
							href={`https://www.youtube.com/results?search_query=${encodeURIComponent(searchName)}`}
							target="_blank"
							rel="noopener noreferrer"
						>
							<img class="youtube-logo" src={youtubeIcon} width="20" height="15" alt="" />
							Search YouTube
						</a>
					{/if}
					{#if videoUrl}
						<button type="button" class="button" onclick={() => copyVideoUrl(videoUrl)}>
							Copy YouTube link
						</button>
					{/if}
					{#if artwork}
						<ArtworkActions
							{artwork}
							name={controller.media?.player.name}
							announce={(message) => controller.feedback.announce(message)}
						/>
					{/if}
				</div>
			</section>
		{/if}

		<details class="disclosure song-panel__advanced" bind:open={advancedOpen}>
			<summary bind:this={advancedSummary}>Advanced tools</summary>
			<div class="song-panel__advanced-content">
				<section>
					<h2>Genius page</h2>
					<div class="genius-page-row">
						{#key controller.draftId}
							<label class="sr-only" for="genius-page-url">Genius page link</label>
							<input
								id="genius-page-url"
								class="genius-page-input"
								type="url"
								placeholder="https://genius.com/Artist-song-lyrics"
								bind:value={geniusUrl}
								oninput={(event) => event.currentTarget.setCustomValidity('')}
								onchange={(event) => {
									const accepted = controller.setGeniusUrl(geniusUrl);
									event.currentTarget.setCustomValidity(
										accepted ? '' : 'Enter a valid Genius page link.'
									);
									if (!accepted) event.currentTarget.reportValidity();
								}}
							/>
						{/key}
					</div>
				</section>
				{#key controller.draftId}<ConversionDetails
						{controller}
						onclose={closeSectionDetails}
					/>{/key}

				<!-- The caret line remains the single accessible timing editor. File output is above. -->
				{#if timing}
					<section>
						<h2>Timing line {timing.line}</h2>
						<p>{timing.text}</p>
						<form
							class="line-timing-form"
							onsubmit={(event) => {
								event.preventDefault();
								if (exactTime !== undefined) controller.setCurrentLineTime(exactTime);
							}}
						>
							<label for="current-line-time">Time in seconds</label>
							<div class="tool-actions">
								<input
									class="line-timing-input"
									id="current-line-time"
									type="number"
									min="0"
									step="0.01"
									required
									bind:value={exactTime}
									placeholder="Not timed"
								/>
								<button type="submit" class="button" disabled={exactTime === undefined}
									>Set time</button
								>
							</div>
						</form>
						<div class="tool-actions">
							{#if timing.time !== undefined}
								<button
									type="button"
									class="button"
									disabled={timing.time === 0}
									onclick={() => controller.setCurrentLineTime(Math.max(0, timing.time! - 0.25))}
									>Earlier 0.25s</button
								>
								<button
									type="button"
									class="button"
									onclick={() => controller.setCurrentLineTime(timing.time! + 0.25)}
									>Later 0.25s</button
								>
								<button
									type="button"
									class="button button--quiet"
									onclick={() => controller.setCurrentLineTime(undefined)}>Clear line time</button
								>
							{/if}
							{#if controller.media?.player.attached}
								<button
									type="button"
									class="button button--quiet"
									onclick={() => controller.setCurrentLineTime(controller.media!.player.liveTime())}
									>Use playback time</button
								>
							{/if}
						</div>
					</section>
				{/if}
			</div>
		</details>
		{#if geniusPage}<div class="tool-actions">
				<!-- eslint-disable svelte/no-navigation-without-resolve -- normalizeGeniusUrl validates this external page link. -->
				<a
					class="button button--quiet"
					href={geniusPage}
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Open Genius page">Genius page</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</div>{/if}
	{/if}
</div>

<style>
	.song-panel {
		min-width: 0;
		grid-template-columns: minmax(0, 1fr);
		align-content: start;
	}

	.song-panel__advanced > summary {
		min-height: var(--control-height-touch);
		align-content: center;
		cursor: pointer;
		font-weight: var(--font-weight-semibold);
	}
	.song-panel__advanced-content {
		display: grid;
		gap: var(--space-6);
		margin-top: var(--space-3);
	}
	@media (pointer: coarse) {
		.song-panel :global(summary) {
			min-height: var(--control-height-touch);
			align-content: center;
		}
	}

	.clear-decision {
		display: grid;
		gap: var(--space-2);
		padding-top: var(--space-2);
	}

	.song-panel {
		display: grid;
		gap: var(--space-6);
	}
	.song-panel > :global(section),
	.song-panel__advanced-content > :global(section) {
		margin: 0;
		min-width: 0;
	}
	.song-panel__delete {
		margin-top: var(--space-4);
	}
	.song-panel__delete summary {
		min-height: var(--control-height-touch);
		align-content: center;
		cursor: pointer;
		color: var(--color-text-muted);
	}
	.document-settings {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}
	.document-settings > label {
		display: grid;
		gap: var(--space-1);
	}
	.song-panel :global(input:not([type='checkbox'])),
	.song-panel :global(select),
	.song-panel :global(textarea) {
		border-radius: var(--radius-control);
		font-size: var(--font-size-editor);
		box-sizing: border-box;
		max-width: 100%;
	}

	.song-metadata-actions--after-facts {
		/* The list's final value and the first bordered action are different kinds of
		 * content. A full stack gap keeps the button from reading as part of that last
		 * row, especially when a long value wraps onto a second line. This is an
		 * explicit class because SongFacts's visually hidden live region sits between
		 * the list and this row, so an adjacent-sibling selector cannot reach it. */
		margin-top: var(--space-4);
	}

	.youtube-logo {
		flex: none;
	}

	.genius-page-input {
		width: 100%;
		min-width: 0;
		font-size: var(--font-size-editor);
	}

	.genius-page-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-2);
		align-items: center;
	}
	.line-timing-form + .tool-actions {
		margin-top: var(--space-2);
	}

	.line-timing-input {
		flex: 1 1 0;
		min-width: 0;
		max-width: 100%;
	}
</style>
