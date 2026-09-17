<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Check links only append a trailing slash to a resolved route. */
	import { resolve } from '$app/paths';
	import CodeProse from '$lib/ui/site/CodeProse.svelte';
	import SiteSourceFold from '$lib/ui/site/SiteSourceFold.svelte';
	import { siteUrl } from '$lib/seo.js';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();
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

<svelte:head>
	<title>{data.topic.title} · Musixmatch · LyricLint</title>
	<meta
		name="description"
		content={`Musixmatch guidance for ${data.topic.title.toLowerCase()}, with sources and the limits of deterministic checking.`}
	/>
	<link rel="canonical" href={siteUrl(`/guidelines/musixmatch/${data.topic.id}/`)} />
</svelte:head>

<main id="main" tabindex="-1" class="site-prose site-split__page">
	<h1>{data.topic.title} for Musixmatch</h1>
	<p class="site-lede">
		Each convention keeps its source, language scope and the part that still needs judgment.
	</p>
	<p class="site-meta">
		{data.entryCount} conventions · {data.checkCount} related
		{data.checkCount === 1 ? 'check' : 'checks'}
	</p>
	<p>
		The checks below catch specific patterns in your text. They support your review; passing them
		does not verify every part of a convention.
	</p>
	{#each data.entries as entry (entry.id)}
		<section
			id={entry.id.toLowerCase()}
			class="profile-guideline"
			aria-labelledby={`${entry.id}-heading`}
		>
			<h2 id={`${entry.id}-heading`}><CodeProse text={entry.title} /></h2>
			<div class="site-meta">
				<span class="mxm-pill mxm-pill--{entry.handling}">{labels[entry.handling]}</span>
				<span class="site-meta__separator" aria-hidden="true">·</span>
				<span>{languageScope(entry.languages)}</span>
				<span class="site-meta__separator" aria-hidden="true">·</span>
				<SiteSourceFold sources={entry.sources} />
			</div>
			<p><CodeProse text={entry.statement} /></p>
			{#if entry.handling === 'source-conflict'}
				<p class="mxm-conflict">
					<strong>Guidelines disagree.</strong> The official sources behind this convention state different
					requirements. LyricLint preserves your wording and lists each source above rather than choosing
					one for you.
				</p>
			{/if}
			<h3>What LyricLint can establish</h3>
			<p><CodeProse text={entry.limit} /></p>
			{#if entry.checks.length}
				<h3>Checks for this convention</h3>
				<ul class="mxm-checks">
					{#each entry.checks as check (check.slug)}
						<li>
							<details data-check-id={check.slug}>
								<summary>{check.title}</summary>
								<figure class="site-sample site-sample--invalid">
									<figcaption class="site-sample__label">Flagged example</figcaption>
									<pre
										class="site-sample__text"
										lang={check.language}
										dir={check.language === 'ar' ? 'rtl' : undefined}>{check.invalid}</pre>
								</figure>
								<p>{check.explanation}</p>
								<figure class="site-sample site-sample--valid">
									<figcaption class="site-sample__label">Accepted by this check</figcaption>
									<pre
										class="site-sample__text"
										lang={check.language}
										dir={check.language === 'ar' ? 'rtl' : undefined}>{check.valid}</pre>
								</figure>
								{#if check.fixLabel}
									<p class="mxm-fix">Fix: {check.fixLabel}</p>
								{/if}
								<p>
									<a href={`${resolve('/(site)/guidelines/checks/[rule]', { rule: check.slug })}/`}
										>{check.title}</a
									>
									<span class="sr-only">, with trigger and fix details</span>
								</p>
							</details>
						</li>
					{/each}
				</ul>
			{/if}
			<p class="site-meta">{entry.topic} · {entry.id}</p>
		</section>
	{/each}
	<div class="site-actions">
		<a class="button" href={resolve('/workbench/')}>Check a transcription in the workbench</a>
	</div>
</main>

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
		border-radius: var(--radius-round);
		background: var(--color-fill-subtle);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-compact);
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
	.mxm-checks p {
		margin: var(--space-1) 0 0;
	}
	.mxm-fix {
		color: var(--color-text-muted);
	}
</style>
