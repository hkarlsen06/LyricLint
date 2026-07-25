<script lang="ts">
	import { resolve } from '$app/paths';
	import { currentRuleSet } from '$lib/rules/index.js';
	import { ruleReferences } from '$lib/rules/reference.js';

	// The list itself is in the layout, which is what keeps it standing while the
	// reader moves between rules. What is left here is what the detail column
	// shows when no rule is open — the section's own introduction, in the same
	// slot a rule will occupy.
	const ruleCount = ruleReferences().length;
</script>

<svelte:head>
	<title>Genius lyric formatting rules · LyricLint</title>
	<meta
		name="description"
		content="Every Genius transcription convention LyricLint checks — {ruleCount} rules for section headers, performer attribution, spelling, punctuation, and ad-libs, each citing a dated Genius source."
	/>
</svelte:head>

<main class="site-prose rules__page">
	<h1>Genius lyric formatting rules</h1>
	<p class="site-lede">
		The {ruleCount} transcription conventions LyricLint checks, exactly as its linter states them.
	</p>
	<p>
		Every rule on this list cites the Genius guideline it enforces — page, section, and the date a
		person last verified it — so you can read the source instead of taking the linter's word for it.
		The titles beside this one are the linter's own messages, produced by running each rule against
		the example its test suite reviews: what these pages say is what the workbench says. This is
		rule set {currentRuleSet.version}.
	</p>

	<div class="site-actions">
		<a class="button" href={resolve('/')}>Check a transcription in the workbench</a>
	</div>
	<p class="site-aside">Runs entirely in your browser — no account, no upload.</p>
</main>
