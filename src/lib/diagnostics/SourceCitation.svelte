<script lang="ts">
	import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOutIcon';
	import type { Snippet } from 'svelte';
	import type { SourceReference } from '$lib/core/types.js';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import { sourceFavicon } from './source-favicons.js';
	import { safeExternalUrl } from './source-url.js';

	/**
	 * How the title is drawn, for a surface with something to say about it,
	 * matching `SourceLink.svelte`'s own arrangement, for its reason: the guidance topic
	 * pages search their citations along with everything else, so the page a
	 * search opens has to be able to mark the words that matched, and this
	 * component may not reach for the marker itself because the linter's popover
	 * draws it too. The surfaces that know no query simply get the text.
	 */
	let { source, text }: { source: SourceReference; text?: Snippet<[string]> | undefined } =
		$props();

	const safeUrl = $derived(safeExternalUrl(source.url));
	const favicon = $derived(sourceFavicon(source.url));
	const describedBy = $derived(`source-citation-${source.id}`);

	// The tooltip is positioned as a fixed overlay measured from the link, not as
	// an absolute child of it: the citation sits inside the panel's scroller and
	// inside the editor popover's own scroller, either of which would clip a box
	// that stayed in flow.
	let open = $state(false);
	let position = $state<string | undefined>();
	let anchor = $state<HTMLElement>();

	// Above the link, not below it. Below was where it began, and in the
	// unfolded sources list, where citations stack one per row, a box under the
	// hovered link landed exactly on the next citation, hiding the very link
	// the pointer was travelling to. Above, it can only cover text already
	// read. `translateY(-100%)` does the height arithmetic, so nothing has to
	// measure a box that has not rendered yet; the one case with no room above
	// is a link near the viewport's own top edge, which falls back to below,
	// where by construction there is nothing stacked under it to hide.
	const clearanceAbove = 96;

	function place(): void {
		const rect = anchor?.getBoundingClientRect();
		if (!rect) return;
		const left = Math.max(8, Math.min(rect.left, window.innerWidth - 8 - 260));
		position =
			rect.top < clearanceAbove
				? `left: ${left}px; top: ${rect.bottom + 6}px;`
				: `left: ${left}px; top: ${rect.top - 6}px; translate: 0 -100%;`;
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
	footer (which part of the page was cited, and when it was last verified) is
	the tooltip, because it is what a reader checks before following the link, not
	something they need in front of them on every card.
-->
{#snippet plain(value: string)}{value}{/snippet}

<span class="source-citation" bind:this={anchor}>
	{#if safeUrl}
		<!--
			The link itself opens the tooltip, on hover and on focus alike: the
			keyboard reaches this the same way the pointer does. Escape closes it
			without leaving the link, and stops there rather than bubbling into the
			popover the citation may be sitting in: one Escape, one surface.
		-->
		<!-- The href is an external citation vetted by `safeExternalUrl`, not an app
		     route, so there is nothing for `resolve()` to resolve. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -- safeUrl is a validated external citation, not an app route. -->
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
			<!-- The mark says where the link goes, which the title beside it already
			     says in words, is decorative, so an empty alt keeps it out of the
			     accessible name rather than announcing the source twice. -->
			{#if favicon}
				<img class="source-citation__favicon" src={favicon} alt="" />
			{/if}
			{@render (text ?? plain)(source.pageTitle)}
			<ArrowSquareOutIcon
				class="source-citation__external"
				aria-hidden="true"
				size={11}
				weight="bold"
			/><!--
				The mark above is aria-hidden, so without this the only thing saying
				the press leaves the surface is a glyph a screen reader cannot see.
				It joins the link's own *name*, which is what keeps it clear of the
				arrangement below: the description stays the tooltip's text, carried
				by `aria-describedby`. Named and described are two channels, so
				nothing is announced twice.
			--><span
				class="sr-only">(opens in a new tab)</span
			>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{:else}
		<!-- A citation whose URL is not a web address is not a link, so there is
		     nothing to hover and no tooltip: its description stays in the
		     accessible tree alone. -->
		<span class="source-citation__label" aria-describedby={describedBy}
			>{@render (text ?? plain)(source.pageTitle)}</span
		>
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

<style>
	/*
	 * The citation is a link and only a link: which part of the page was cited and
	 * when it was last verified are its tooltip, because that is what a reader
	 * checks before following it rather than something they need in front of them
	 * on every card. The link sits above the stretched hit area of the card's
	 * navigate button, which is what lets its own press reach it.
	 */
	.source-citation {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	/* The link and the unlinkable title it falls back to, and nothing else: the
	   tooltip is a child of this element too, and it lays itself out. */
	.source-citation a,
	.source-citation__label {
		display: inline-flex;
		gap: 0.25rem;
		align-items: center;
		font-weight: var(--font-weight-semibold);
	}

	.source-citation :global(.source-citation__external) {
		flex: none;
	}

	/*
	 * The favicon of the page the citation links to, the way a reference row in a
	 * search result or an assistant's answer carries one: it identifies the link's
	 * target, at the text's own size, and claims nothing else. `1em` rather than a
	 * pixel count, so it rides the meta line's type wherever the citation is drawn.
	 * `SourceLink.svelte` draws its favicon the same way.
	 */
	.source-citation__favicon {
		flex: none;
		width: 1em;
		height: 1em;
		/* Rounded the way the idiom's marks are everywhere else: a favicon is a
		   square tile from whatever corner of the web it came from, and the radius
		   is what keeps fourteen of them reading as one set. Half of `--radius-xs`
		   rather than the token itself: at a mark this small the full 4px reads as
		   a circle, and a mark that has gone circular is cropping its own tile. */
		border-radius: calc(var(--radius-xs) / 2);
	}

	/*
	 * Fixed rather than absolute: the citation sits inside the linter panel's
	 * scroller and inside the editor popover's, either of which would clip a box
	 * that stayed in flow. Above `--layer-popover`, because the popover is one of
	 * the two places this opens from.
	 */
	.source-tooltip {
		position: fixed;
		z-index: var(--layer-tooltip);
		/* A tooltip is a readout, never a target: without this, the box under the
		   pointer's path intercepted the hover it was reporting on: leaving the
		   link, flickering, and shielding whatever link it happened to overlap. */
		pointer-events: none;
		display: grid;
		box-sizing: border-box;
		width: max-content;
		max-width: 16rem;
		padding: var(--space-2);
		gap: var(--space-0-5);
		border: 0;
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text-muted);
		box-shadow: var(--shadow-overlay);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-regular);
		line-height: var(--line-height-body);
	}

	.source-tooltip__section {
		color: var(--color-text);
	}

	.source-tooltip__verified {
		white-space: nowrap;
	}
</style>
