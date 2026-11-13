<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import ClipboardTextIcon from 'phosphor-svelte/lib/ClipboardTextIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { Switch } from 'bits-ui';
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from '#lib/interaction/motion.js';
	import { profileLabels, type ProfileId } from '#lib/profiles/types.js';
	import { profileLanguage } from '#lib/profiles/languages.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
	const id = $props.id();
	const profiles: ProfileId[] = ['genius', 'musixmatch'];
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

<!-- Where an empty 'scribe begins. While the draft is new it asks the one
     decision that comes before writing, the format, in the document that format
     decides; under it are the ways to begin, which stay for as long as the
     document is empty. It rests on the sheet's foot, clear of where a press
     starts writing, and takes presses only on its controls: everything else
     falls through to the editor underneath, so typing and pasting start the
     draft as they always did. It is absolutely positioned, so leaving moves no
     lyric line. Its frame covers the sheet so the tray can size itself to
     the sheet's height, which the window's height does not tell: stacked
     panels halve it. -->
{#if controller.isEmpty}
	<div class="draft-start-frame" out:fade={leave()}>
		<div class="draft-start">
			{#if controller.writing.phase === 'new'}
				<h2 class="draft-start__heading">Choose a format</h2>
				<p class="draft-start__lede">
					Each 'scribe is written in one. Export makes an editable copy in the other.
				</p>
				<!-- The Preferences switch, asked where the format is: choosing Genius
			     stores it off and Musixmatch on, and a Genius 'scribe may then turn
			     it on. A Musixmatch 'scribe always shows its tools, so there it
			     reads on and cannot be pressed. It sits above the cards because the
			     tray rests on the sheet's foot: a row under them would lift the
			     cards over the middle of the sheet, where a press starts writing. -->
				<div class="draft-start__tools">
					<span class="draft-start__tools-text">
						<label class="draft-start__tools-label" for="{id}-tools">Musixmatch tools</label>
						<!-- One sentence for both formats, so the row keeps its height
					     and the switch its place when the choice changes. -->
						<span class="draft-start__tools-hint" id="{id}-tools-hint">
							Format tag and Export in Genius 'scribes; always on in Musixmatch.
						</span>
					</span>
					<Switch.Root
						id="{id}-tools"
						class="switch"
						aria-describedby="{id}-tools-hint"
						checked={controller.showsFormatTools}
						disabled={controller.profile === 'musixmatch'}
						onCheckedChange={(checked) => controller.setMusixmatchToolsEnabled(checked)}
					>
						<Switch.Thumb class="switch__thumb" />
					</Switch.Root>
				</div>
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
							title={current && controller.pendingProfile
								? 'Cancel pending format switch'
								: undefined}
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
			{/if}
			<!-- The contrast tier belongs to the way in while there is nothing to take
		     out: the toolbar's copy holds it once the document has words. -->
			<button
				type="button"
				class="button button--contrast draft-start__action"
				onclick={() => controller.pasteLyrics()}
			>
				<ClipboardTextIcon aria-hidden="true" size={16} weight="bold" />
				Paste lyrics
			</button>
			<p class="draft-start__hint">Or start typing. Everything saves on this device.</p>
			<!-- The sample is offered only where it can load (`canLoadSample`), which
		     follows the chosen format. Where it cannot, an invisible strut with
		     the button's own box holds its row, so choosing a format never moves
		     the tray above it. -->
			{#if controller.canLoadSample}
				<button
					type="button"
					class="button button--quiet draft-start__action"
					onclick={() => controller.loadSample()}
				>
					Load a sample 'scribe
				</button>
			{:else}
				<span class="button button--quiet draft-start__strut" aria-hidden="true">&nbsp;</span>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* A size container only the tray lives in. On the editor region itself
	   the containment would make the region the containing block for the
	   editor's fixed popovers. */
	.draft-start-frame {
		position: absolute;
		z-index: var(--layer-editor-panel);
		inset: 0;
		container: draft-sheet / size;
		pointer-events: none;
	}

	.draft-start {
		position: absolute;
		inset-inline: 0;
		bottom: 0;
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
		margin-block: var(--space-2) var(--space-3);
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

	/* A settings row the cards' width, just above them: name and hint at the
	   start, the switch at the end, as Preferences sets it. */
	.draft-start__tools {
		display: flex;
		width: 100%;
		margin-top: var(--space-3);
		padding-inline: var(--space-4);
		gap: var(--space-3);
		align-items: center;
		justify-content: space-between;
		text-align: start;
	}

	/* One line where it fits, so the tray grows by a single row; the hint wraps
	   under the name on a phone. */
	.draft-start__tools-text {
		display: flex;
		min-width: 0;
		flex-wrap: wrap;
		column-gap: var(--space-2);
		align-items: baseline;
	}

	.draft-start__tools-label {
		color: var(--color-text);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		pointer-events: auto;
	}

	.draft-start__tools-hint {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-ui);
	}

	.draft-start__tools :global(.switch) {
		pointer-events: auto;
	}

	.draft-start__action {
		pointer-events: auto;
	}

	.draft-start__hint {
		margin-top: var(--space-1);
	}

	.draft-start__strut {
		visibility: hidden;
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
			margin-block: var(--space-1) var(--space-2);
			gap: var(--space-2);
		}
		.draft-start__tools {
			margin-top: var(--space-2);
			padding-inline: var(--space-3);
		}
		.draft-start__format {
			min-height: var(--control-height-touch);
			padding: var(--space-3);
		}
	}

	/* The tray stays in the sheet's lower half, clear of where a press starts
	   writing, by shedding rows as the sheet gets shorter: the samples, then
	   the explanations, then everything but the choice and the paste. */
	@container draft-sheet (max-height: 40rem) {
		.draft-start__sample {
			display: none;
		}
	}

	@container draft-sheet (max-height: 37rem) {
		.draft-start__lede,
		.draft-start__detail,
		.draft-start__tools-hint {
			display: none;
		}
	}

	@container draft-sheet (max-height: 30rem) {
		.draft-start__hint,
		.draft-start__hint ~ .button {
			display: none;
		}
	}

	/* A short phone has room for the ghost transcription and the tray only if
	   the cards are their names alone. */
	@media (max-width: 46rem) and (max-height: 44rem) {
		.draft-start__detail,
		.draft-start__tools-hint {
			display: none;
		}
	}

	/* With the keyboard up the sheet is a few lines tall and the user is about
	   to type, so the tray keeps the choice and the paste and drops the rest.
	   Media queries cannot see the keyboard; `trackKeyboardInset` can. */
	:global(:root[data-keyboard-inset]) .draft-start__lede,
	:global(:root[data-keyboard-inset]) .draft-start__detail,
	:global(:root[data-keyboard-inset]) .draft-start__tools-hint,
	:global(:root[data-keyboard-inset]) .draft-start__sample,
	:global(:root[data-keyboard-inset]) .draft-start__hint,
	:global(:root[data-keyboard-inset]) .draft-start__hint ~ .button {
		display: none;
	}
</style>
