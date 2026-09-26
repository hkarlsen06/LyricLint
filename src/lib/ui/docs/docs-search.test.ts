import { describe, expect, it } from 'vitest';
import { docsPages } from '$lib/docs/catalog.js';
import { searchDocs } from './docs-search.js';

const where = (query: string) =>
	searchDocs(query).map(({ page, section }) => (section ? `${page.slug}#${section.id}` : page.slug));

describe('searchDocs', () => {
	it('lists every page in reading order with no query', () => {
		expect(where('  ')).toEqual(docsPages.map(({ slug }) => slug));
	});

	it('ranks a page whose title holds the query above hits found only in its body', () => {
		const hits = searchDocs('sync');
		const titleHits = hits.filter(({ page, section }) =>
			(section?.title ?? page.title).toLowerCase().includes('sync')
		);
		expect(hits[0]?.page.title.toLowerCase()).toContain('sync');
		expect(hits.slice(0, titleHits.length)).toEqual(titleHits);
		expect(hits.length).toBeGreaterThan(titleHits.length);
	});

	it('finds a section by its own title and names its page', () => {
		const page = docsPages.find(({ sections }) => sections.length > 1)!;
		const section = page.sections.at(-1)!;
		expect(where(section.title)).toContain(`${page.slug}#${section.id}`);
	});

	it('requires every word, folding case and curly apostrophes', () => {
		expect(where('zzzz')).toEqual([]);
		expect(where('’SCRIBES')).toEqual(where("'scribes"));
	});
});
