import { docsPages, type DocsPage, type DocsSection } from '$lib/docs/catalog.js';

/** A page, or one section of a page, that answers the query. */
export interface DocsHit {
	page: DocsPage;
	section?: DocsSection;
}

function fold(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[‘’]/gu, "'")
		.toLowerCase();
}

/**
 * Every token has to appear in the hit's own title or its body; tokens found in
 * the title are what rank it. A title that holds the whole query outranks one
 * that holds part of it, and both outrank a hit found only in a summary or a
 * keyword. A page outranks its own section on a tie, and ties keep reading
 * order.
 */
function score(tokens: string[], title: string, body: string): number | undefined {
	const inTitle = tokens.filter((token) => title.includes(token)).length;
	if (tokens.some((token) => !title.includes(token) && !body.includes(token))) return undefined;
	return (inTitle === tokens.length ? 100 : 0) + inTitle * 10;
}

export function searchDocs(query: string): DocsHit[] {
	const tokens = fold(query).split(/\s+/u).filter(Boolean);
	if (tokens.length === 0) return docsPages.map((page) => ({ page }));

	const ranked: Array<DocsHit & { score: number }> = [];
	for (const page of docsPages) {
		const pageTitle = fold(page.title);
		const pageBody = fold(
			[page.summary, ...(page.keywords ?? []), ...page.sections.map(({ title }) => title)].join(' ')
		);
		const pageScore = score(tokens, pageTitle, pageBody);
		if (pageScore !== undefined) ranked.push({ page, score: pageScore });

		for (const section of page.sections) {
			const sectionTitle = fold(section.title);
			// A section is its own hit only when its own title says something the
			// query asked for; otherwise it is just its page again.
			if (!tokens.some((token) => sectionTitle.includes(token))) continue;
			const sectionScore = score(tokens, sectionTitle, pageTitle);
			if (sectionScore !== undefined) ranked.push({ page, section, score: sectionScore - 1 });
		}
	}
	// `sort` is stable, so equal scores keep the catalog's reading order.
	return ranked.sort((a, b) => b.score - a.score).map(({ page, section }) => ({ page, section }));
}
