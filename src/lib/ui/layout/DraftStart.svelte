<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from '#lib/interaction/motion.js';
	import { profileLabels, type ProfileId } from '#lib/profiles/types.js';
	import { profileLanguage } from '#lib/profiles/languages.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
	const id = $props.id();
	const profiles: ProfileId[] = ['genius', 'musixmatch'];
	const mac = 'navigator' in globalThis && /Mac|iPhone|iPad|iPod/iu.test(navigator.platform);
	const formats = {
		genius: {
			detail: 'Section headers in brackets, with performers and annotations.',
			sample: ['[Chorus: Mira & Noor]', 'Hold on, hold on']
		},
		musixmatch: {
			detail: 'Plain lines in stanzas, backing vocals in parentheses.',
			sample: ['Hold on, hold on', "Don't let go (Let go)"]
		}
	} satisfies Record<ProfileId, { detail: string; sample: readonly [string, string] }>;
	const leave = () => ({ duration: prefersReducedMotion() ? 0 : 120 });
</script>

<!-- The one decision a new 'scribe asks for, made in the document it decides.
     It rests on the sheet's foot, clear of where a press starts writing, and
     takes presses only on its two choices: everything else falls through to the
     editor underneath, so typing and pasting start the draft as they always did.
     It is absolutely positioned, so leaving moves no lyric line. -->
{#if controller.writing.phase === 'new'}
	<div class="draft-start" out:fade={leave()}>
		<h2 class="draft-start__heading" id="{id}-heading">Choose a format</h2>
		<p class="draft-start__lede">
			Each 'scribe is written in one. Export makes an editable copy in the other.
		</p>
		<div
			class="draft-start__formats"
			role="group"
			aria-label="Lyric format"
			aria-describedby="{id}-pending"
		>
			{#each profiles as profile (profile)}
				{@const current = controller.profile === profile}
				{@const format = formats[profile]}
				<button
					type="button"
					class="draft-start__format"
					aria-label={`Lyric format: ${profileLabels[profile]}`}
					aria-pressed={current}
					aria-describedby={current && controller.pendingProfile
						? `${id}-pending`
						: `${id}-${profile}`}
					title={current && controller.pendingProfile ? 'Cancel pending format switch' : undefined}
					onclick={() => controller.switchProfile(profile)}
				>
					<span class="draft-start__format-head">
						<span class="draft-start__name">{profileLabels[profile]}</span>
						<span class="draft-start__mark" aria-hidden="true">
							{#if current && controller.pendingProfile}<XIcon size={12} weight="bold" />
							{:else if current}<CheckIcon size={12} weight="bold" />{/if}
						</span>
					</span>
					<span class="draft-start__detail" id="{id}-{profile}">{format.detail}</span>
					<span class="draft-start__sample" aria-hidden="true">
						{#each format.sample as line, index (index)}
							<span class:draft-start__sample-header={line.startsWith('[')}>{line}</span>
						{/each}
					</span>
				</button>
			{/each}
		</div>
		<span id="{id}-pending" class="sr-only">
			{#if controller.pendingProfile}Select the current format to cancel the pending switch.{/if}
			{#if profileLanguage(controller.language) === 'und'}Language-independent conversion only.{/if}
		</span>
		<p class="draft-start__hint">
			<span class="draft-start__keys"><kbd>{mac ? '⌘V' : 'Ctrl+V'}</kbd> pastes, or start</span
			><span class="draft-start__touch">Paste or start</span> typing. Everything saves on this device.
		</p>
	</div>
{/if}

<style>
	.draft-start {
		position: absolute;
		inset-inline: 0;
		bottom: 0;
		z-index: var(--layer-editor-panel);
		display: grid;
		width: min(100% - 2 * var(--space-5), 40rem);
		margin-inline: auto;
		padding-bottom: var(--space-6);
		gap: var(--space-1);
		justify-items: center;
		text-align: center;
		pointer-events: none;
	}

	.draft-start__heading {
		margin: 0;
		color: var(--color-text);
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-heading);
		line-height: var(--line-height-tight);
	}

	.draft-start__lede,
	.draft-start__hint {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-body);
	}

	.draft-start__formats {
		display: grid;
		width: 100%;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-block: var(--space-4) var(--space-3);
		gap: var(--space-3);
	}

	/* A choice is a card the size of what it decides. Resting, it is recessed into
	   the sheet; chosen, it rises with the accent ring and a filled check, so the
	   choice is read from depth and the mark before color. Every card keeps the
	   same box whether chosen or not. */
	.draft-start__format {
		display: grid;
		min-width: 0;
		padding: var(--space-3) var(--space-4) var(--space-4);
		border: 0;
		border-radius: var(--radius-panel);
		gap: var(--space-1);
		align-content: start;
		background: var(--color-chrome);
		box-shadow: var(--shadow-track);
		color: var(--color-text);
		text-align: start;
		pointer-events: auto;
	}

	.draft-start__format:hover {
		background: var(--color-fill-subtle);
	}

	.draft-start__format[aria-pressed='true'] {
		background: var(--color-overlay);
		box-shadow:
			0 0 0 calc(1.5 * var(--border-width)) var(--color-accent),
			var(--shadow-raised);
	}

	.draft-start__format:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-width);
	}

	.draft-start__format-head {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		justify-content: space-between;
	}

	.draft-start__name {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-heading);
	}

	/* An empty ring at rest and a filled accent disc with a check when chosen:
	   fill against outline is the cue that survives without color. */
	.draft-start__mark {
		display: inline-grid;
		flex: none;
		width: var(--space-4);
		height: var(--space-4);
		place-items: center;
		border-radius: var(--radius-round);
		box-shadow: inset 0 0 0 calc(1.5 * var(--border-width)) var(--color-border-strong);
		color: var(--color-accent-text);
	}

	.draft-start__format[aria-pressed='true'] .draft-start__mark {
		background: var(--color-accent);
		box-shadow: none;
	}

	.draft-start__detail {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-ui);
	}

	/* The format's own shape, set the way the editor sets it: lyric words in the
	   reading face, a bracketed header in the dimmed source face. */
	.draft-start__sample {
		display: grid;
		margin-top: var(--space-2);
		overflow: hidden;
		color: var(--color-text-reading);
		font-family: var(--font-lyrics);
		font-size: var(--font-size-sm);
		font-size-adjust: var(--font-lyrics-size-adjust);
		line-height: var(--line-height-editor);
	}

	.draft-start__sample > span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.draft-start__sample-header {
		color: var(--color-text-muted);
		font-family: var(--font-mono);
		font-size-adjust: none;
	}

	.draft-start__touch {
		display: none;
	}
	@media (pointer: coarse) {
		.draft-start__keys {
			display: none;
		}
		.draft-start__touch {
			display: inline;
		}
	}

	.draft-start__hint kbd {
		padding: 0 var(--space-1);
		border-radius: var(--radius-xs);
		background: var(--color-fill);
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}

	@media (prefers-reduced-motion: no-preference) {
		.draft-start__format {
			transition:
				background-color var(--duration-fast) var(--ease-out-quart),
				box-shadow var(--duration-medium) var(--ease-out-quart);
		}
		.draft-start__mark {
			transition: background-color var(--duration-fast) var(--ease-out-quart);
		}
	}

	/* Phones keep the two choices side by side and drop the samples, so the
	   choice stays at the foot of the Write view with the writing room above. */
	@media (max-width: 46rem) {
		.draft-start {
			width: calc(100% - 2 * var(--space-3));
			padding-bottom: var(--space-4);
		}
		.draft-start__lede,
		.draft-start__sample {
			display: none;
		}
		.draft-start__formats {
			margin-block: var(--space-3) var(--space-2);
			gap: var(--space-2);
		}
		.draft-start__format {
			min-height: var(--control-height-touch);
			padding: var(--space-3);
		}
	}

	@media (max-height: 36rem) {
		.draft-start__lede,
		.draft-start__detail,
		.draft-start__sample {
			display: none;
		}
	}
</style>
