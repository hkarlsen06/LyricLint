<script lang="ts">
	import { ExternalLink } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import SeverityTag from '$lib/diagnostics/SeverityTag.svelte';
	import type { GuidanceLinterRule } from '$lib/guidance/guidance-search.js';

	let { rule }: { rule: GuidanceLinterRule } = $props();
</script>

<!--
	A rule inside the guidance catalog, drawn as one line.

	It used to be the rule index's row whole — title, the linter's own wording
	underneath, then severity, id and fix kind on a third line — on the reasoning
	that these are that index's rows in another shape and a row dressed down would
	read as a different kind of thing. Measured in the column, that was the wrong
	trade. A topic runs to a dozen of these under the conventions they check, and
	three lines each turned the half of the list the catalog is *not* about into
	the bulk of what a reader scrolls: two of the three lines said what the
	reader had to leave the section to act on anyway, and the second one said it
	in a sentence about one occurrence in one reviewed example.

	So a rule row is its name, the severity that colors it, and the mark that says
	this row leaves. Everything dropped is on the page one press away, whole and
	in its own context — which is what separates this from stripping a *guidance*
	row, whose statement is the thing itself rather than a pointer to it.

	One implementation, one surface now: the index column. The topic pages used
	to close with a `Checked by the linter` run of these same rows; it went when
	every entry started naming its own rules in its meta line and every rule
	page started linking its guideline back — the per-entry links carry the
	hand-off, and a trailing list of the whole family said it a second time.

	It opens a tab, which is the mark's own promise kept. A reader here is
	working *through* a topic — down a list, or down a page of entries they have
	scrolled and deep-linked into — and a rule is a lookup beside that rather
	than the next thing to read: taken in place it costs them the place they had,
	and the way back is a browser control rather than anything on screen (the
	section's own `All guidelines` returns to the catalog's welcome view, not to
	the entry they were reading). The rules section's own rows are unchanged,
	because there a rule *is* the next thing to read.
-->
<li>
	<!-- `rel` is the pair every external link here carries; the sr-only note is
	     what the mark cannot say, since the mark is `aria-hidden` and a new tab
	     is a fact about what the press does rather than about where it goes. -->
	<a
		class="site-run__lean"
		href="{resolve('/(site)/rules/[rule]', { rule: rule.slug })}/"
		target="_blank"
		rel="noopener noreferrer"
	>
		<!-- The severity leads as a glyph and not a word: down a run of these the
		     word is the same word every row, which is the rule the diagnostic card's
		     own meta line already states. The name is in the accessible tree and in
		     the pointer's tooltip, through `SeverityTag` itself. -->
		<SeverityTag severity={rule.severity} labelled={false} />
		<!-- The citations' own mark for a link that leaves, because this row does:
		     it opens the rule reference rather than a page beside this list.
		     Decorative — the destination is named by the link's own text and by the
		     section it lands in. Inline after the last word, so it follows a title
		     that wraps. -->
		<span class="site-run__title"
			>{rule.title}
			<ExternalLink
				class="site-run__external"
				aria-hidden="true"
				size={12}
				strokeWidth={2.2}
			/></span
		>
		<span class="sr-only">(opens in a new tab)</span>
	</a>
</li>
