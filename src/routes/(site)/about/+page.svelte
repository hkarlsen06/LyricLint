<script lang="ts">
	import { resolve } from '$app/paths';
	import { enabledRules } from '$lib/rules/index.js';
	import LiveDemo from '$lib/ui/site/LiveDemo.svelte';

	// Read off the registry rather than typed into the copy. A landing page that
	// states a count is making a claim about the product, and a hand-written one
	// is wrong the first time a rule ships.
	const ruleCount = enabledRules.length;

	// Deliberately invented lines, not a real song. The page needs a transcription
	// that is wrong in several ordinary ways at once — a written-out label instead
	// of a header, a typewriter apostrophe, a lowercase line start, a trailing
	// comma, a bare ad-lib — and inventing them is also the only way to show a
	// lyric here at all.
	const messy = `Verse 1:
i was counting every streetlight on the way
you said we'd drive until the radio gave out, yeah
and the "quiet" part was never really quiet`;

	const clean = `[Verse 1]
I was counting every streetlight on the way
You said we'd drive until the radio gave out (Yeah)
And the "quiet" part was never really quiet`;
</script>

<svelte:head>
	<title>About LyricLint · A linter for Genius lyric transcriptions</title>
	<meta
		name="description"
		content="LyricLint checks Genius lyric transcriptions against {ruleCount} sourced formatting rules — section headers, performer markup, spelling, and punctuation. Runs entirely in your browser."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:title" content="LyricLint — a linter for Genius lyric transcriptions" />
	<meta
		property="og:description"
		content="Paste a transcription, see every formatting problem with the Genius source that backs it, and copy clean markup. Nothing leaves your browser."
	/>
	<meta name="twitter:card" content="summary" />
</svelte:head>

<main class="site-main site-prose">
	<h1>Catch Genius formatting problems before you submit.</h1>

	<p class="site-lede">
		LyricLint is a lyric editor and linter for Genius transcription conventions. Paste a
		transcription, see what is wrong and which Genius guideline says so, fix it, and copy markup
		that is still exactly what you would have typed by hand.
	</p>

	<div class="site-actions">
		<a class="button button--contrast" href={resolve('/')}>Open the workbench</a>
		<a class="button" href={resolve('/rules')}>Browse the {ruleCount} rules</a>
	</div>

	<p class="site-aside">
		Free, and there is nothing to sign up for. It needs a desktop or laptop — the editor and the
		linter work side by side, and fixing a finding means selecting text and typing.
	</p>

	<h2>What it looks like</h2>

	<p>
		Let's say a transcription arrives with a written-out section header, a stray comma, a lowercase
		line start, and an ad-lib that has not been parenthesised. This is the workbench's own editor,
		running the real rule set — not a screenshot of it:
	</p>

	<LiveDemo text={messy} performerNames={['Avery', 'Blair']} />

	<p>
		Apply the fixes it offers and you are left with the document you meant to submit — the same
		plain text and literal Genius markup you would have typed by hand:
	</p>

	<figure class="site-sample site-sample--valid">
		<figcaption class="site-sample__label">Clean</figcaption>
		<pre class="site-sample__text">{clean}</pre>
	</figure>

	<h2>Performer tagging without hand-writing the HTML</h2>

	<p>
		Marking up who sings what is the part of a Genius transcription that costs the most and goes
		wrong the most. The markup is literal HTML, it has to be balanced, the style slots have to be
		used in a consistent order, and the section header's legend has to agree with every span
		underneath it — all of it typed by hand, in a plain textarea, one
		<code class="site-code">&lt;i&gt;</code> at a time.
	</p>

	<p>
		LyricLint does it as a selection. Select the words, choose the voice, and the wrapper, the slot,
		and the header legend are written together as one edit you can undo in one press. Every
		performer keeps a color, so you can see who is singing each passage at a glance — and the color
		is display only. It never reaches the markup you copy out, which stays exactly what Genius
		expects.
	</p>

	<p>
		The demo above has two performers on its roster already. Select any part of a line and hand it
		to one of them - after you've fixed the header!
	</p>

	<h2>Every warning carries its source</h2>

	<p>
		A linter that cannot say why it is complaining is just an opinion with a red underline. Every
		rule here required an exact Genius URL or annotation ID, a written interpretation, a human
		review, and a last-verified date before it was allowed to ship — and each finding links to the
		guideline it came from, so you can check the ruling rather than take it.
	</p>

	<p>
		Where a convention is genuinely contextual — an ad-lib that may or may not want parentheses, a
		spelling that changes the meaning — the finding says so and its fix is previewed for you to
		confirm instead of applied. Judgement is labelled as judgement.
	</p>

	<p>
		<a href={resolve('/rules')}>Read the full rule reference</a>, including the sources behind each
		one.
	</p>

	<h2>Your lyrics stay in your browser</h2>

	<p>
		There is no account, no server, and no upload. Drafts autosave to local storage in your own
		browser, so closing the tab does not lose work and a crash does not either. Once the page has
		loaded it keeps working offline, which matters when the rules you are checking against live on a
		site that is not always reachable.
	</p>

	<h2>What it is not</h2>

	<ul>
		<li>Not a way to edit Genius directly. You copy the finished markup out and paste it in.</li>
		<li>Not an automated transcriber, and not a chat assistant.</li>
		<li>
			Not a live scraper. The rules are a reviewed, versioned snapshot bundled with the app, so what
			it checks today is what it checked yesterday.
		</li>
		<li>
			Not a rewriter. Nothing changes in your document unless you press the control that changes it.
		</li>
	</ul>

	<div class="site-actions">
		<a class="button button--contrast" href={resolve('/')}>Open the workbench</a>
	</div>
</main>
