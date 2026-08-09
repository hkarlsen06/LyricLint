<script lang="ts">
	import { ExternalLink } from 'lucide-svelte';
	import type { SourceReference } from '$lib/core/types.js';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import { safeExternalUrl } from './source-url.js';

	let { source }: { source: SourceReference } = $props();

	const safeUrl = $derived(safeExternalUrl(source.url));
	const describedBy = $derived(`source-citation-${source.id}`);

	// The tooltip is positioned as a fixed overlay measured from the link, not as
	// an absolute child of it: the citation sits inside the panel's scroller and
	// inside the editor popover's own scroller, either of which would clip a box
	// that stayed in flow.
	let open = $state(false);
	let position = $state<string | undefined>();
	let anchor = $state<HTMLElement>();

	function place(): void {
		const rect = anchor?.getBoundingClientRect();
		if (!rect) return;
		const left = Math.max(8, Math.min(rect.left, window.innerWidth - 8 - 260));
		position = `left: ${left}px; top: ${rect.bottom + 6}px;`;
	}

	function show(): void {
		place();
		open = true;
	}

	function hide(): void {
		open = false;
	}
</script>

<!--
	The citation as it appears on a diagnostic's meta line: the source's title as a
	link, and nothing else on the line. What used to sit under it in the card's
	footer — which part of the page was cited, and when it was last verified — is
	the tooltip, because it is what a reader checks before following the link, not
	something they need in front of them on every card.
-->
<span class="source-citation" bind:this={anchor}>
	{#if safeUrl}
		<!--
			The link itself opens the tooltip, on hover and on focus alike: the
			keyboard reaches this the same way the pointer does. Escape closes it
			without leaving the link, and stops there rather than bubbling into the
			popover the citation may be sitting in — one Escape, one surface.
		-->
		<!-- The href is an external citation vetted by `safeExternalUrl`, not an app
		     route, so there is nothing for `resolve()` to resolve. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={safeUrl}
			target="_blank"
			rel="noopener noreferrer"
			aria-describedby={describedBy}
			onpointerenter={show}
			onpointerleave={hide}
			onfocus={show}
			onblur={hide}
			onkeydown={(event) => {
				if (event.key === 'Escape' && open) {
					event.stopPropagation();
					hide();
				}
			}}
		>
			{source.pageTitle}
			<ExternalLink
				class="source-citation__external"
				aria-hidden="true"
				size={11}
				strokeWidth={2.2}
			/>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{:else}
		<!-- A citation whose URL is not a web address is not a link, so there is
		     nothing to hover and no tooltip: its description stays in the
		     accessible tree alone. -->
		<span class="source-citation__label" aria-describedby={describedBy}>{source.pageTitle}</span>
	{/if}

	<!--
		The description is in the accessible tree whether or not the tooltip is on
		screen, so a screen reader gets it from `aria-describedby` without having to
		produce a hover it cannot produce. The visible tooltip is therefore the same
		text drawn again, and is hidden from assistive technology to keep it from
		being announced twice.
	-->
	<span class="sr-only" id={describedBy}>
		{source.sectionTitle}. Verified {source.lastVerifiedAt}.
	</span>

	{#if open}
		<span
			class="source-tooltip"
			style={position}
			aria-hidden="true"
			{@attach dismissOnOutside(hide)}
		>
			<span class="source-tooltip__section">{source.sectionTitle}</span>
			<span class="source-tooltip__verified">
				verified <time datetime={source.lastVerifiedAt}>{source.lastVerifiedAt}</time>
			</span>
		</span>
	{/if}
</span>
