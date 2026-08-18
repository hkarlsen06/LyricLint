<script lang="ts">
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
	import AssistantSpark from '$lib/ui/assistant/AssistantSpark.svelte';
	import { revealRow, revealSelectedRow } from './reveal-selected.js';
	import { hoveredRuleSlug } from './rule-hover.svelte.js';
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

	/*
	 * The narrowing said out loud, for the reader who cannot watch the rows go.
	 *
	 * It is a region of its own rather than a role on the visible readout,
	 * because that readout is drawn only while something narrows the list — and
	 * an element inserted already carrying its text is an addition to the
	 * accessibility tree rather than a change inside a live region, which most
	 * screen readers do not announce. So the one narrowing worth hearing, the
	 * first, was the one that went unsaid. Mounted empty and filled, exactly as
	 * `AssistantConversation.svelte` states at length.
	 *
	 * Clearing the filters is the other half, and it is why the text does not go
	 * back to empty: emptying a live region announces nothing, so returning to
	 * the whole list has to be a sentence of its own. The flag is what keeps the
	 * region silent until the reader has narrowed something — at rest there is
	 * no change to report.
	 */
	let hasFiltered = $state(false);
	$effect(() => {
		if (filtering) hasFiltered = true;
	});
	const filterStatus = $derived(
		!hasFiltered ? '' : filtering ? `${shown} of ${total} rules` : `All ${total} rules`
	);

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
	 * it here. The reveal is `reveal-selected.ts`, shared with the guidance
	 * catalog's index; the one thing this column adds is which of two current
	 * rows wins — a popular rule is marked twice, and `querySelector` finds the
	 * popular copy first, which is already at the top of the column, so a deep
	 * link to one of the six scrolls nothing and is marked immediately.
	 */
	export async function revealSelected(): Promise<void> {
		await revealSelectedRow(column);
	}

	/**
	 * The guide's check links are these rows in another shape, so a pointer
	 * resting on one lights its row here and brings it into the column. The
	 * mark is immediate, exactly as a hover is; the scroll waits a beat,
	 * because the run is a paragraph of links and a pointer crossing it on the
	 * way somewhere else would otherwise drag the list through every rule it
	 * passed. Where the hovered rule is popular its popular copy is found
	 * first, which is already at the top of the column — the same arbitration
	 * `revealSelected` describes.
	 */
	const hovered = $derived(hoveredRuleSlug());
	const hoverRevealDelay = 150;
	$effect(() => {
		if (hovered === undefined) return;
		const timer = setTimeout(
			() => revealRow(column, column?.querySelector<HTMLElement>('a[data-hovered]')),
			hoverRevealDelay
		);
		return () => clearTimeout(timer);
	});

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

<div class="site-split__index" data-sveltekit-noscroll bind:this={column}>
	<!-- The finder rides the top of the column rather than scrolling away with the
	     rows: on a wide screen this column is its own scroll port, and a field
	     fifty rows above the reader is a field they have to travel back to. It is
	     `--color-canvas` because that is the page it is pinned over — the rows are
	     `--color-surface` and pass underneath it. The struck-through sparkles at
	     the field's end is the assistant's toggle; the spark owns the row, and
	     this component only supplies its own search field. -->
	<search class="site-finder">
		<label class="sr-only" for="rules-search">Search the formatting rules</label>
		<AssistantSpark prompt="Ask about the formatting rules">
			{#snippet search()}
				<input
					id="rules-search"
					class="site-finder__search"
					type="search"
					autocomplete="off"
					spellcheck="false"
					placeholder={`Search ${total} rules`}
					bind:value={ruleSearchQuery, setRuleSearchQuery}
					onkeydown={onFieldKeydown}
				/>
			{/snippet}
		</AssistantSpark>

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
		<div class="site-finder__chips" role="group" aria-label="Filter rules by severity">
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

		<div class="site-finder__chips" role="group" aria-label="Filter rules by available fix">
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

		<!-- The readout draws only while something is narrowing the list: `N of N
		     rules` under a field nobody has typed in is a count that could not have
		     been otherwise, and the lede beside this column already says how many
		     there are. What hands that count to a screen reader is the region
		     below, not a role on this line — a line that comes and goes carries its
		     text in with it, which a live region does not announce. -->
		{#if filtering}
			<p class="site-finder__readout">
				<span>{shown} of {total} rules</span>
				<button type="button" class="button button--quiet site-finder__clear" onclick={clear}>
					Clear filters
				</button>
			</p>
		{/if}

		<span class="sr-only" role="status">{filterStatus}</span>
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
				data-hovered={rule.slug === hovered ? '' : undefined}
			>
				<!-- The rule's name leads, and what the linter actually says about
				     it sits underneath as the example. The other way round — which
				     is how this list read for a long time — makes fifty-two rows of
				     occurrence-specific messages, so the index of a reference
				     scanned as a dump of somebody else's diagnostics. -->
				<span class="site-run__title">{rule.title}</span>
				<span class="site-run__message">{rule.message}</span>
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
			<p class="site-run__message">
				One rule per language pack, each citing that language's own reviewed source.
			</p>
			<ul class="rules__languages">
				{#each rules as rule (rule.id)}
					<li>
						<a
							href="{resolve('/(site)/rules/[rule]', { rule: rule.slug })}/"
							aria-current={rule.slug === selectedSlug ? 'page' : undefined}
							data-hovered={rule.slug === hovered ? '' : undefined}
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
			<h2 class="site-index__group">Popular</h2>
			<ul class="site-run rules__popular">
				{#each popular as rule (rule.id)}
					{@render row(rule)}
				{/each}
			</ul>
		{/if}

		{#each filtered as group (group.title)}
			<h2 class="site-index__group">{group.title}</h2>
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
			<p class="site-index__empty">
				{#if shownSeverities.length === 0 || shownFixabilities.length === 0}
					Every severity or every fix kind is switched off, so there is nothing left to list.
				{:else}
					No rule matches this search.
				{/if}
			</p>
		{/if}
	</nav>
</div>
