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
		<p class="error-page__actions">
			<a class="button button--contrast" href={resolve('/lint/')}>Return to the workspace</a>
			<a class="button button--quiet" href={resolve('/')}>What is LyricLint?</a>
		</p>
	</div>
</main>
