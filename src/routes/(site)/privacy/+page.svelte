<script lang="ts">
	import { siteUrl } from '#lib/seo.js';

	const pageTitle = 'Privacy · LyricLint';
	const pageDescription =
		'What LyricLint keeps in your browser, what the optional rules assistant transmits, and how to delete everything.';
	const canonicalUrl = siteUrl('/privacy/');
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalUrl} />
</svelte:head>

<main id="main" tabindex="-1" class="site-main site-prose">
	<h1>Privacy</h1>
	<p>
		LyricLint is local-first. Your transcriptions are stored in this browser and autosave to this
		browser; there is no account. A few optional features contact a third party, each one only when
		you ask for it. This page lists all of them.
	</p>

	<h2>What stays local</h2>
	<ul>
		<li>Every 'scribe, its performers, its line timings, and its section links.</li>
		<li>Audio files: only a file handle is kept, never the bytes, and never uploaded.</li>
		<li>Linting, including the Harper proofreader, which runs entirely in your browser.</li>
		<li>
			Rules-assistant conversations: saved conversation history stays in this browser. Messages sent
			to the assistant are processed as described below.
		</li>
	</ul>

	<h2>What the rules assistant transmits</h2>
	<p>
		The assistant answers questions about the transcription guidelines. When you press <em>Ask</em>,
		the question you typed, plus the recent turns of that same conversation, up to a bounded window,
		is sent to LyricLint's answering service, a Cloudflare Worker, which forwards it to OpenAI's API
		through Cloudflare AI Gateway. Anything else depends on one explicit permission:
	</p>
	<ul>
		<li>
			Your 'scribe leaves the browser only after you explicitly grant the assistant read access.
			Permission is remembered for that 'scribe alone and can be revoked at any time; without it,
			only text you type into the assistant's own composer leaves the browser.
		</li>
		<li>
			Each request carries the recent turns it needs. LyricLint sets OpenAI Responses
			<code>store: false</code>, which disables stored response state; this is not zero data
			retention. OpenAI may retain abuse-monitoring logs containing request and response content for
			up to 30 days by default. OpenAI prompt caching covers the fixed instructions and reviewed
			rules, with a 30-minute minimum lifetime; cache state may remain for up to 24 hours. See
			<a href="https://developers.openai.com/api/docs/guides/your-data" rel="external"
				>OpenAI's data controls</a
			>
			and
			<a href="https://developers.openai.com/api/docs/guides/prompt-caching" rel="external"
				>prompt caching documentation</a
			>. Each request includes a hashed, anonymous session identifier. LyricLint uses its own OpenAI
			API key. Cloudflare Gateway payload logging and response caching are disabled, and each
			request explicitly skips the Gateway response cache. LyricLint retains operational metadata
			only: status, latency, token counts, request id, and hashed abuse identifiers.
		</li>
	</ul>

	<h2>Anonymous sessions and abuse control</h2>
	<ul>
		<li>
			The first question asks for a Cloudflare Turnstile check, after which the service sets an
			anonymous, signed, host-only session cookie valid for 24 hours. It identifies a browser
			session, not a person, and there is no account behind it.
		</li>
		<li>
			Rate limits are enforced per browser session and per IP address. IP addresses are hashed with
			a server-side secret before they are stored or counted; raw IP addresses are never logged.
			Rate-accounting records expire after 48 hours.
		</li>
	</ul>

	<h2>Subprocessors</h2>
	<ul>
		<li>Cloudflare (hosting, AI Gateway, Turnstile) processes assistant requests.</li>
		<li>OpenAI generates assistant answers from the text the service forwards.</li>
		<li>
			Attaching audio from YouTube, Spotify, or Apple Music loads that provider's player, per
			session, only after you choose it. The one earlier contact: where Apple Music is offered,
			opening <em>Add audio source</em> loads Apple's MusicKit script, so that Apple's sign-in window
			can open on your next press instead of being blocked by the browser.
		</li>
	</ul>

	<h2>Deleting your data</h2>
	<p>
		Assistant conversations can be deleted one at a time inside the assistant, and
		<em>Reset LyricLint…</em>, under Local data in the workbench's Preferences panel, removes every
		'scribe and every conversation from this browser. The workspace backup exports transcriptions
		only. Chat history is never part of a backup file.
	</p>

	<p class="site-aside">
		Questions about any of this are welcome. The whole workbench is
		<a href="https://github.com/hkarlsen06/LyricLint" rel="external">documented in the open</a>.
	</p>
</main>
