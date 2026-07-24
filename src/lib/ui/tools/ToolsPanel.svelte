<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import SourceLink from '../primitives/SourceLink.svelte';

	let { controller }: { controller: WorkbenchController } = $props();
	let confirmDeleteAll = $state(false);

	const reviewedSources = $derived(
		[...controller.sources.values()].filter((source) => source.reviewStatus === 'reviewed')
	);
</script>

<div class="panel-content tools-panel">
	<section>
		<h3>Document</h3>
		<div class="tool-actions">
			<button
				type="button"
				class="button button--primary"
				onclick={() => controller.copyCanonical()}
			>
				Copy canonical markup
			</button>
			<button type="button" class="button button--quiet" onclick={() => controller.exportDraft()}>
				Export current draft (.txt)
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
		<p>Drafts remain in this browser. Lyric text is not sent to Genius or a LyricLint server.</p>
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

	<p class="offline-note">
		Editing, lint metadata, local saving, export, and copy remain available offline.
	</p>
</div>
