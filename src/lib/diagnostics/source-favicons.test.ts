import { describe, expect, it } from 'vitest';
import { sourceRegistry } from '$lib/rules/data/sources.js';
import { sourceFavicon } from './source-favicons.js';

describe('source favicons', () => {
	// The map is only as good as its coverage: a source added without a favicon
	// would ship one bare link among decorated ones, which reads as the citation
	// being broken rather than as a mark nobody fetched. Every registered source
	// resolves a mark, so the omission fails here instead of on somebody's card.
	it('covers every source in the registry', () => {
		for (const source of sourceRegistry.values()) {
			expect(sourceFavicon(source.url), `no favicon for ${source.id} (${source.url})`).toBeTruthy();
		}
	});

	it('ignores the www prefix rather than keying on it', () => {
		expect(sourceFavicon('https://www.genius.com/9298624')).toBe(
			sourceFavicon('https://genius.com/9298624')
		);
	});

	// A citation whose URL is not a web address is not a link, and it gets no
	// mark either — the favicon says where a link goes, and there is no link.
	it('answers nothing for an unparseable or unknown URL', () => {
		expect(sourceFavicon('not a url')).toBeUndefined();
		expect(sourceFavicon('https://example.com/page')).toBeUndefined();
	});
});
