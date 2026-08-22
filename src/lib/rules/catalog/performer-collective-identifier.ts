import type {
	Diagnostic,
	DiagnosticFix,
	LegendVoiceGroup,
	RuleContext,
	RuleDefinition,
	SectionHeader,
	TextEdit,
	TextRange
} from '$lib/core/types.js';
import { type CatalogLookup, diagnostic } from './utils.js';

/**
 * How much of the section a collective identifier claims to cover.
 *
 * A `pair` word names exactly the two other performers, so its expansion is
 * only derivable where exactly two other names exist; a `group` word names
 * everyone, so any two or more will do.
 */
type CollectiveKind = 'pair' | 'group';

/**
 * The collective stand-ins the staff answer forbids, per language pack.
 *
 * Each entry is a direct translation of the identifiers the guideline names
 * (`Both`, `All`, and the unison words that stand in for them). The selected
 * pack is consulted alongside English rather than instead of it, exactly as
 * header semantics are: Genius pages in every language carry English headers
 * routinely. Japanese has no list of its own because its header policy is
 * English outright.
 */
const collectiveWords: CatalogLookup<CatalogLookup<CollectiveKind>> = {
	en: {
		both: 'pair',
		all: 'group',
		everyone: 'group',
		everybody: 'group',
		together: 'group'
	},
	no: { begge: 'pair', alle: 'group', sammen: 'group' },
	de: { beide: 'pair', alle: 'group', zusammen: 'group' },
	es: {
		ambos: 'pair',
		ambas: 'pair',
		todos: 'group',
		todas: 'group',
		juntos: 'group',
		juntas: 'group'
	},
	fr: { 'les deux': 'pair', tous: 'group', toutes: 'group', ensemble: 'group' },
	ar: { كلاهما: 'pair', الجميع: 'group', الكل: 'group' },
	ko: { '둘 다': 'pair', 모두: 'group', 다같이: 'group', '다 같이': 'group' }
};

function normalize(name: string): string {
	return name.trim().toLocaleLowerCase('en');
}

function collectiveKind(name: string, language: string): CollectiveKind | undefined {
	const base = language.split('-')[0] ?? language;
	return collectiveWords[base]?.[normalize(name)] ?? collectiveWords.en?.[normalize(name)];
}

/** A performer with this exact name outranks the word list: it is a real name. */
function isRosterName(name: string, context: RuleContext): boolean {
	const normalized = normalize(name);
	return context.performers.some(
		(performer) =>
			performer.displayName.toLocaleLowerCase('en') === normalized ||
			performer.aliases.some((alias) => alias.toLocaleLowerCase('en') === normalized)
	);
}

/**
 * One ampersand-delimited name within a legend group. A group with no
 * ambiguous ampersands is its own single name.
 */
interface LegendName {
	group: LegendVoiceGroup;
	segmentIndex: number;
	text: string;
	range: TextRange;
}

function trimmedRange(text: string, from: number, to: number): TextRange {
	let start = from;
	let end = to;
	while (start < end && /\s/u.test(text[start] ?? '')) {
		start += 1;
	}
	while (end > start && /\s/u.test(text[end - 1] ?? '')) {
		end -= 1;
	}
	return { from: start, to: end };
}

function legendNames(header: SectionHeader, text: string): LegendName[] {
	const names: LegendName[] = [];
	for (const group of header.legendGroups) {
		if (!group.markupSupported) {
			continue;
		}
		const cuts = [
			group.nameRange.from,
			...group.ambiguousAmpersands.flatMap((ampersand) => [ampersand.from, ampersand.to]),
			group.nameRange.to
		];
		for (let index = 0; index + 1 < cuts.length; index += 2) {
			const range = trimmedRange(text, cuts[index] ?? 0, cuts[index + 1] ?? 0);
			if (range.from >= range.to) {
				continue;
			}
			names.push({
				group,
				segmentIndex: index / 2,
				text: text.slice(range.from, range.to),
				range
			});
		}
	}
	return names;
}

/**
 * The written-out performer names a collective identifier stands for: every
 * other name in the same legend, first appearance order, deduplicated — or,
 * where the identifier is the whole legend, the draft's own roster.
 */
function expansionNames(
	flagged: LegendName,
	names: readonly LegendName[],
	context: RuleContext,
	kind: CollectiveKind
): string[] | undefined {
	const seen = new Set<string>();
	const pool: string[] = [];
	for (const name of names) {
		if (name === flagged || collectiveKind(name.text, context.language)) {
			continue;
		}
		const key = normalize(name.text);
		if (!seen.has(key)) {
			seen.add(key);
			pool.push(name.text);
		}
	}
	if (pool.length === 0) {
		for (const performer of context.performers) {
			pool.push(performer.displayName);
		}
	}
	if (kind === 'pair' ? pool.length === 2 : pool.length >= 2) {
		return pool;
	}
	return undefined;
}

function expansionFix(
	flagged: LegendName,
	expansion: string,
	text: string,
	context: RuleContext
): DiagnosticFix {
	const group = flagged.group;
	const edits: TextEdit[] = [];

	if (group.ambiguousAmpersands.length === 0) {
		edits.push({ from: group.nameRange.from, to: group.nameRange.to, insert: expansion });
		// The expansion is a joint group, and the unison guideline separates
		// groups with commas alone — so a serial ampersand in front of the
		// identifier becomes the comma the written-out form wants.
		if (group.separatorBefore && group.separatorBefore.includes('&')) {
			edits.push({ from: group.from - group.separatorBefore.length, to: group.from, insert: ', ' });
		}
	} else {
		// The identifier shares one style run with real names ("B & Both"), so
		// the whole run is rewritten: the names it keeps stay ampersand-joined,
		// and the expansion becomes its own comma-separated joint group.
		const parts: string[] = [];
		const cuts = [
			group.nameRange.from,
			...group.ambiguousAmpersands.flatMap((ampersand) => [ampersand.from, ampersand.to]),
			group.nameRange.to
		];
		for (let index = 0; index + 1 < cuts.length; index += 2) {
			const range = trimmedRange(text, cuts[index] ?? 0, cuts[index + 1] ?? 0);
			if (range.from >= range.to) {
				continue;
			}
			const segment = text.slice(range.from, range.to);
			const isFlagged = index / 2 === flagged.segmentIndex;
			if (parts.length > 0) {
				parts.push(isFlagged ? ', ' : ' & ');
			}
			parts.push(isFlagged ? expansion : segment);
		}
		edits.push({ from: group.nameRange.from, to: group.nameRange.to, insert: parts.join('') });
	}

	return {
		kind: 'preview',
		label: `Replace with ${expansion}`,
		edit: { baseRevision: context.revision, edits }
	};
}

export const performerCollectiveIdentifierRule: RuleDefinition = {
	id: 'performer.collective-identifier',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-HEADER-COLLECTIVE', 'G-SECTIONS'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		for (const section of document.sections) {
			const header = section.header;
			if (!header || header.legendGroups.length === 0) {
				continue;
			}
			const names = legendNames(header, document.text);
			for (const name of names) {
				const kind = collectiveKind(name.text, context.language);
				if (!kind || isRosterName(name.text, context)) {
					continue;
				}
				// The first name of a shared style run has nothing in front of it to
				// stay joined to, so the rewrite has no shape to offer — flag only.
				const expandable = name.group.ambiguousAmpersands.length === 0 || name.segmentIndex > 0;
				const expansion = expandable ? expansionNames(name, names, context, kind) : undefined;
				diagnostics.push(
					diagnostic(
						this,
						name.range,
						`Write out the artist names instead of “${name.text}”.`,
						'Genius staff guidance is that artist names are always written out in section headers, never combined under identifiers like “Both” or “All”. Performers singing the same lines in unison are grouped with ampersands inside one style slot, so the legend names exactly who shares them.',
						expansion
							? [expansionFix(name, expansion.join(' & '), document.text, context)]
							: undefined
					)
				);
			}
		}
		return diagnostics;
	}
};
