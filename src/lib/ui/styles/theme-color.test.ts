import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * `<meta name="theme-color">` cannot reference a custom property, and writing it
 * from JS would break the static prerender and flash the wrong tint on load. So
 * the browser-chrome color is necessarily a second, hand-converted copy of
 * `--color-canvas` — the exact shape of drift that left the tag sitting on a
 * warm hue 78 for months after the palette moved to a cool 285.
 *
 * This is the guard: parse both canvas values out of tokens.css, convert them
 * the way a browser would, and assert the two hexes in +layout.svelte still
 * match. It fails the moment someone retunes the palette and forgets the head.
 */

function readSource(relativePath: string): string {
	return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

/** OKLCH → sRGB hex, via OKLab and the linear-sRGB matrices (CSS Color 4). */
function oklchToHex(lightness: number, chroma: number, hue: number): string {
	const radians = (hue * Math.PI) / 180;
	const a = chroma * Math.cos(radians);
	const b = chroma * Math.sin(radians);

	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

	const channels = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];

	return `#${channels
		.map((channel) => {
			const encoded = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
			const clamped = Math.min(1, Math.max(0, encoded));
			return Math.round(clamped * 255)
				.toString(16)
				.padStart(2, '0');
		})
		.join('')}`;
}

/**
 * Both `--color-canvas` declarations, in source order. The light theme is
 * declared first at `:root`; the dark one follows inside the
 * `prefers-color-scheme: dark` block, which is the same order the two
 * scheme-gated meta tags appear in.
 */
function canvasHexes(tokens: string): string[] {
	const matches = [
		...tokens.matchAll(/--color-canvas:\s*oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/gu)
	];

	return matches.map(([, lightness, chroma, hue]) =>
		oklchToHex(Number(lightness) / 100, Number(chroma), Number(hue))
	);
}

describe('theme-color stays in step with --color-canvas', () => {
	const tokens = readSource('./tokens.css');
	const layout = readSource('../../../routes/+layout.svelte');

	const declaredHexes = [
		...layout.matchAll(
			/<meta\s+name="theme-color"\s+media="\(prefers-color-scheme:\s*(light|dark)\)"\s+content="(#[0-9a-f]{6})"/gu
		)
	];

	it('ships one theme-color per color scheme', () => {
		expect(declaredHexes.map(([, scheme]) => scheme)).toEqual(['light', 'dark']);
	});

	it('matches the canvas token each scheme actually renders', () => {
		const expected = canvasHexes(tokens);

		// Guards the parser itself: if tokens.css stops declaring exactly two
		// canvas values, the comparison below would silently pass on an empty set.
		expect(expected).toHaveLength(2);
		expect(declaredHexes.map(([, , hex]) => hex)).toEqual(expected);
	});
});
