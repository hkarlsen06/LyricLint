<script lang="ts">
	import { resolve } from '$app/paths';
	// Straight from the manifest rather than through `$lib/rules/index.js`, whose
	// barrel re-exports the engine, the registry and Harper — one version string
	// taken from it would put all of them in this page's bundle.
	import { currentRuleSet } from '$lib/rules/data/rule-set.js';
	import { siteUrl } from '$lib/seo.js';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	// The list itself is in the layout, which is what keeps it standing while the
	// reader moves between rules. What is left here is what the detail column
	// shows when no rule is open — the section's own introduction, in the same
	// slot a rule will occupy. The reference comes from the layout's server load
	// rather than from running the rules here; see `+layout.server.ts`.
	const references = $derived(data.groups.flatMap((group) => group.rules));
	const ruleCount = $derived(references.length);
	// Counted rather than written, like every other number on this page: the
	// sentence that names it is an instruction for using the chips beside it, so a
	// stale figure there would send the reader looking for rules that are not
	// there.
	const noFixCount = $derived(references.filter((reference) => !reference.fix).length);
	const pageTitle = 'Genius lyric formatting rules · LyricLint';
	const pageDescription = $derived(
		`Browse ${ruleCount} sourced Genius lyric-formatting rules for section headers, performers, spelling, punctuation, and ad-libs, each with reviewed guidance.`
	);
	const canonicalUrl = siteUrl('/rules/');
	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name: 'Genius lyric formatting rules',
		url: canonicalUrl,
		description: pageDescription,
		numberOfItems: ruleCount,
		hasPart: references.map((reference) => ({
			'@type': 'TechArticle',
			headline: reference.title,
			description: reference.seoDescription,
			url: siteUrl(`/rules/${reference.slug}/`)
		}))
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={canonicalUrl} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
</svelte:head>

<StructuredData data={structuredData} />

<main class="site-prose rules__page">
	<h1>Genius lyric formatting rules</h1>
	<p class="site-lede">
		The {ruleCount} transcription conventions LyricLint checks, exactly as its linter states them.
	</p>
	<p>
		Every rule on this list cites the Genius guideline it enforces — page, section, and the date a
		person last verified it — so you can read the source instead of taking the linter's word for it.
		Each rule's page is produced by running that rule against the example its test suite reviews, so
		the wording, the fix, and the citation you see here are the ones the workbench uses. This is
		rule set {currentRuleSet.version}.
	</p>
	<!-- No “beside this page”: the two columns stack below 62rem, so a sentence
	     that says where the list is is wrong on a phone. -->
	<p>
		Search the rule list by symptom rather than by name — a bracket, an apostrophe, or the
		misspelling itself — because each rule's examples are searched along with its guidance. The
		chips under the search field narrow by severity, and by whether LyricLint can make the change
		for you: leave <em>No automatic fix</em> on its own to see the {noFixCount} rules that are judgment
		calls.
	</p>

	<h2>Harper's proofreading is not in this set</h2>
	<p>
		Alongside these {ruleCount} rules the workbench runs
		<a href="https://writewithharper.com/" rel="external">Harper</a>, a proofreader that works
		entirely in your browser, and its findings appear in the linter beside them under
		<span class="site-code">spelling.harper</span>,
		<span class="site-code">style.harper</span> and
		<span class="site-code">grammar.harper</span>. They have no pages here, and the reason is the
		first paragraph: a rule earns one by citing a reviewed Genius guideline and by carrying an
		example a person has checked. Harper's suggestions cite Harper, and its list of them is its own
		to change. Lyrics use deliberate fragments, dialect, and repetition, so treat that group as
		proofreading to read past rather than as transcription conventions to follow.
	</p>

	<div class="site-actions">
		<a class="button" href={resolve('/lint/')}>Check a transcription in the workbench</a>
	</div>
	<p class="site-aside">
		Linting runs entirely in your browser — no account, no upload. The optional assistant above the
		index sends only the question you type it.
	</p>
</main>
