<script lang="ts">
	import GuidanceSearchHighlight from './GuidanceSearchHighlight.svelte';
	import CodeProse from './CodeProse.svelte';
	import SiteSourceFold from './SiteSourceFold.svelte';
	import MusixmatchCheck from './MusixmatchCheck.svelte';
	import type { PageData } from '../../../routes/(site)/guidelines/musixmatch/[topic]/$types.js';
	let { entry }: { entry: PageData['entries'][number] } = $props();
	const labels = {
		check: 'Partly checked from text',
		metadata: 'Retained metadata',
		review: 'Needs contextual review',
		workflow: 'Contribution workflow',
		'source-conflict': 'Unresolved source scope',
		advisory: 'Community advice'
	};
	function languageName(code: string): string {
		switch (code) {
			case 'en':
				return 'English';
			case 'no':
				return 'Norwegian';
			case 'ar':
				return 'Arabic';
			case 'de':
				return 'German';
			case 'es':
				return 'Spanish';
			case 'fr':
				return 'French';
			case 'ja':
				return 'Japanese';
			case 'ko':
				return 'Korean';
			default:
				return code;
		}
	}
	function languageScope(languages: readonly string[]): string {
		if (languages.length === 8) return 'All supported languages where applicable';
		return languages.map((code) => languageName(code)).join(', ');
	}
</script>

{#snippet marked(text: string)}<GuidanceSearchHighlight {text} />{/snippet}

<section
	id={entry.id.toLowerCase()}
	class="profile-guideline"
	aria-labelledby={`${entry.id}-heading`}
>
	<h2 id={`${entry.id}-heading`}><CodeProse text={entry.title} mark={marked} /></h2>
	<div class="site-meta">
		<span class="mxm-pill mxm-pill--{entry.handling}">{labels[entry.handling]}</span>
		<span class="site-meta__separator" aria-hidden="true">·</span>
		<span>{languageScope(entry.languages)}</span>
		<span class="site-meta__separator" aria-hidden="true">·</span>
		<SiteSourceFold sources={entry.sources} text={marked} />
	</div>
	{#if entry.statement !== entry.title && entry.statement !== `${entry.title}.`}
		<p><CodeProse text={entry.statement} mark={marked} /></p>
	{/if}
	{#if entry.handling === 'source-conflict'}
		<p class="mxm-conflict">
			<strong>Guidelines disagree.</strong> The official sources behind this convention state different
			requirements. LyricLint preserves your wording and lists each source above rather than choosing
			one for you.
		</p>
	{/if}
	<h3>What LyricLint can establish</h3>
	<p><CodeProse text={entry.limit} mark={marked} /></p>
	{#if entry.checks.length}
		<h3>Checks for this convention</h3>
		<ul class="mxm-checks">
			{#each entry.checks as check (check.slug)}
				<li>
					<details data-check-id={check.slug}>
						<summary><GuidanceSearchHighlight text={check.title} /></summary>
						<MusixmatchCheck {check} />
					</details>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="site-meta">{entry.topic} · {entry.id}</p>
</section>

<style>
	.profile-guideline {
		margin-block: var(--space-7);
		scroll-margin-block-start: var(--space-6);
	}
	.mxm-pill {
		display: inline-block;
		padding-inline: var(--space-2);
		padding-block: calc(var(--space-1) / 2);
		border: var(--border-width) solid var(--color-border-strong);
		border-radius: var(--radius-pill);
		background: var(--color-fill-subtle);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-ui);
		white-space: nowrap;
	}
	.mxm-pill--source-conflict {
		border-style: dashed;
	}
	.mxm-conflict {
		padding-inline: var(--space-3);
		padding-block: var(--space-2);
		border-inline-start: var(--border-width) solid var(--color-border-strong);
	}
	.mxm-checks {
		list-style: none;
		padding: 0;
		margin: var(--space-3) 0 0;
	}
	.mxm-checks li + li {
		margin-top: var(--space-4);
	}
	.mxm-checks summary {
		font-weight: var(--font-weight-medium);
		cursor: pointer;
	}
	@media (pointer: coarse) {
		.mxm-checks summary {
			min-height: var(--control-height-touch);
			align-content: center;
		}
	}
</style>
