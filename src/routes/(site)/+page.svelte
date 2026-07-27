<script lang="ts">
	import { resolve } from '$app/paths';
	import { enabledRules, sourceRegistry } from '$lib/rules/index.js';
	import { siteUrl } from '$lib/seo.js';
	import LiveDemo from '$lib/ui/site/LiveDemo.svelte';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';

	// Read off the registry rather than typed into the copy. A landing page that
	// states a count is making a claim about the product, and a hand-written one
	// is wrong the first time a rule ships.
	const ruleCount = enabledRules.length;
	const pageTitle = 'LyricLint · For Genius transcribers';
	const pageDescription = `LyricLint checks Genius lyric transcriptions against ${ruleCount} reviewed rules plus local grammar and spelling checks for section headers, performer markup, punctuation, and more. Runs in your browser.`;
	const socialDescription =
		'Paste a transcription, see every formatting problem with the Genius source that backs it, and copy clean markup. Nothing leaves your browser.';
	const canonicalUrl = siteUrl('/');
	const appUrl = siteUrl('/lint/');
	const harperUrl = sourceRegistry.get('T-HARPER')?.url ?? 'https://writewithharper.com/';
	const structuredData = {
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: 'LyricLint',
		url: appUrl,
		description: pageDescription,
		applicationCategory: 'UtilitiesApplication',
		operatingSystem: 'Any',
		browserRequirements: 'Requires a desktop or laptop web browser',
		offers: {
			'@type': 'Offer',
			price: 0,
			priceCurrency: 'USD'
		}
	};

	// Deliberately invented lines, not a real song. The page needs a transcription
	// that is wrong in several ordinary ways at once — a written-out label instead
	// of a header, a typewriter apostrophe, a lowercase line start, a trailing
	// comma, a bare ad-lib — and inventing them is also the only way to show a
	// lyric here at all.
	const messy = `Verse 1:
i has counted every streetlight on the way
you said we'd drive until the radio gave out, yeah
and the "quiet" part was never really quiet`;

	const clean = `[Verse 1]
I have counted every streetlight on the way
You said we'd drive until the radio gave out (Yeah)
And the "quiet" part was never really quiet`;
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={socialDescription} />
	<meta property="og:url" content={canonicalUrl} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={socialDescription} />
</svelte:head>

<StructuredData data={structuredData} />

<main class="site-main site-prose">
	<!-- Three things, and no more — see `.site-hero` in site.css for why the
	     block that used to say the whole product up here says one sentence of it
	     now. The `Desktop or laptop` fact used to be two sentences explaining
	     that the editor and the linter work side by side; the phone gate already
	     says exactly that, in full, to the only readers it matters to.

	     Three facts and not four, and the one that went is the privacy claim: the
	     footer of every page already carries it and it has a section of its own
	     further down. What is left is what this surface owes a reader deciding
	     whether to press the button — what it costs and what it needs — and it
	     stays on one line down to a 390px screen, which a fourth did not. -->
	<header class="site-hero">
		<h1>Catch Genius formatting problems before you submit.</h1>

		<p class="site-lede">
			Paste a transcription and see every formatting problem — each one with the Genius guideline
			behind it.
		</p>

		<div class="site-actions">
			<a class="button button--contrast" href={resolve('/lint/')}>Open the workbench</a>
			<a class="button" href={resolve('/rules/')}>Browse the {ruleCount} rules</a>
		</div>

		<p class="site-meta">
			<span>Free</span>
			<span class="site-meta__fact">
				<span class="site-meta__separator" aria-hidden="true">·</span>On device
			</span>
			<span class="site-meta__fact">
				<span class="site-meta__separator" aria-hidden="true">·</span>Desktop or laptop
			</span>
		</p>
	</header>

	<!-- The heading and the demo, with nothing between them. What the sample is
	     wrong about used to lead into it with a colon; it reads the findings back
	     afterwards instead, so the first screen's peek is the heading and the top
	     of the editor rather than a paragraph the reader has no picture for yet.
	     `--site-hero-reserved` is measured against exactly that pair. -->
	<h2>What it looks like</h2>

	<LiveDemo text={messy} performerNames={['Avery', 'Blair']} />

	<p>
		That transcription has a written-out section header, a lowercase line start, a subject and verb
		that disagree, a stray comma, and an ad-lib nobody parenthesised.
	</p>

	<p>
		Apply the fixes it offers and you are left with the document you meant to submit — the same
		plain text and literal Genius markup you would have typed by hand:
	</p>

	<figure class="site-sample site-sample--valid">
		<figcaption class="site-sample__label">Clean</figcaption>
		<pre class="site-sample__text">{clean}</pre>
	</figure>

	<h2>Grammar checking that stays on your device</h2>

	<p>
		<a href={harperUrl} rel="external">Harper</a> catches
		<code class="site-code">I has</code> above and suggests <code class="site-code">I have</code>.
		The open-source English grammar and spelling engine runs inside the page, so your lyrics are not
		sent to Harper or to a LyricLint server.
	</p>

	<p>
		Lyrics are not ordinary prose, so Harper stays advisory: its fixes are always shown for review.
		Performer names and reviewed Genius spellings such as <code class="site-code">ayy</code> are added
		to its dictionary, and LyricLint's sourced Genius rules take precedence wherever the two disagree.
	</p>

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
		<a href={resolve('/rules/')}>Read the full rule reference</a>, including the sources behind each
		one.
	</p>

	<h2>Your lyrics stay in your browser</h2>

	<p>
		There is no account, no server, and no upload. Drafts autosave to local storage in your own
		browser, so closing the tab does not lose work and a crash does not either. Once the page has
		loaded it keeps working offline, which matters when the rules you are checking against live on a
		site that is not always reachable.
	</p>

	<p>
		There is one exception, and you choose it draft by draft. You can play the song you are
		transcribing alongside the lyrics: an audio file off your own disk, which is never uploaded and
		never copied into the browser, or a YouTube video, which loads Google's player into the page and
		lets Google see which video it is. Nothing loads from Google until you paste a link, and a draft
		using one stops working offline.
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
		<a class="button button--contrast" href={resolve('/lint/')}>Open the workbench</a>
	</div>
</main>
