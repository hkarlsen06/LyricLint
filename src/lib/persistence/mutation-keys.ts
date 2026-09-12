import { RangeSet, type ObservabilitySet } from 'dexie';

/** Exact committed keys, or undefined when Dexie reports a range or a table-wide change. */
export function mutatedKeys(parts: ObservabilitySet, table: string): string[] | undefined {
	const ranges = parts[table];
	if (!ranges) return undefined;
	const keys: string[] = [];
	for (const range of new RangeSet().add(ranges)) {
		// Dexie mutation ranges include numeric and compound bounds; only exact string primary keys identify our records.
		if (typeof range.from !== 'string' || range.from !== range.to) return undefined;
		keys.push(range.from);
	}
	return keys;
}
