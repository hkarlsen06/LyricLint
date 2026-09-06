import { describe, expect, it } from 'vitest';
import { normalizeGeniusUrl } from './genius-url.js';

describe('Genius page links', () => {
	it('normalizes a pasted page link', () => {
		expect(normalizeGeniusUrl('  https://www.Genius.com/Artist-song-lyrics?q=1#about  ')).toBe(
			'https://www.genius.com/Artist-song-lyrics?q=1#about'
		);
	});

	it.each([
		undefined,
		42,
		'',
		'genius.com/Artist-song-lyrics',
		'https://genius.com/',
		'https://genius.com.evil.test/song',
		'https://user@genius.com/song',
		'javascript:alert(1)',
		'ftp://genius.com/song'
	])('refuses a non-page or unsafe link: %s', (value) => {
		expect(normalizeGeniusUrl(value)).toBeUndefined();
	});
});
