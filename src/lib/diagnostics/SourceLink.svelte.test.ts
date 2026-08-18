import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import type { SourceReference } from '$lib/core/types.js';
import SourceLink from './SourceLink.svelte';

const SOURCE: SourceReference = {
	id: 'G-LINES',
	url: 'https://genius.com/G-LINES',
	pageTitle: 'Page G-LINES',
	sectionTitle: 'Section G-LINES',
	retrievedAt: '2026-07-24',
	lastVerifiedAt: '2026-07-24',
	reviewStatus: 'reviewed',
	authority: 'community'
};

describe('the block form of a citation', () => {
	it('says the press opens a tab, since the mark beside it cannot', async () => {
		// The external-link glyph is aria-hidden and the favicon's alt is empty, so
		// this note is the whole of what tells a screen reader the link leaves the
		// page — the convention every external link on the site pages follows.
		const screen = render(SourceLink, { source: SOURCE });

		const link = screen.container.querySelector('.source-reference a')!;
		expect(link.getAttribute('target')).toBe('_blank');
		expect(link.getAttribute('rel')).toBe('noopener noreferrer');
		await expect
			.element(page.getByRole('link', { name: 'Page G-LINES (opens in a new tab)' }))
			.toBeInTheDocument();

		// Said to a screen reader only: the block goes on reading as the title, the
		// verified date, and the section.
		expect(link.querySelector('.sr-only')?.className).toContain('sr-only');
		screen.unmount();
	});

	it('is not a link at all when the citation has no web address', () => {
		// Nothing to open, so nothing claims to open a tab.
		const screen = render(SourceLink, { source: { ...SOURCE, url: 'G-LINES' } });

		expect(screen.container.querySelector('.source-reference a')).toBeNull();
		expect(screen.container.textContent).not.toContain('opens in a new tab');
		screen.unmount();
	});
});
