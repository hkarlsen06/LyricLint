<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>LyricLint could not open</title>
</svelte:head>

<main class="error-page">
	<div>
		<h1>LyricLint could not open this page</h1>
		<p>
			{page.status === 404
				? 'This page is not part of the installed app.'
				: 'The application shell encountered an error before the workspace was ready.'}
		</p>
		<p>Your local 'scribes have not been included in this error page or sent anywhere.</p>
		<!-- A 404 here is usually a shared link that was truncated or mistyped, which
		     means the reader may never have seen LyricLint before. Sending them to
		     the workspace alone hands a stranger an empty editor with no explanation,
		     so the quiet tier offers the page that explains it. The contrast tier
		     stays with the workspace: that is still the destination. -->
		<!-- Both are full document loads, and on this page that is the whole point.
		     A link here is otherwise a client-side navigation, which asks the very
		     runtime that just failed to route out of its own failure — and it
		     cannot, because the failure is usually a rejected dynamic import: the
		     browser caches that rejection against the module's URL, so re-importing
		     it from the same document fails instantly and forever. What the reader
		     sees is a button that does nothing, on the one screen whose entire job
		     is offering a way out. A new document gets a new module graph, which is
		     the only thing that actually recovers. -->
		<p class="error-page__actions">
			<a class="button button--contrast" data-sveltekit-reload href={resolve('/lint/')}>
				Return to the workspace
			</a>
			<a class="button button--quiet" data-sveltekit-reload href={resolve('/')}>
				What is LyricLint?
			</a>
		</p>
	</div>
</main>
