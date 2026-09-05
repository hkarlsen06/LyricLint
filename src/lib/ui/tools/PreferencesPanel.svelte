<script lang="ts">
	import { ChevronRight, Info } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import { Switch } from 'bits-ui';
	import { onMount } from 'svelte';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import { isEnglishLanguage } from '$lib/languages/registry.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import SourceLink from '$lib/diagnostics/SourceLink.svelte';
	import type { WorkspaceBackupState } from '$lib/persistence/backup.js';
	import {
		requestPersistentStorage,
		storagePersistence
	} from '../state/storage-persistence.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
	let confirmDeleteAll = $state(false);
	let resetButton = $state<HTMLButtonElement>();
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

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && confirmDeleteAll) {
			event.preventDefault();
			confirmDeleteAll = false;
			resetButton?.focus();
		}
	}}
/>

<div class="panel-content panel-sections preferences-panel">
	{#if isEnglishLanguage(controller.language)}
		<section aria-labelledby="grammar-heading">
			<div class="toggle-field preferences-panel__heading">
				<h2 id="grammar-heading"><label for="grammar-check-switch">Grammar checking</label></h2>
				<Switch.Root
					id="grammar-check-switch"
					class="switch"
					aria-describedby="grammar-description"
					checked={controller.grammarCheckEnabled}
					onCheckedChange={(checked) => controller.setGrammarCheckEnabled(checked)}
				>
					<Switch.Thumb class="switch__thumb" />
				</Switch.Root>
			</div>
			<p id="grammar-description">Optional English spelling and grammar suggestions.</p>
		</section>
	{/if}

	{#if controller.backup}
		<section aria-labelledby="backup-heading">
			<details class="preferences-panel__disclosure">
				<summary>
					<div>
						<h2 id="backup-heading">Workspace backup</h2>
						<span>Save or import your workspace</span>
					</div>
					<ChevronRight class="preferences-panel__chevron" aria-hidden="true" />
				</summary>
				<div class="preferences-panel__detail">
					<p>Save every 'scribe and its settings to a file. Assistant chats are excluded.</p>
					<div class="preferences-panel__backup">
						{#if backupState?.linkedFileName}
							<p class="backup-status">
								{#if backupState.permission === 'granted'}
									Backup file: {backupState.linkedFileName}
								{:else}
									Access to {backupState.linkedFileName} is needed. In Chrome, choose “Allow on every
									visit” to keep backups running after you reopen LyricLint.
								{/if}
							</p>
						{:else if backupState?.supported}
							<p class="backup-status">Choose a file to back up changes automatically.</p>
						{/if}
						<div class="tool-actions">
							<button
								type="button"
								class="button"
								disabled={importingBackup}
								onclick={runBackupAction}
							>
								{backupActionLabel}
							</button>
							<button
								type="button"
								class="button button--quiet"
								disabled={importingBackup}
								aria-describedby="backup-import-description"
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
						<p id="backup-import-description">
							Imports add to your workspace. Reconnect local audio afterward.
						</p>
					</div>
				</div>
			</details>
			<p class:sr-only={backupState?.status !== 'failed'} class="backup-status" aria-live="polite">
				{#if backupState?.status === 'failed'}The last automatic backup failed.{/if}
			</p>
		</section>
	{/if}

	<section
		aria-labelledby="local-data-heading"
		{@attach dismissOnOutside(() => (confirmDeleteAll = false))}
	>
		<details
			class="preferences-panel__disclosure"
			ontoggle={(event) => {
				if (!event.currentTarget.open) confirmDeleteAll = false;
			}}
		>
			<summary>
				<div>
					<h2 id="local-data-heading">Local data</h2>
					<span>Browser storage and reset</span>
				</div>
				<ChevronRight class="preferences-panel__chevron" aria-hidden="true" />
			</summary>
			<div class="preferences-panel__detail">
				<div class="preferences-panel__storage">
					<p>'Scribes and chats stay in this browser. Audio stays on your disk.</p>
					{#if persistence === 'persistent'}
						<p class="backup-status">Storage is protected from automatic browser cleanup.</p>
					{:else if persistence === 'prompt'}
						<p class="backup-status">
							Storage is best-effort: the browser may clear it under disk pressure.
						</p>
						<div
							class="tool-actions"
							class:preferences-panel__inactive={confirmDeleteAll}
							inert={confirmDeleteAll}
						>
							<button type="button" class="button" onclick={protectStorage}>Protect storage</button>
						</div>
					{:else if persistence === 'denied'}
						<p class="backup-status backup-status--warning">
							This browser declined protected storage. Keep a backup as the durable copy.
						</p>
					{/if}
				</div>
				<div class="preferences-panel__reset">
					<div class="tool-actions tool-actions--flush">
						<button
							bind:this={resetButton}
							type="button"
							class="button {confirmDeleteAll ? 'button--contrast' : 'button--quiet'}"
							aria-describedby="reset-description"
							onclick={async () => {
								if (!confirmDeleteAll) {
									confirmDeleteAll = true;
									return;
								}
								await controller.deleteAllDrafts();
								confirmDeleteAll = false;
							}}>{confirmDeleteAll ? 'Reset LyricLint' : 'Reset LyricLint…'}</button
						>
						{#if confirmDeleteAll}
							<button
								type="button"
								class="button button--quiet"
								onclick={() => {
									confirmDeleteAll = false;
									resetButton?.focus();
								}}>Cancel</button
							>
						{/if}
					</div>
					<p id="reset-description" class:sr-only={!confirmDeleteAll}>
						{#if confirmDeleteAll}
							Reset LyricLint to a fresh install? Every local 'scribe and chat will be deleted and
							all settings reset. This cannot be undone. Backup files stay on disk.
						{/if}
					</p>
					<p class="sr-only" aria-live="polite">
						{confirmDeleteAll ? 'Confirm reset or cancel. This cannot be undone.' : ''}
					</p>
				</div>
			</div>
		</details>
	</section>

	<section>
		<details class="preferences-panel__disclosure preferences-panel__rules">
			<summary>
				<div>
					<h2>Reviewed rules</h2>
					<span>Version and sources</span>
				</div>
				<ChevronRight class="preferences-panel__chevron" aria-hidden="true" />
			</summary>
			<div class="preferences-panel__detail">
				{#if controller.ruleSet}
					<dl class="metadata-list">
						<div>
							<dt>Version</dt>
							<dd>{controller.ruleSet.version}</dd>
						</div>
						<div>
							<dt>Published</dt>
							<dd>
								<time datetime={controller.ruleSet.publishedAt}
									>{controller.ruleSet.publishedAt}</time
								>
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
					<div class="source-list">
						{#each reviewedSources as source (source.id)}<SourceLink {source} />{/each}
					</div>
				{/if}
			</div>
		</details>
	</section>

	<footer class="panel-foot">
		<a class="about-link" href={resolve('/')}
			><Info size={14} aria-hidden="true" />About LyricLint</a
		>
	</footer>
</div>
