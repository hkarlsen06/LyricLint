import type { Component } from 'svelte';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { docsPage, docsPages } from './catalog.js';

/*
 * The catalog is the docs' table of contents: the sidebar, the "On this page"
 * list, search, and every fragment link read it. A content component that
 * draws a section under another id or title breaks all of those at once while
 * looking fine on its own page, so each page's `h2`s are held to its entry.
 */
const contents = import.meta.glob<{ default: Component }>('./content/*.svelte');
const slugOf = (path: string) => path.replace(/^\.\/content\/(.+)\.svelte$/u, '$1');
const text = (element: Element) => element.textContent?.replace(/\s+/gu, ' ').trim();

afterEach(cleanup);

describe('docs content', () => {
	it('has a catalog entry for every content file', () => {
		const orphans = Object.keys(contents)
			.map(slugOf)
			.filter((slug) => !docsPage(slug));
		expect(orphans).toEqual([]);
	});

	for (const page of docsPages) {
		const load = contents[`./content/${page.slug}.svelte`];
		it.skipIf(!load)(`${page.slug} draws the catalog's sections, in order`, async () => {
			const { default: Content } = await load!();
			const view = await render(Content);

			// The page owns the title and the lede; the body starts at h2.
			expect(view.container.querySelector('h1')).toBeNull();
			const headings = [...view.container.querySelectorAll('h2')].map((heading) => ({
				id: heading.id,
				title: text(heading)
			}));
			expect(headings).toEqual(page.sections.map(({ id, title }) => ({ id, title })));
		});
	}
});
