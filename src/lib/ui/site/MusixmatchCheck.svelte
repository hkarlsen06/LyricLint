<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Preserve reference query on a resolved check path. */
	import { resolve } from '$app/paths';
	import { referenceHref } from './reference-search.svelte.js';
	import GuidanceSearchHighlight from './GuidanceSearchHighlight.svelte';
	import SiteSourceFold from './SiteSourceFold.svelte';
	import type { PageData } from '../../../routes/(site)/guidelines/musixmatch/[topic]/$types.js';
	let { check }: { check: PageData['entries'][number]['checks'][number] } = $props();
</script>

{#snippet marked(text: string)}<GuidanceSearchHighlight {text} />{/snippet}

<div class="site-meta"><SiteSourceFold sources={check.sources} text={marked} /></div>
<figure class="site-sample site-sample--invalid">
	<figcaption class="site-sample__label">
		{check.severity === 'manual-review' ? 'Requires review under this check' : 'Flagged example'}
	</figcaption>
	<pre
		class="site-sample__text"
		lang={check.language}
		dir={check.language === 'ar' ? 'rtl' : undefined}><GuidanceSearchHighlight
			text={check.invalid}
		/></pre>
</figure>
<p><GuidanceSearchHighlight text={check.explanation} /></p>
{#if check.valid}
	<figure class="site-sample site-sample--valid">
		<figcaption class="site-sample__label">Accepted by this check</figcaption>
		<pre
			class="site-sample__text"
			lang={check.language}
			dir={check.language === 'ar' ? 'rtl' : undefined}><GuidanceSearchHighlight
				text={check.valid}
			/></pre>
	</figure>
{:else}
	<p>
		An empty document needs no check. This finding describes missing language-policy evidence; it
		does not assert that the example’s lyric wording is incorrect.
	</p>
{/if}
{#if check.fix?.label}
	<p class="mxm-fix">Fix: {check.fix?.label}</p>
{/if}
<p>
	<a href={referenceHref(`${resolve('/(site)/guidelines/checks/[rule]', { rule: check.slug })}/`)}
		>{check.title}</a
	>
	<span class="sr-only">, with trigger and fix details</span>
</p>

<style>
	p {
		margin: var(--space-1) 0 0;
	}
	.mxm-fix {
		color: var(--color-text-muted);
	}
</style>
