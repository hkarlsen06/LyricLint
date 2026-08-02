<script lang="ts">
	import { resolve } from '$app/paths';
	// Straight from the manifest rather than through `$lib/rules/index.js`, whose
	// barrel re-exports the engine, the registry and Harper — one version string
	// taken from it would put all of them in this page's bundle. `reference-guide`
	// is safe for the same reason in reverse: it is a `Record` of strings and
	// imports nothing at all.
	import { currentRuleSet } from '$lib/rules/data/rule-set.js';
	import { groupGuidance } from '$lib/rules/reference-guide.js';
	import { ruleIndexEntries } from '$lib/rules/reference-search.js';
	import type { RuleReferenceGroup } from '$lib/rules/reference.js';
	import { siteUrl } from '$lib/seo.js';
	import { codeSegments } from '$lib/ui/site/code-segments.js';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	/**
	 * The detail column at `/rules/` is the guide, and that is a correction.
	 *
	 * It used to be a page *about* the list: how the reference is derived, how to
	 * use the search field, which chips narrow what. All true, and all written
	 * for a reader who already knew what they were looking for — while the one
	 * this section actually has to serve arrives from the landing page not
	 * knowing the conventions at all, and was handed 55 checks and an explanation
	 * of the filtering.
	 *
	 * So the conventions are the content now, one section per family, with the
	 * rules under each as the ways it goes wrong. The finder is still beside this
	 * column and needs no instructions: a search field whose placeholder counts
	 * the rules is not a control anybody has to be taught.
	 */
	const references = $derived(data.groups.flatMap((group) => group.rules));
	const ruleCount = $derived(references.length);
	const pageTitle = 'Genius lyric formatting rules · LyricLint';
	const pageDescription = $derived(
		`How Genius transcriptions are formatted — section headers, performer legends, spelling, punctuation, ad-libs and unknown lyrics — each convention with the ${ruleCount} sourced checks LyricLint runs against it.`
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

	/**
	 * A family's checks, collapsed exactly as the list beside this column
	 * collapses them. Eight of the spelling rules are one rule per language pack,
	 * and spelling them out here would put the same eight near-identical names in
	 * the guide that `ruleIndexEntries` exists to keep out of the index.
	 */
	function checksFor(group: RuleReferenceGroup) {
		return ruleIndexEntries(group.rules);
	}

	/**
	 * The punctuation between the checks, as values rather than as markup.
	 *
	 * Two things it is not, and both were tried. Written as whitespace in the
	 * template it is at the mercy of the formatter — the first version read
	 * `standardizes· A spelling`, with the space on the wrong side of the
	 * interpunct, because a line break landed after the `</a>` rather than
	 * before the separator, and the run below is wrapped tightly enough that
	 * this will happen again. Written as a `::before` it is worse: the brackets
	 * around the language packs were generated content for one round, which
	 * draws them for a reader with eyes and leaves `correctEnglish, Norwegian`
	 * for a screen reader. Punctuation separating two facts is content.
	 *
	 * Constants rather than string literals in the mustaches because those are
	 * `svelte/no-useless-mustaches`, and the rule is right about the general
	 * case: a literal in a mustache is usually a literal in the wrong place.
	 * Here it is the one place the whitespace has to survive a reformat.
	 */
	const punctuation = { between: ' · ', open: ' (', comma: ', ', close: ')' };
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

<main class="site-prose rules__page rules__guide">
	<h1>Genius lyric formatting rules</h1>
	<p class="site-lede">
		How a Genius transcription is formatted, one convention at a time — and the {ruleCount} checks LyricLint
		runs against them.
	</p>
	<p>
		Each convention below states what to do. Under it are the ways it goes wrong, which is what the
		linter actually looks for: press one to see the reviewed example that produces it, the exact
		wording the workbench uses, whether the change can be made for you, and the Genius guideline it
		cites — page, section, and the date a person last verified it. Every rule page is produced by
		running that rule against the example its test suite reviews, so none of it is a description of
		the linter written alongside it. This is rule set {currentRuleSet.version}.
	</p>
	<p class="site-aside">
		Where LyricLint checks something the Genius guidance does not actually state, the convention
		says so and the rule's own page says so again. A guide that presented our preferences as
		somebody else's policy would be worth less than no guide at all.
	</p>

	<!-- One section per family, in the index's own order — most-consulted first,
	     which is `groupOrder` in `reference.ts` rather than anything decided here.
	     The two columns therefore run in the same order, so a reader moving
	     between them is never re-orienting. -->
	{#each data.groups as group (group.group)}
		<h2 id={group.group}>{group.title}</h2>
		<p>
			{#each codeSegments(groupGuidance[group.group] ?? '') as segment, part (part)}
				{#if segment.code}<span class="site-code">{segment.text}</span>{:else}{segment.text}{/if}
			{/each}
		</p>
		<!-- The checks as an interpunct-separated run rather than a bulleted list.
		     The titles are failure-shaped now, so read along a line they are the
		     ways this convention goes wrong; a bullet apiece would make nineteen
		     short lists out of something meant to be read as prose with links in
		     it, and would repeat the column standing beside it. -->
		<p class="rules__checks">
			{#each checksFor(group) as entry, index (entry.kind === 'rule' ? entry.rule.id : entry.family)}
				{#if index > 0}<span class="site-meta__separator" aria-hidden="true"
						>{punctuation.between}</span
					>{/if}{#if entry.kind === 'rule'}<a
						href={resolve('/(site)/rules/[rule]', { rule: entry.rule.slug })}>{entry.rule.title}</a
					>{:else}<span class="rules__checks-family"
						>{entry.family}{punctuation.open}{#each entry.rules as rule, at (rule.id)}{#if at > 0}{punctuation.comma}{/if}<a
								href={resolve('/(site)/rules/[rule]', { rule: rule.slug })}
								>{rule.variant?.language ?? rule.title}</a
							>{/each}{punctuation.close}</span
					>{/if}
			{/each}
		</p>
	{/each}

	<h2 id="harper">Harper's proofreading is not in this set</h2>
	<p>
		Alongside these {ruleCount} rules the workbench runs
		<a href="https://writewithharper.com/" rel="external">Harper</a>, a proofreader that works
		entirely in your browser, and its findings appear in the linter beside them under
		<span class="site-code">spelling.harper</span>,
		<span class="site-code">style.harper</span> and
		<span class="site-code">grammar.harper</span>. They have no pages here, and the reason is the
		one that gives every rule above a citation: a rule earns a page by citing a reviewed Genius
		guideline and by carrying an example a person has checked. Harper's suggestions cite Harper, and
		its list of them is its own to change. Lyrics use deliberate fragments, dialect, and repetition,
		so treat that group as proofreading to read past rather than as transcription conventions to
		follow.
	</p>

	<div class="site-actions">
		<a class="button" href={resolve('/lint/')}>Check a transcription in the workbench</a>
	</div>
	<p class="site-aside">
		Linting runs entirely in your browser — no account, no upload. The optional assistant above the
		index sends only the question you type it.
	</p>
</main>
