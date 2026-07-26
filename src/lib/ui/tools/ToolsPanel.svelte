<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import SourceLink from '$lib/diagnostics/SourceLink.svelte';

	let { controller }: { controller: WorkbenchController } = $props();
	let confirmDeleteAll = $state(false);

	const reviewedSources = $derived(
		[...controller.sources.values()].filter((source) => source.reviewStatus === 'reviewed')
	);
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
	<section>
		<h3>Document</h3>
		<div class="tool-actions">
			<!-- The same action as the toolbar's contrast button, so it takes the
			     same label and steps down to the default tier: the toolbar already
			     carries the one destination action, and two emphases for one
			     command read as two different commands. -->
			<button type="button" class="button" onclick={() => controller.copyCanonical()}>
				Copy lyrics
			</button>
			<!-- `current draft` is gone from the label rather than shortened for
			     room: the toolbar names the draft two rows up, so the words were
			     restating what the window already says. -->
			<button type="button" class="button button--quiet" onclick={() => controller.exportDraft()}>
				Export .txt
			</button>
		</div>
		<p>Copy and export use the exact canonical string, including literal supported markup.</p>
	</section>

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

	<section>
		<h3>Local data</h3>
		<p>
			Drafts stay in this browser. Lyric text is never sent to Genius or a LyricLint server, and
			attached audio plays from your own disk — only its name is stored, never the file.
		</p>
		<p>
			Editing, linting, saving, export and copy all work offline. The one thing that reaches a
			network is YouTube playback, and it is asked for every session.
		</p>
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
			{:else}
				<button
					type="button"
					class="button button--quiet danger-text"
					onclick={() => (confirmDeleteAll = true)}>Delete all local data…</button
				>
			{/if}
		</div>
	</section>
</div>
