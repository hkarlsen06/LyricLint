import { currentRuleSet } from '$lib/rules/index.js';
import { ruleReferences } from '$lib/rules/reference.js';
import { siteUrl } from '$lib/seo.js';
import type { RequestHandler } from './$types.js';

export const prerender = true;

const paths = [
	'/',
	'/rules/',
	'/privacy/',
	...ruleReferences().map((reference) => `/rules/${reference.slug}/`)
];

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

export const GET: RequestHandler = () => {
	const urls = paths
		.map(
			(pathname) => `  <url>
    <loc>${escapeXml(siteUrl(pathname))}</loc>
    <lastmod>${currentRuleSet.publishedAt}</lastmod>
  </url>`
		)
		.join('\n');

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
		{
			headers: {
				'content-type': 'application/xml; charset=utf-8'
			}
		}
	);
};
