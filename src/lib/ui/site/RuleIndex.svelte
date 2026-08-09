<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import type { Fixability, Severity } from '$lib/core/types.js';
	import SeverityIcon from '$lib/diagnostics/SeverityIcon.svelte';
	import SeverityTag from '$lib/diagnostics/SeverityTag.svelte';
	import {
		countRules,
		filterRuleGroups,
		fixabilityLabel,
		fixabilityOrder,
		isFiltering,
		popularRules,
		presentFacets,
		ruleCounts,
		ruleFixability,
		ruleIndexEntries,
		severityOrder
	} from '$lib/rules/reference-search.js';
	import type { RuleReference, RuleReferenceGroup } from '$lib/rules/reference.js';
	import AssistantPrompt from '$lib/ui/assistant/AssistantPrompt.svelte';
	import { ruleSearchQuery, setRuleSearchQuery } from './rule-search.svelte.js';

	let {
		groups,
		selectedSlug
	}: { groups: readonly RuleReferenceGroup[]; selectedSlug?: string | undefined } = $props();

	// The list and its filters outlive opening a rule: a reader who searched,
	// pressed a row, and came back finds the search they were in the middle of
	// rather than a list reset behind their back. That is also why none of it is
	// in the URL — a filter is a way of looking at the list, not a place, and a
	// history entry per keystroke would make the back button walk the query
	// backwards one letter at a time.
	//
	// The query is the one part of it held outside this component, because the
	// rule the reader opens marks what they searched for and there is no way for
	// a list to hand anything to its sibling column. `rule-search.svelte.ts` has
	// the rest of that reasoning. The chips stay here: they narrow the list and
	// say nothing about the page beside it. The field binds to the pair of
	// functions rather than to a local mirror, or the two copies disagree for
	// exactly as long as it takes an effect to run.
	const query = $derived(ruleSearchQuery());
	let shownSeverities = $state<Severity[]>([...severityOrder]);
	let shownFixabilities = $state<Fixability[]>([...fixabilityOrder]);

	const total = $derived(countRules(groups));
	const facets = $derived(presentFacets(groups));
	const filter = $derived({
		query,
		severities: shownSeverities,
		fixabilities: shownFixabilities
	});
	const filtered = $derived(filterRuleGroups(groups, filter));
	const shown = $derived(countRules(filtered));
	const counts = $derived(ruleCounts(groups, query));
	const filtering = $derived(isFiltering(filter));
	// Only at rest: a search is the reader saying what they are looking for, and
	// six rows of shortcut standing over their answer are six rows of noise.
	const popular = $derived(filtering ? [] : popularRules(groups));

	const severityLabels: Record<Severity, string> = {
		error: 'Errors',
		warning: 'Warnings',
		suggestion: 'Suggestions',
		'manual-review': 'Manual review'
	};

	/**
	 * Whether a collapsed family can state one severity and one fix kind for all
	 * of its members. Where they disagree the row states neither, rather than
	 * printing the first member's answer over the rest.
	 */
	function sharedMeta(rules: readonly RuleReference[]): boolean {
		return rules.every(
			(rule) =>
				rule.severity === rules[0]!.severity && ruleFixability(rule) === ruleFixability(rules[0]!)
		);
	}

	function toggle<T>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
	}

	function clear(): void {
		setRuleSearchQuery('');
		shownSeverities = [...severityOrder];
		shownFixabilities = [...fixabilityOrder];
	}

	let column = $state<HTMLElement>();

	/**
	 * Bring the open rule's row into the column, for a reader who did not press
	 * it here.
	 *
	 * A rule is a URL, so most arrivals are not presses on this list: a shared
	 * link, a search result, a reload, a link from elsewhere on the site. The row
	 * is marked `aria-current` and drawn recessed the whole time, which is the
	 * whole of the "you are here" — and forty rows above the fold it says that to
	 * nobody. The column then reads as a list with nothing selected in it, beside
	 * a page that came from one of its rows.
	 *
	 * Two things it owes, and the second is why this is arithmetic rather than
	 * `scrollIntoView`:
	 *
	 * - **A row already wholly in view is not moved.** The layout only calls this
	 *   for an arrival, and this is the second half of the same guarantee — the
	 *   rule that pressing a row may not move the list the row is in.
	 * - **The finder is pinned over the top of this column**, so a row the browser
	 *   would call visible can be entirely underneath it. `block: 'nearest'` knows
	 *   nothing about that and would leave the row covered; the free space starts
	 *   at the finder's own bottom edge, and it is measured rather than restated
	 *   here, because the chips wrap and the readout comes and goes.
	 *
	 * It moves the scroll and not the focus. The reader opened a rule to read it,
	 * and focus parked in a `<nav>` of fifty-five links would send their first Tab
	 * away from the document they came for — the same reason the workbench leaves
	 * the editor unfocused after a fix.
	 */
	export async function revealSelected(): Promise<void> {
		await tick();
		const list = column;
		const row = list?.querySelector<HTMLElement>('a[aria-current="page"]');
		// No row at all under a filter that excludes it, and no box below 62rem,
		// where the columns stack and the list is `display: none` while a rule is
		// open. Neither is a failure: there is nothing on screen to bring into view.
		if (!list || !row || row.offsetParent === null) return;

		const port = list.getBoundingClientRect();
		const finder = list.querySelector<HTMLElement>('.rules__finder');
		const free = port.top + (finder?.getBoundingClientRect().height ?? 0);
		const rect = row.getBoundingClientRect();
		if (rect.top >= free && rect.bottom <= port.bottom) return;
		// Instant, and clamped by the scroller itself at both ends. A smooth scroll
		// here would still be animating while the reader started reading.
		list.scrollTop += rect.top - free;
	}

	// Escape empties the field, which is the one convention a search input owes
	// and the only way out this surface needs: nothing here is pending, and the
	// readout below carries `Clear everything` for the state the chips can also be
	// in. It stops there rather than moving focus — the reader is still typing.
	function onFieldKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || query === '') return;
		event.preventDefault();
		setRuleSearchQuery('');
	}
</script>

<div class="rules__index" data-sveltekit-noscroll bind:this={column}>
	<!-- The way to ask a model about the guidelines, above the way to search
	     them: unboxed prose and a field, and only in builds that actually have
	     an assistant endpoint behind it. -->
	<AssistantPrompt />
	<!-- The finder rides the top of the column rather than scrolling away with the
	     rows: on a wide screen this column is its own scroll port, and a field
	     fifty rows above the reader is a field they have to travel back to. It is
	     `--color-canvas` because that is the page it is pinned over — the rows are
	     `--color-surface` and pass underneath it. -->
	<search class="rules__finder">
		<label class="sr-only" for="rules-search">Search the formatting rules</label>
		<input
			id="rules-search"
			class="rules__search"
			type="search"
			autocomplete="off"
			spellcheck="false"
			placeholder={`Search ${total} rules`}
			bind:value={ruleSearchQuery, setRuleSearchQuery}
			onkeydown={onFieldKeydown}
		/>

		<!--
			Two axes, one chip idiom, and the linter panel's own semantics: a pressed
			chip is a kind of rule the reader is looking at, and unpressing one strikes
			its label through to say it is excluded. The two rows are separate groups
			because they combine differently — a rule has to survive both — and a
			single wrapping row of seven chips would state that as nothing at all.

			The fix axis is three chips rather than one “only rules with a fix”
			toggle, and the reason is the shared visual: unpressed reads as excluded,
			so a struck-through `Fixes automatically` would say the opposite of what
			turning it off means. As three shown/hidden chips it also answers the
			better question — keep `No automatic fix` alone and the list is every rule
			that needs your judgment.
		-->
		<div class="rules__chips" role="group" aria-label="Filter rules by severity">
			{#each facets.severities as severity (severity)}
				<button
					type="button"
					class="filter-chip filter-chip--{severity}"
					aria-pressed={shownSeverities.includes(severity)}
					onclick={() => (shownSeverities = toggle(shownSeverities, severity))}
				>
					<SeverityIcon {severity} />
					{severityLabels[severity]}
					<span class="filter-chip__count">{counts.severity[severity]}</span>
				</button>
			{/each}
		</div>

		<div class="rules__chips" role="group" aria-label="Filter rules by available fix">
			{#each facets.fixabilities as fixability (fixability)}
				<button
					type="button"
					class="filter-chip"
					aria-pressed={shownFixabilities.includes(fixability)}
					onclick={() => (shownFixabilities = toggle(shownFixabilities, fixability))}
				>
					{fixabilityLabel(fixability)}
					<span class="filter-chip__count">{counts.fixability[fixability]}</span>
				</button>
			{/each}
		</div>

		<!-- The readout draws only while something is narrowing the list: `52 of 52
		     rules` under a field nobody has typed in is a count that could not have
		     been otherwise, and the lede beside this column already says how many
		     there are. `role="status"` is what hands the narrowing to a screen
		     reader, which cannot see the rows disappear. -->
		{#if filtering}
			<p class="rules__readout">
				<span role="status">{shown} of {total} rules</span>
				<button type="button" class="button button--quiet rules__clear" onclick={clear}>
					Clear filters
				</button>
			</p>
		{/if}
	</search>

	<!-- Pressing a row may not move the list the row is in. Where the two columns
	     sit side by side the document scroll *is* the list's position, and the
	     router's default reset would throw the reader back to the top of it every
	     time they opened a rule; where there is one column, the layout's
	     `afterNavigate` pays the reset back by hand. -->
	<!-- One row, rendered by both lists. The popular block is the same rows drawn
	     again, so a snippet is what keeps it from becoming a second copy of the
	     row's markup that drifts from this one. -->
	{#snippet row(rule: RuleReference)}
		<li>
			<!-- The appended slash is load-bearing: `resolve` interpolates the route
			     pattern and knows nothing about `trailingSlash: 'always'`, so the bare
			     result is a URL every visit 301s away from — which is also what kept
			     Search Console from crediting any rule page as an internal-link
			     target. Canonicals and the sitemap already carry the slash. -->
			<a
				href="{resolve('/(site)/rules/[rule]', { rule: rule.slug })}/"
				aria-current={rule.slug === selectedSlug ? 'page' : undefined}
			>
				<!-- The rule's name leads, and what the linter actually says about
				     it sits underneath as the example. The other way round — which
				     is how this list read for a long time — makes fifty-two rows of
				     occurrence-specific messages, so the index of a reference
				     scanned as a dump of somebody else's diagnostics. -->
				<span class="site-run__title">{rule.title}</span>
				<span class="rules__row-message">{rule.message}</span>
				<span class="site-run__meta">
					<SeverityTag severity={rule.severity} />
					<span class="site-code">{rule.id}</span>
					<span>{fixabilityLabel(ruleFixability(rule))}</span>
				</span>
			</a>
		</li>
	{/snippet}

	<!-- One convention, one row, and its language packs as the links.
	     `ruleIndexEntries` has the reasoning; what this markup owes is that the
	     open rule is still marked, which it is because the marker lives on the
	     link rather than on the row.

	     The meta line is drawn only where every member agrees, which today they
	     all do — eight `suggestion` rules with a previewed fix. A family whose
	     members disagreed would be stating one member's severity over all of
	     them, so it states none and the reader finds it on the page they open. -->
	{#snippet family(title: string, rules: RuleReference[])}
		<li class="rules__family">
			<p class="site-run__title">{title}</p>
			<p class="rules__row-message">
				One rule per language pack, each citing that language's own reviewed source.
			</p>
			<ul class="rules__languages">
				{#each rules as rule (rule.id)}
					<li>
						<a
							href="{resolve('/(site)/rules/[rule]', { rule: rule.slug })}/"
							aria-current={rule.slug === selectedSlug ? 'page' : undefined}
						>
							{rule.variant?.language ?? rule.title}
						</a>
					</li>
				{/each}
			</ul>
			{#if sharedMeta(rules)}
				<p class="site-run__meta">
					<SeverityTag severity={rules[0]!.severity} />
					<span>{fixabilityLabel(ruleFixability(rules[0]!))}</span>
				</p>
			{/if}
		</li>
	{/snippet}

	<nav aria-label="All formatting rules">
		<!-- The six conventions a transcriber has to be told, before the nineteen
		     families. Both copies of the open rule's row carry `aria-current`: they
		     are the same link to the same page, and a shortcut that refused the
		     marker would be the one row in this column where "you are here" is
		     false. -->
		{#if popular.length > 0}
			<h2 class="rules__group">Popular</h2>
			<ul class="site-run rules__popular">
				{#each popular as rule (rule.id)}
					{@render row(rule)}
				{/each}
			</ul>
		{/if}

		{#each filtered as group (group.title)}
			<h2 class="rules__group">{group.title}</h2>
			<ul class="site-run">
				{#each ruleIndexEntries(group.rules) as entry (entry.kind === 'rule' ? entry.rule.id : entry.family)}
					{#if entry.kind === 'rule'}
						{@render row(entry.rule)}
					{:else}
						{@render family(entry.family, entry.rules)}
					{/if}
				{/each}
			</ul>
		{/each}

		<!-- Prose on the canvas, not a box: a single centred card in an empty column
		     separates its contents from nothing. The way out is the readout's own
		     `Clear filters` directly above, so this says what happened and stops. -->
		{#if shown === 0}
			<p class="rules__empty">
				{#if shownSeverities.length === 0 || shownFixabilities.length === 0}
					Every severity or every fix kind is switched off, so there is nothing left to list.
				{:else}
					No rule matches this search.
				{/if}
			</p>
		{/if}
	</nav>
</div>
