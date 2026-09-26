import { error } from '@sveltejs/kit';
import type { Component } from 'svelte';
import { docsPage, docsPages } from '$lib/docs/catalog.js';
import type { EntryGenerator, PageLoad } from './$types.js';

// Lazy, so each page downloads its own body and nobody else's.
const contents = import.meta.glob<{ default: Component }>('/src/lib/docs/content/*.svelte');

export const entries: EntryGenerator = () => docsPages.map(({ slug }) => ({ slug }));

export const load: PageLoad = async ({ params }) => {
	const page = docsPage(params.slug);
	const content = contents[`/src/lib/docs/content/${params.slug}.svelte`];
	if (!page || !content) error(404, `No docs page is published at "${params.slug}".`);
	return { slug: page.slug, Content: (await content()).default };
};
