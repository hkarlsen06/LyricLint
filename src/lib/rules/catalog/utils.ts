import type {
	Diagnostic,
	DiagnosticFix,
	LyricLine,
	RuleContext,
	RuleDefinition,
	TextRange
} from '$lib/core/types.js';

export function diagnostic(
	rule: RuleDefinition,
	range: TextRange,
	message: string,
	explanation: string,
	fixes?: DiagnosticFix[],
	sourceIds: string[] = rule.sourceIds
): Diagnostic {
	return {
		ruleId: rule.id,
		severity: rule.defaultSeverity,
		from: range.from,
		to: range.to,
		message,
		explanation,
		sourceIds,
		// `line` is the default rather than `character`, so a rule added without a
		// thought about typing is quiet while its line is being written instead of
		// arguing with every prefix of every word.
		settlesOn: rule.settlesOn ?? 'line',
		...(fixes && fixes.length > 0 ? { fixes } : {})
	};
}

export function replacementFix(
	context: RuleContext,
	kind: DiagnosticFix['kind'],
	label: string,
	range: TextRange,
	insert: string
): DiagnosticFix {
	return {
		kind,
		label,
		edit: {
			baseRevision: context.revision,
			edits: [{ from: range.from, to: range.to, insert }]
		}
	};
}

export function hasUnsupportedMarkup(line: LyricLine): boolean {
	return line.styleSpans.some((span) => 'unsupported' in span);
}

export function maskedMarkupText(line: LyricLine): string {
	const cached = maskedMarkupTextCache.get(line.text);
	if (cached !== undefined) {
		return cached;
	}
	// split('') preserves one array entry per UTF-16 code unit, matching parser offsets.
	const characters = line.text.split('');
	for (const match of line.text.matchAll(/<[^>]*>/gu)) {
		const from = match.index;
		for (let index = from; index < from + match[0].length; index += 1) {
			characters[index] = ' ';
		}
	}
	const masked = characters.join('');
	if (maskedMarkupTextCache.size >= MASKED_MARKUP_CACHE_LIMIT) {
		maskedMarkupTextCache.clear();
	}
	maskedMarkupTextCache.set(line.text, masked);
	return masked;
}

const MASKED_MARKUP_CACHE_LIMIT = 2_000;
const maskedMarkupTextCache = new Map<string, string>();

export interface AbsoluteMatch {
	from: number;
	to: number;
	text: string;
	groups: Record<string, string | undefined>;
}

export function matchesOutsideMarkup(line: LyricLine, pattern: RegExp): AbsoluteMatch[] {
	if (hasUnsupportedMarkup(line)) {
		return [];
	}
	const safePattern = pattern.global ? pattern : globalPattern(pattern);
	safePattern.lastIndex = 0;
	return Array.from(maskedMarkupText(line).matchAll(safePattern), (match) => ({
		from: line.from + match.index,
		to: line.from + match.index + match[0].length,
		text: line.text.slice(match.index, match.index + match[0].length),
		groups: match.groups ?? {}
	}));
}

const globalPatterns = new Map<string, RegExp>();

function globalPattern(pattern: RegExp): RegExp {
	const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
	const key = `${pattern.source}\u0000${flags}`;
	let cached = globalPatterns.get(key);
	if (!cached) {
		cached = new RegExp(pattern.source, flags);
		globalPatterns.set(key, cached);
	}
	return cached;
}

export function visibleLineStart(line: LyricLine): { offset: number; text: string } | undefined {
	if (hasUnsupportedMarkup(line)) {
		return undefined;
	}
	const masked = maskedMarkupText(line);
	const match = /\S/u.exec(masked);
	if (!match) {
		return undefined;
	}
	return { offset: line.from + match.index, text: line.text.slice(match.index) };
}

export function preserveCase(found: string, replacement: string): string {
	if (found === found.toUpperCase() && /\p{L}/u.test(found)) {
		return replacement.toUpperCase();
	}
	if (found[0] === found[0]?.toUpperCase()) {
		return `${replacement[0]?.toUpperCase() ?? ''}${replacement.slice(1)}`;
	}
	return replacement;
}
