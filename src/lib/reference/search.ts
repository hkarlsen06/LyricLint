// Decision record: docs/subsystems/reference.md
import type { Severity, Fixability } from '$lib/core/types.js';
import { foldForSearch } from '$lib/rules/reference-search.js';
import type { ReferenceTopic } from './topics.js';

export type ReferenceScope = 'all' | 'guidelines' | 'rules';
export interface ReferenceLink {
	id: string;
	title: string;
	href: string;
}
export interface ReferenceDocument extends ReferenceLink {
	kind: 'guideline' | 'rule';
	topic: ReferenceTopic;
	topicTitle: string;
	summary: string;
	passages: string[];
	aliases: string[];
	relatedRuleIds: string[];
	authority?: string;
	severity?: Severity;
	fixability?: Fixability;
}
export interface ReferenceSearchResult extends ReferenceDocument {
	snippet: string;
	score: number;
	relatedRules: ReferenceLink[];
	approximate: boolean;
}

const questionWords = new Set([
	'how',
	'do',
	'does',
	'did',
	'i',
	'we',
	'a',
	'an',
	'the',
	'to',
	'is',
	'are',
	'should',
	'would',
	'could',
	'can',
	'what',
	'which',
	'in',
	'of',
	'for',
	'my',
	'this',
	'these',
	'it',
	'when',
	'with',
	'and',
	'please'
]);
export function referenceSearchTokens(query: string): string[] {
	const words = foldForSearch(query).match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) ?? [];
	if (words.length === 0 && query.trim()) return [foldForSearch(query.trim())];
	return [...new Set(words.filter((word) => !questionWords.has(word)))];
}

/** One edit only, including a transposition; short words never get fuzzy matches. */
function nearby(a: string, b: string): boolean {
	if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
	if (a.length === b.length) {
		const different: number[] = [];
		for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) different.push(i);
		return (
			different.length === 1 ||
			(different.length === 2 &&
				different[1] === different[0]! + 1 &&
				a[different[0]!] === b[different[1]!] &&
				a[different[1]!] === b[different[0]!])
		);
	}
	const [short, long] = a.length < b.length ? [a, b] : [b, a];
	let i = 0;
	while (i < short.length && short[i] === long[i]) i++;
	return short.slice(i) === long.slice(i + 1);
}

function excerpt(text: string, tokens: readonly string[]): string {
	if (text.length <= 240) return text;
	const folded = foldForSearch(text);
	const positions = tokens.map((token) => folded.indexOf(token)).filter((at) => at >= 0);
	const at = positions.length ? Math.min(...positions) : 0;
	let start = Math.max(0, at - 70);
	if (start) {
		const boundary = text.indexOf(' ', start);
		if (boundary >= 0 && boundary < at) start = boundary + 1;
	}
	return `${start ? '…' : ''}${text.slice(start, start + 240).trim()}${start + 240 < text.length ? '…' : ''}`;
}

interface ReferenceSearchOptions {
	scope?: ReferenceScope;
	topic?: string;
	severities?: readonly Severity[];
	fixabilities?: readonly Fixability[];
}

/** Prepare the immutable route corpus once; query results remain fresh on every call. */
export function createReferenceSearch(corpus: readonly ReferenceDocument[]) {
	const prepared = corpus.map((document) => {
		const folded = [
			document.title,
			document.id,
			...document.passages,
			document.topicTitle,
			...document.aliases
		].map(foldForSearch);
		return {
			document,
			folded,
			words: [...new Set(folded.flatMap((field) => field.match(/[\p{L}\p{N}']+/gu) ?? []))],
			aliasTokens: document.aliases.map(referenceSearchTokens)
		};
	});
	return (query: string, options: ReferenceSearchOptions = {}): ReferenceSearchResult[] =>
		searchPreparedReference(prepared, query, options);
}

export function searchReference(
	corpus: readonly ReferenceDocument[],
	query: string,
	options: ReferenceSearchOptions = {}
): ReferenceSearchResult[] {
	return createReferenceSearch(corpus)(query, options);
}

function searchPreparedReference(
	prepared: readonly {
		document: ReferenceDocument;
		folded: string[];
		words: string[];
		aliasTokens: string[][];
	}[],
	query: string,
	options: ReferenceSearchOptions
): ReferenceSearchResult[] {
	const tokens = referenceSearchTokens(query);
	const phrase = foldForSearch(query.trim());
	const scope = options.scope ?? 'all';
	const results: ReferenceSearchResult[] = [];
	for (const { document, folded, words, aliasTokens } of prepared) {
		if (options.topic && document.topic !== options.topic) continue;
		if (scope === 'rules' && document.kind !== 'rule') continue;
		if (
			scope === 'rules' &&
			options.severities &&
			(!document.severity || !options.severities.includes(document.severity))
		)
			continue;
		if (
			scope === 'rules' &&
			options.fixabilities &&
			(!document.fixability || !options.fixabilities.includes(document.fixability))
		)
			continue;
		if (scope === 'guidelines' && document.kind !== 'guideline') continue;
		let score = 0;
		let approximate = false;
		let matches = true;
		for (const token of tokens) {
			const field = folded.findIndex((text) => text.includes(token));
			if (field >= 0)
				score += field === 0 ? 12 : field === 1 ? 10 : field < document.passages.length + 2 ? 6 : 2;
			else if (words.some((word) => nearby(token, word))) {
				score += 1;
				approximate = true;
			} else {
				matches = false;
				break;
			}
		}
		if (!matches || (query.trim() && tokens.length === 0)) continue;
		if (phrase && folded[0]!.includes(phrase)) score += 24;
		// A reviewed multiword intent outranks an incidental literal word such as 'two'.
		const intentMatch = aliasTokens.some(
			(alias) => alias.length > 1 && alias.every((token) => tokens.includes(token))
		);
		if (intentMatch) score += 40;
		const snippets = document.passages.map((text, index) => ({
			text,
			index,
			hits: tokens.reduce((sum, token) => sum + (folded[index + 2]!.includes(token) ? 1 : 0), 0)
		}));
		snippets.sort((a, b) => b.hits - a.hits || a.index - b.index);
		results.push({
			...document,
			snippet: excerpt(
				intentMatch ? document.summary : snippets[0]?.hits ? snippets[0].text : document.summary,
				tokens
			),
			score,
			relatedRules: [],
			approximate
		});
	}
	if (query.trim()) results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
	if (scope !== 'all') return results;
	const grouped = new Set<string>();
	for (const result of results) {
		if (result.kind !== 'rule') continue;
		const owner = results.find(
			(candidate) => candidate.kind === 'guideline' && candidate.relatedRuleIds.includes(result.id)
		);
		if (!owner) continue;
		owner.relatedRules.push({ id: result.id, title: result.title, href: result.href });
		if (result.score > owner.score) {
			owner.score = result.score;
			owner.snippet = `Related linter check: ${result.snippet}`;
			owner.approximate = result.approximate;
		}
		grouped.add(result.id);
	}
	const visible = results.filter((result) => !grouped.has(result.id));
	if (query.trim()) visible.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
	return visible;
}
