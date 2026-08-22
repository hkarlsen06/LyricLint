<script lang="ts">
	import { maintainerStructuredData, siteMaintainer, siteUrl } from '$lib/seo.js';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';

	const pageTitle = 'About · LyricLint';
	const pageDescription =
		'Who maintains LyricLint, how to get in touch, and where to inspect its source, development history, and security policy.';
	const canonicalUrl = siteUrl('/about/');
	const repositoryUrl = 'https://github.com/hkarlsen06/LyricLint';
	const structuredData = {
		'@context': 'https://schema.org',
		'@type': 'AboutPage',
		name: 'About LyricLint',
		url: canonicalUrl,
		description: pageDescription,
		about: {
			'@type': 'SoftwareApplication',
			name: 'LyricLint',
			url: siteUrl('/lint/')
		},
		author: maintainerStructuredData
	};
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={canonicalUrl} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
</svelte:head>

<StructuredData data={structuredData} />

<main id="main" tabindex="-1" class="site-main site-prose">
	<h1>About LyricLint</h1>
	<p class="site-lede">
		LyricLint is an independent open-source project for checking Genius lyric transcriptions.
	</p>

	<p>
		It is not affiliated with or endorsed by Genius. Its checks are built from reviewed public
		guidance, and every rule names the source and interpretation behind it so a transcriber can
		inspect the ruling rather than take the tool's word for it.
	</p>

	<h2 id="hjalmar-karlsen">Maintainer</h2>
	<p>
		LyricLint is maintained by <strong>{siteMaintainer.name}</strong>, based in
		{siteMaintainer.location}. Email
		<a href={`mailto:${siteMaintainer.email}`}>{siteMaintainer.email}</a> with questions about the project.
	</p>

	<h2>Project links</h2>
	<ul>
		<li>
			<a href={repositoryUrl} rel="external">Source repository</a> — inspect the application, its tests,
			and its documentation.
		</li>
		<li>
			<a href={`${repositoryUrl}/issues`} rel="external">Issue tracker</a> — report a bug or suggest a
			rule or feature.
		</li>
		<li>
			<a href={`${repositoryUrl}/commits/main/`} rel="external">Development history</a> — follow the changes
			made to the project.
		</li>
		<li>
			<a href={`${repositoryUrl}/blob/main/SECURITY.md`} rel="external">Security policy</a> — report a
			vulnerability through the appropriate private channel.
		</li>
	</ul>
</main>
