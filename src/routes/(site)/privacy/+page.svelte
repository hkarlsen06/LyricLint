<script lang="ts">
	import { resolve } from '$app/paths';
	import { siteUrl } from '$lib/seo.js';

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

<main class="site-main site-prose">
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
		<li>Rules-assistant conversations: they are stored in this browser and nowhere else.</li>
	</ul>

	<h2>What the rules assistant transmits</h2>
	<p>
		The assistant answers questions about the transcription guidelines. When you press <em>Ask</em>,
		the question you typed — plus the recent turns of that same conversation, up to a bounded window
		— is sent to LyricLint's answering service, a Cloudflare Worker, which forwards it to OpenAI's
		API through Cloudflare AI Gateway. Anything else depends on one explicit permission:
	</p>
	<ul>
		<li>
			Your 'scribe leaves the browser only after you explicitly grant the assistant read access.
			Permission is remembered for that 'scribe alone and can be revoked at any time; without it,
			only text you type into the assistant's own composer leaves the browser.
		</li>
		<li>
			Requests are sent with <code>store: false</code>, and request and response payload logging is
			disabled at the gateway. LyricLint authenticates to OpenAI with its own project API key;
			Cloudflare does not supply or bill the model. Cloudflare may retain an exact model response in
			its response cache for up to one hour. Its cache key includes the complete request and a
			session-derived identifier, preventing a cached answer from being served to another anonymous
			session. OpenAI prompt caching may temporarily retain model-internal cache tensors for the
			reviewed rules prefix. OpenAI's API data-retention terms still apply. LyricLint retains
			operational metadata only — status, latency, token counts, request id, and hashed abuse
			identifiers.
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
			session, only after you choose it — exactly as before the assistant existed.
		</li>
	</ul>

	<h2>Deleting your data</h2>
	<p>
		Assistant conversations can be deleted one at a time inside the assistant, and
		<em>Delete all local data</em> in the workbench's Tools panel removes every 'scribe and every conversation
		from this browser. The workspace backup exports transcriptions only — chat history is never part of
		a backup file.
	</p>

	<p class="site-aside">
		Questions about any of this are welcome — the whole workbench is
		<a href={resolve('/(site)/rules')}>documented in the open</a>.
	</p>
</main>
