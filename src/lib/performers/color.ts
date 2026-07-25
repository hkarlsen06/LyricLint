import type { PerformerRecord } from '$lib/core/types.js';
import { normalizePerformerKey } from './identity.js';

/**
 * Stable performer hues from the design tokens. Keep this table in sync with
 * `--performer-*` in tokens.css. Lightness and chroma vary by theme, but hue is
 * the identity that the name-derived color is matched against.
 */
export const performerColorPalette = [
	{ id: 'olive', hue: 155 },
	{ id: 'indigo', hue: 295 },
	{ id: 'teal', hue: 200 },
	{ id: 'ochre', hue: 78 },
	{ id: 'rose', hue: 20 },
	{ id: 'plum', hue: 330 },
	{ id: 'copper', hue: 50 },
	{ id: 'slate', hue: 255 }
] as const;

export type PerformerPaletteColorId = (typeof performerColorPalette)[number]['id'];

export const performerColorIds: readonly PerformerPaletteColorId[] = performerColorPalette.map(
	(color) => color.id
);

/** FNV-1a over normalized Unicode scalars, kept to unsigned 32-bit arithmetic. */
function hashPerformerName(displayName: string): number {
	let hash = 0x811c9dc5;
	for (const scalar of normalizePerformerKey(displayName)) {
		hash ^= scalar.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** Derive a stable hue from the complete normalized performer name. */
export function derivePerformerHue(displayName: string): number {
	return (hashPerformerName(displayName) / 0x1_0000_0000) * 360;
}

function hueDistance(left: number, right: number): number {
	const distance = Math.abs(left - right) % 360;
	return Math.min(distance, 360 - distance);
}

/**
 * Rank palette tokens from closest to furthest from the name-derived hue.
 * Palette order is the deterministic tie-breaker for an exact midpoint.
 */
export function rankPerformerColorIds(displayName: string): PerformerPaletteColorId[] {
	const hue = derivePerformerHue(displayName);
	return performerColorPalette
		.map((color, order) => ({ ...color, order }))
		.sort(
			(left, right) =>
				hueDistance(hue, left.hue) - hueDistance(hue, right.hue) || left.order - right.order
		)
		.map((color) => color.id);
}

/**
 * Choose the closest least-used token.
 *
 * With colors still available, a collision moves the new performer to their
 * nearest unused token without recoloring anyone already in the draft. Once
 * every token is occupied, reuse is unavoidable, so the least-used tier wins
 * before hue distance breaks the tie.
 */
export function allocatePerformerColor(
	displayName: string,
	roster: readonly Pick<PerformerRecord, 'colorId'>[]
): PerformerPaletteColorId {
	const usage = new Map<PerformerPaletteColorId, number>(
		performerColorIds.map((colorId) => [colorId, 0])
	);
	for (const performer of roster) {
		if (usage.has(performer.colorId as PerformerPaletteColorId)) {
			const colorId = performer.colorId as PerformerPaletteColorId;
			usage.set(colorId, (usage.get(colorId) ?? 0) + 1);
		}
	}

	const minimumUsage = Math.min(...usage.values());
	return (
		rankPerformerColorIds(displayName).find((colorId) => usage.get(colorId) === minimumUsage) ??
		performerColorPalette[0].id
	);
}
