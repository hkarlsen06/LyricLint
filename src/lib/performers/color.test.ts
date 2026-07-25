import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	allocatePerformerColor,
	derivePerformerHue,
	performerColorIds,
	performerColorPalette,
	rankPerformerColorIds
} from './color.js';

interface Oklch {
	lightness: number;
	chroma: number;
	hue: number;
}

function parseOklch(value: string): Oklch {
	const match = /^oklch\(([\d.]+)(%?) ([\d.]+) ([\d.]+)\)$/u.exec(value.trim());
	if (!match) throw new Error(`Unsupported test color: ${value}`);
	return {
		lightness: Number(match[1]) / (match[2] === '%' ? 100 : 1),
		chroma: Number(match[3]),
		hue: Number(match[4])
	};
}

function oklabDistance(left: Oklch, right: Oklch): number {
	const leftHue = (left.hue * Math.PI) / 180;
	const rightHue = (right.hue * Math.PI) / 180;
	return Math.hypot(
		left.lightness - right.lightness,
		left.chroma * Math.cos(leftHue) - right.chroma * Math.cos(rightHue),
		left.chroma * Math.sin(leftHue) - right.chroma * Math.sin(rightHue)
	);
}

function relativeLuminance(color: Oklch): number {
	const hue = (color.hue * Math.PI) / 180;
	const a = color.chroma * Math.cos(hue);
	const b = color.chroma * Math.sin(hue);
	const lRoot = color.lightness + 0.3963377774 * a + 0.2158037573 * b;
	const mRoot = color.lightness - 0.1055613458 * a - 0.0638541728 * b;
	const sRoot = color.lightness - 0.0894841775 * a - 1.291485548 * b;
	const l = lRoot ** 3;
	const m = mRoot ** 3;
	const s = sRoot ** 3;
	const red = Math.min(1, Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s));
	const green = Math.min(1, Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s));
	const blue = Math.min(1, Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s));
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(left: Oklch, right: Oklch): number {
	const first = relativeLuminance(left);
	const second = relativeLuminance(right);
	return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('performer color allocation', () => {
	it('derives the same hue and ranking from equivalent performer text', () => {
		expect(derivePerformerHue('  Beyoncé  ')).toBe(derivePerformerHue('beyoncé'));
		expect(rankPerformerColorIds('ＥＣＨＯ')).toEqual(rankPerformerColorIds('ｅｃｈｏ'));
		expect(rankPerformerColorIds('Beyoncé')).toEqual(rankPerformerColorIds('Beyoncé'));
	});

	it('ranks the closest token hue first', () => {
		const name = 'Little Simz';
		const derivedHue = derivePerformerHue(name);
		const distance = (hue: number) => {
			const difference = Math.abs(derivedHue - hue);
			return Math.min(difference, 360 - difference);
		};
		const rankedDistances = rankPerformerColorIds(name).map((colorId) =>
			distance(performerColorPalette.find((color) => color.id === colorId)?.hue ?? 0)
		);

		expect(rankedDistances).toEqual([...rankedDistances].sort((left, right) => left - right));
	});

	it('moves a colliding performer to the nearest unused token', () => {
		const primaryByName = new Map<string, string>();
		let collision: [string, string] | undefined;
		for (let index = 0; index < 100 && !collision; index += 1) {
			const name = `Artist ${index}`;
			const primary = rankPerformerColorIds(name)[0];
			const existing = primaryByName.get(primary);
			if (existing) collision = [existing, name];
			else primaryByName.set(primary, name);
		}
		expect(collision).toBeDefined();

		const [firstName, secondName] = collision!;
		const occupied = allocatePerformerColor(firstName, []);
		const resolved = allocatePerformerColor(secondName, [{ colorId: occupied }]);

		expect(rankPerformerColorIds(secondName)[0]).toBe(occupied);
		expect(resolved).toBe(
			rankPerformerColorIds(secondName).find((colorId) => colorId !== occupied)
		);
	});

	it('balances reuse after every token is occupied', () => {
		const name = 'Doechii';
		const fullRoster = performerColorIds.map((colorId) => ({ colorId }));
		const preferred = rankPerformerColorIds(name)[0];
		expect(allocatePerformerColor(name, fullRoster)).toBe(preferred);

		const rosterWithPreferredRepeated = [...fullRoster, { colorId: preferred }];
		expect(allocatePerformerColor(name, rosterWithPreferredRepeated)).not.toBe(preferred);
	});
});

describe('performer token contrast', () => {
	it('keeps token hues in sync and every shipped palette role distinguishable', () => {
		const tokens = readFileSync(new URL('../ui/styles/tokens.css', import.meta.url), 'utf8');
		const darkStart = tokens.indexOf('@media (prefers-color-scheme: dark)');
		expect(darkStart).toBeGreaterThan(0);

		for (const theme of [tokens.slice(0, darkStart), tokens.slice(darkStart)]) {
			const surface = parseOklch(/--color-surface:\s*(oklch\([^)]+\))/u.exec(theme)?.[1] ?? '');
			const text = parseOklch(/--color-text:\s*(oklch\([^)]+\))/u.exec(theme)?.[1] ?? '');
			const solids = new Map(
				[...theme.matchAll(/--performer-([a-z]+):\s*(oklch\([^)]+\))/gu)].map(([, id, color]) => [
					id,
					parseOklch(color)
				])
			);
			const tints = new Map(
				[...theme.matchAll(/--performer-([a-z]+)-tint:\s*(oklch\([^)]+\))/gu)].map(
					([, id, color]) => [id, parseOklch(color)]
				)
			);

			expect([...solids.keys()]).toEqual(performerColorIds);
			expect([...tints.keys()]).toEqual(performerColorIds);

			for (const token of performerColorPalette) {
				const solid = solids.get(token.id);
				const tint = tints.get(token.id);
				expect(solid?.hue).toBe(token.hue);
				expect(tint?.hue).toBe(token.hue);
				expect(
					contrastRatio(solid!, surface),
					`${token.id} solid against surface`
				).toBeGreaterThanOrEqual(3);
				expect(contrastRatio(tint!, text), `${token.id} tint against text`).toBeGreaterThanOrEqual(
					4.5
				);
			}

			const solidEntries = [...solids.entries()];
			for (let left = 0; left < solidEntries.length; left += 1) {
				for (let right = left + 1; right < solidEntries.length; right += 1) {
					const [leftId, leftColor] = solidEntries[left]!;
					const [rightId, rightColor] = solidEntries[right]!;
					expect(
						oklabDistance(leftColor, rightColor),
						`${leftId} and ${rightId} are too similar`
					).toBeGreaterThanOrEqual(0.06);
				}
			}
		}
	});
});
