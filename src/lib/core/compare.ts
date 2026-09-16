/** Stable identifier ordering, independent of the browser's locale and ICU data. */
export function compareCodeUnits(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
