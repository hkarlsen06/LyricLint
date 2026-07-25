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
		<p>Your local drafts have not been included in this error page or sent anywhere.</p>
		<a class="button button--contrast" href={resolve('/')}>Return to the workspace</a>
	</div>
</main>
