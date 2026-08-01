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
		presentFacets,
		ruleCounts,
		ruleFixability,
		severityOrder
	} from '$lib/rules/reference-search.js';
	import type { RuleReferenceGroup } from '$lib/rules/reference.js';
	import AssistantPrompt from '$lib/ui/assistant/AssistantPrompt.svelte';

	let {
		groups,
		selectedSlug
	}: { groups: readonly RuleReferenceGroup[]; selectedSlug?: string | undefined } = $props();

	// The list and its filters are mounted by the section's layout, so this state
	// outlives opening a rule: a reader who searched, pressed a row, and came back
	// finds the search they were in the middle of rather than a list reset behind
	// their back. That is also why none of it is in the URL — a filter is a way of
	// looking at the list, not a place, and a history entry per keystroke would
	// make the back button walk the query backwards one letter at a time.
	let query = $state('');
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

	const severityLabels: Record<Severity, string> = {
		error: 'Errors',
		warning: 'Warnings',
		suggestion: 'Suggestions',
		'manual-review': 'Manual review'
	};

	function toggle<T>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
	}

	function clear(): void {
		query = '';
		shownSeverities = [...severityOrder];
		shownFixabilities = [...fixabilityOrder];
	}

	// Escape empties the field, which is the one convention a search input owes
	// and the only way out this surface needs: nothing here is pending, and the
	// readout below carries `Clear everything` for the state the chips can also be
	// in. It stops there rather than moving focus — the reader is still typing.
	function onFieldKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || query === '') return;
		event.preventDefault();
		query = '';
	}
</script>

<div class="rules__index" data-sveltekit-noscroll>
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
			bind:value={query}
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
	<nav aria-label="All formatting rules">
		{#each filtered as group (group.title)}
			<h2 class="rules__group">{group.title}</h2>
			<ul class="site-run">
				{#each group.rules as rule (rule.id)}
					<li>
						<a
							href={resolve('/(site)/rules/[rule]', { rule: rule.slug })}
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
