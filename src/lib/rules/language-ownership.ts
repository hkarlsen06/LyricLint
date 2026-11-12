import type { RuleContext } from '#lib/core/types.js';

/** Validate once and retain exact locale ownership at every checking boundary. */
export function languageOwnership(
	text: string,
	context: Pick<RuleContext, 'language' | 'languageRanges'>
) {
	const ranges = [...(context.languageRanges ?? [])].sort((a, b) => a.from - b.from);
	for (const [index, range] of ranges.entries()) {
		if (
			!Number.isSafeInteger(range.from) ||
			!Number.isSafeInteger(range.to) ||
			range.from < 0 ||
			range.to > text.length ||
			range.from >= range.to ||
			!range.language.trim() ||
			(index > 0 && ranges[index - 1].to > range.from)
		) {
			throw new Error('Invalid or overlapping language ranges in the active projection.');
		}
	}
	const boundaries = [...new Set(ranges.flatMap((range) => [range.from, range.to]))].sort(
		(a, b) => a - b
	);
	const firstAfter = (values: readonly number[], value: number) => {
		let low = 0;
		let high = values.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (values[middle] <= value) low = middle + 1;
			else high = middle;
		}
		return low;
	};
	const starts = ranges.map((range) => range.from);
	const languageAt = (at: number) => {
		const range = ranges[firstAfter(starts, at) - 1];
		return range && at < range.to ? range.language : context.language;
	};
	const withinLanguage = (from: number, to: number, language: string) => {
		if (languageAt(from) !== language) return false;
		for (
			let index = firstAfter(boundaries, from);
			index < boundaries.length && boundaries[index] < to;
			index += 1
		) {
			if (languageAt(boundaries[index]) !== language) return false;
		}
		return true;
	};
	return { ranges, languageAt, withinLanguage };
}
