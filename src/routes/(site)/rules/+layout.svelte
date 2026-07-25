<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SeverityTag from '$lib/diagnostics/SeverityTag.svelte';
	import { groupedRuleReferences } from '$lib/rules/reference.js';

	let { children } = $props();

	// Built once at prerender time, and — because it lives in the layout rather
	// than the index page — mounted once for the whole section. That is the
	// difference this file exists to make: pressing a row swaps the column beside
	// the list instead of tearing the list down and building it again.
	const groups = groupedRuleReferences();

	const indexHref = resolve('/rules/');
	const indexPath = indexHref.replace(/\/$/, '');

	const selectedSlug = $derived(page.params.rule);

	// Whether the reader reached this rule by pressing a row. Only then is the
	// list a real entry behind this one in history, and only then can going back
	// be what returns to it — with the scroll position they left it at, which the
	// router restores for a popped entry and a fresh navigation throws away.
	// Opening a rule directly, from a search result or a shared link, has nothing
	// behind it and has to be sent to the list the ordinary way.
	let arrivedFromIndex = $state(false);

	afterNavigate((navigation) => {
		arrivedFromIndex =
			navigation.type === 'link' && navigation.from?.url.pathname.replace(/\/$/, '') === indexPath;

		// A popped entry has a scroll position of its own and the router has just
		// restored it. That is the whole mechanism behind the control above, so
		// nothing here may overwrite it.
		if (navigation.type === 'popstate') return;

		// Neither column unmounts, so both arrive carrying the offset of the rule
		// before this one — and the two want opposite things. The detail column
		// changed, so it goes to its top. The list did not: its offset is the
		// reader's place in it, and moving it is exactly what pressing a row must
		// not do, which is why the nav below is `data-sveltekit-noscroll`.
		//
		// Unless there is only one column, and then the document is the scroller
		// and the document is what changed. Whether the detail is a scroll port of
		// its own is the honest question to ask about that: the media query in
		// `site.css` is what flips it, so this reads the layout in force rather
		// than restating its breakpoint here in a second place.
		const detail = document.querySelector<HTMLElement>('.rules__detail');
		if (!detail) return;
		detail.scrollTop = 0;
		if (getComputedStyle(detail).overflowY === 'visible') {
			window.scrollTo(0, 0);
		}
	});

	function showIndex(): void {
		if (arrivedFromIndex) {
			history.back();
		} else {
			void goto(indexHref);
		}
	}
</script>

<!-- Master and detail, in the workbench's own arrangement: the thing you are
     working through on the left, the thing you are reading on the right. The
     detail column is first in the DOM because it holds the `<main>` and the
     page's `<h1>`, and the list is a `<nav>` of every rule in the set — which
     would otherwise stand between a reader and the document they opened. The
     grid areas put it back on the left visually. -->
<div class="rules" data-view={selectedSlug ? 'rule' : 'index'}>
	<div class="rules__detail">
		{#if selectedSlug}
			<!-- Narrow screens only, where the list is not on screen to return to.
			     It goes back rather than forward to a fresh `/rules`, so the reader
			     lands on the row they pressed instead of at the top of the list. -->
			<button class="button button--quiet rules__back" type="button" onclick={showIndex}>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="15"
					height="15"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				>
					<path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
				</svg>
				All rules
			</button>
		{/if}

		{@render children()}
	</div>

	<!-- Pressing a row may not move the list the row is in. Where the two columns
	     sit side by side the document scroll *is* the list's position, and the
	     router's default reset would throw the reader back to the top of it every
	     time they opened a rule; where there is one column, `afterNavigate` above
	     pays the reset back by hand. -->
	<nav class="rules__index" aria-label="All formatting rules" data-sveltekit-noscroll>
		{#each groups as group (group.title)}
			<h2 class="rules__group">{group.title}</h2>
			<ul class="site-run">
				{#each group.rules as rule (rule.id)}
					<li>
						<a
							href={resolve('/(site)/rules/[rule]', { rule: rule.slug })}
							aria-current={rule.slug === selectedSlug ? 'page' : undefined}
						>
							<span class="site-run__title">{rule.message}</span>
							<span class="site-run__meta">
								<SeverityTag severity={rule.severity} />
								<span class="site-code">{rule.id}</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/each}
	</nav>
</div>
