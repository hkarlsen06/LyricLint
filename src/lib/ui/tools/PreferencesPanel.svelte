<script lang="ts">
	import { Switch } from 'bits-ui';
	import { onMount } from 'svelte';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import SourceLink from '$lib/diagnostics/SourceLink.svelte';
	import type { WorkspaceBackupState } from '$lib/persistence/backup.js';
	import {
		requestPersistentStorage,
		storagePersistence
	} from '../state/storage-persistence.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
	let confirmDeleteAll = $state(false);
	let backupInput = $state<HTMLInputElement>();
	let importingBackup = $state(false);
	let backupState = $state<WorkspaceBackupState | undefined>();

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

	const persistence = $derived(storagePersistence());

	async function protectStorage(): Promise<void> {
		const granted = await requestPersistentStorage();
		// The sentence and the control both change, but that change is not in a
		// live region — and on Firefox the answer arrives out of a permission
		// prompt, with focus wherever the browser left it.
		controller.feedback.announce(
			granted
				? 'Storage is now protected from automatic cleanup.'
				: 'The browser declined protected storage.'
		);
	}
</script>

<!--
	The workspace half of what was one catch-all tab. Everything here is about the
	application rather than the song in front of the user: your preferences, the
	backup of every 'scribe, the local data behind them, and what rule set is
	running. It exists so the tab beside it can be only about the song, and so the
	one setting the feedback asked for — a way to turn grammar checking off — has a
	home rather than a seventh section in a drawer.

	The rules the panel earned still hold: a section is a heading over at most two
	things, and a claim is made once, where the reader is deciding.
-->
<div class="panel-content panel-sections preferences-panel">
	<!--
		Grammar checking leads because it is the reason this tab exists and the most
		likely thing a user opens it for. It is a preference and not a per-finding
		ignore because it is a stance on a whole provider: Harper is a general
		English proofreader that cites itself, knows nothing about lyrics, and is
		advisory by design — so turning it off is one decision, not fifty. Off also
		spares the ~18MB download it would otherwise fetch the first time the
		workbench needs it.
	-->
	<section>
		<h3>Grammar checking</h3>
		<!-- A switch, not a checkbox. The row is a live setting — flipping it acts
		     at once, no form, no submit — and a switch is the control every settings
		     surface has taught for exactly that, where a checkbox reads as a form
		     answer and renders as the platform's own dated widget. The label is a
		     real <label for>, so pressing the words toggles too. -->
		<div class="toggle-field">
			<label for="grammar-check-switch">Check grammar with Harper</label>
			<Switch.Root
				id="grammar-check-switch"
				class="switch"
				checked={controller.grammarCheckEnabled}
				onCheckedChange={(checked) => controller.setGrammarCheckEnabled(checked)}
			>
				<Switch.Thumb class="switch__thumb" />
			</Switch.Root>
		</div>
		<p>
			An English proofreader that runs beside the reviewed rules. Its suggestions cite Harper, not
			Genius, and are advisory — they never bulk-fix and are never applied for you.
		</p>
	</section>

	{#if controller.backup}
		<section>
			<h3>Workspace backup</h3>
			<p>
				Backs up every 'scribe and its settings — not assistant chats, which stay in this browser
				only. Imports add to this workspace, but local audio needs reconnecting.
			</p>

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
			'Scribes and assistant chats stay in this browser; audio stays on your disk. Linting works
			offline; online playback and the rules assistant need a connection. Resetting LyricLint
			deletes the 'scribes and the chats and returns every setting to its default.
		</p>
		<!--
			Whether "stay in this browser" is actually durable. Browser storage is
			best-effort until the origin is granted persistence, so this line states
			whichever is true — and only where the browser can answer at all: an
			`unknown` or `unsupported` state draws nothing, because a claim the
			workbench cannot verify is worth less than silence.

			The control draws only at `prompt`, where pressing it is what pays for
			the permission dialog Firefox shows; Chromium's silent grants are taken
			at boot without any of this. At `denied` there is no control, because a
			button the browser has already refused is an answer that cannot be
			carried out — the sentence points at the backup instead.
		-->
		{#if persistence === 'persistent'}
			<p class="backup-status">
				Storage is protected: this browser keeps LyricLint's data until you clear it yourself.
			</p>
		{:else if persistence === 'prompt'}
			<p class="backup-status">
				Storage is best-effort: under disk pressure the browser may clear it. The workspace backup
				is the durable copy.
			</p>
			<div class="tool-actions">
				<button type="button" class="button" onclick={protectStorage}>Protect storage</button>
			</div>
		{:else if persistence === 'denied'}
			<p class="backup-status backup-status--warning">
				This browser declined protected storage, so keep a workspace backup as the durable copy.
			</p>
		{/if}
		<!--
			The confirm replaces the trigger in place rather than opening a bordered
			danger box inside the section. Line timings — a document-scoped delete —
			live on the Song tab now, so this section asks exactly one question.

			`Reset LyricLint`, not `Delete all local data`: the sweep now takes the
			preferences and recent languages with the content, so the honest name is
			the state the press produces — a fresh install — rather than a claim
			about data that used to under-deliver on the settings. A linked backup
			file survives on disk (the controller unlinks before deleting), which is
			the one escape hatch out of this press.
		-->
		<div aria-live="polite">
			{#if confirmDeleteAll}
				<p class="danger-text">
					Reset LyricLint to a fresh install? Every local 'scribe and chat is deleted, and every
					setting returns to its default. This cannot be undone.
				</p>
				<div class="tool-actions">
					<button
						type="button"
						class="button button--danger"
						onclick={async () => {
							await controller.deleteAllDrafts();
							confirmDeleteAll = false;
						}}>Reset LyricLint</button
					>
					<button
						type="button"
						class="button button--quiet"
						onclick={() => (confirmDeleteAll = false)}>Cancel</button
					>
				</div>
			{:else}
				<!-- The flush pull is for an edge read against prose, and this row's
				     neighbour changes with the storage state: under a sentence the
				     label lines up with the text, but under the bordered `Protect
				     storage` control the pull would outdent this box past the one
				     above it — a quiet button's edge beside another control takes the
				     control inset, which is what lines the two labels up. -->
				<div class="tool-actions {persistence === 'prompt' ? '' : 'tool-actions--flush'}">
					<button
						type="button"
						class="button button--quiet danger-text"
						onclick={() => (confirmDeleteAll = true)}>Reset LyricLint…</button
					>
				</div>
			{/if}
		</div>
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
</div>
