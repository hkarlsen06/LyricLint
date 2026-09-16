<script lang="ts">
	import { resolve } from '$app/paths';
	import { siteUrl } from '$lib/seo.js';
</script>

<svelte:head>
	<title>Musixmatch transcription guide · LyricLint</title>
	<meta
		name="description"
		content="Musixmatch transcription requirements, language exceptions, source conflicts, and the exact scope of deterministic checks."
	/>
	<link rel="canonical" href={siteUrl('/guidelines/musixmatch/')} />
</svelte:head>

<main id="main" tabindex="-1" class="site-prose site-split__page">
	<h1>Musixmatch transcription guide</h1>
	<p class="site-lede">
		Read the transcription requirements, language exceptions and what each check can establish.
	</p>
	<p>
		The guide includes all 111 clauses in the researched policy inventory, with source links and the
		limits of automation. Search or choose a topic to read them.
	</p>
	<h2>What switching preserves</h2>
	<p>
		Switching profiles changes the document’s presentation. Source wording, section labels and
		performer information remain part of the saved document. Listening, meaning, uncertain lyrics
		and translation require your review; a switch cannot establish them.
	</p>
	<h2>Where the sources disagree</h2>
	<p>
		Japanese instrumental spacing and parenthetical capitalization, French times and Norwegian joik
		classification have unresolved scope. LyricLint preserves authored text and identifies the
		relevant sources rather than choosing a policy from its publication date.
	</p>
	<h2>Language-specific evidence</h2>
	<p>
		English, Norwegian, Arabic, German, Spanish, French, Japanese and Korean keep separate language
		scope. Dedicated Arabic and Korean policy evidence remains incomplete; general checks do not
		establish complete language coverage. No English spelling or numeric fallback substitutes for
		that evidence.
	</p>
	<p><a href={resolve('/workbench/')}>Return to the editor</a></p>
</main>
