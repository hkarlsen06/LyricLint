import cityLights from '../../../scripts/fixtures/city-lights.json';

/**
 * City Lights as a notes app pastes it: every apostrophe curly, and a comma at
 * the end of ten lyric lines (8 to 33). The rules find 26 places that are 3
 * decisions: 15 curly apostrophes, 10 line-end commas, 1 unlinked repeat.
 */
export const cityLightsPasted = cityLights.lyrics
	.replaceAll("'", '’')
	.replace(/^(?!\[)(.+[a-z])$/gm, (line: string, body: string, offset: number) =>
		offset % 3 === 0 ? `${body},` : line
	);
