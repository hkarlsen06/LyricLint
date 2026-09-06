// Decision record: docs/subsystems/section-links.md — passage correspondence is stored intent.
import { scanAnnotations } from './annotations.js';
import { extractLineStyleSpans } from './lines.js';
import type { TextRange } from './types.js';

export interface PassageMember {
	header: number;
	from: number;
	to: number;
}

export interface SharedPassage {
	members: PassageMember[];
}

export interface PassageBody {
	header: number;
	from: number;
	text: string;
}

interface Word {
	text: string;
	from: number;
	to: number;
	body: number;
	index: number;
	id: number;
}

// Linking is an explicit operation, but a pasted book must still not block the editor.
const MAX_PAIR_CELLS = 1_000_000;
const MAX_TOTAL_CELLS = 4_000_000;
const MAX_WORDS = 2000;
const MAX_BODY_LENGTH = 32_768;
const WORD_PATTERN = /[\p{L}\p{N}\p{M}]+(?:['’\-‐‑][\p{L}\p{N}\p{M}]+)*/gu;

/** Syntax is not sung: use the parser's recognizers rather than matching tag names or IDs. */
function lyricWords(text: string): (TextRange & { text: string })[] {
	// Bound syntax scanning too: malformed tag-like input can be expensive even
	// before the word/matrix ceiling. Exact duplicate bodies need no scanning.
	if (text.length > MAX_BODY_LENGTH) return [];
	const omitted: TextRange[] = [];
	if (text.includes('<')) {
		for (const span of extractLineStyleSpans(text, { from: 0, to: text.length })) {
			if ('unsupported' in span) omitted.push({ from: span.from, to: span.to });
			else {
				omitted.push({ from: span.from, to: span.contentFrom });
				omitted.push({ from: span.contentTo, to: span.to });
			}
		}
	}
	if (text.includes('](')) {
		for (const annotation of scanAnnotations(text)) {
			omitted.push({ from: annotation.from, to: annotation.fragmentRange.from });
			omitted.push({ from: annotation.fragmentRange.to, to: annotation.to });
		}
	}
	omitted.sort((a, b) => a.from - b.from);
	const pieces: { rawFrom: number; from: number; to: number; text: string }[] = [];
	let rawFrom = 0;
	let visibleFrom = 0;
	for (const range of [...omitted, { from: text.length, to: text.length }]) {
		if (range.from > rawFrom) {
			const content = text.slice(rawFrom, range.from);
			pieces.push({ rawFrom, from: visibleFrom, to: visibleFrom + content.length, text: content });
			visibleFrom += content.length;
		}
		rawFrom = Math.max(rawFrom, range.to);
	}
	const visible = pieces.map((piece) => piece.text).join('');
	const result: (TextRange & { text: string })[] = [];
	let pieceIndex = 0;
	for (const match of visible.matchAll(WORD_PATTERN)) {
		while (pieces[pieceIndex]?.to <= match.index) pieceIndex++;
		const piece = pieces[pieceIndex];
		// Mid-word formatting does not turn `lo<i>ve</i>` into two lexical words.
		// Such a word has no contiguous exact raw span to mirror to plain `love`.
		if (!piece || match.index + match[0].length > piece.to) continue;
		const from = piece.rawFrom + match.index - piece.from;
		result.push({ from, to: from + match[0].length, text: match[0] });
	}
	return result;
}

/** Discovery's ceiling counts the exact same lexical units as correspondence. */
export function passageWordCount(text: string): number {
	return text.length > MAX_BODY_LENGTH ? Infinity : lyricWords(text).length;
}

/** Pure lexical facts for discovery, using correspondence's syntax and length guards. */
export function passageLexicon(text: string) {
	if (text.length > MAX_BODY_LENGTH) return { wordCount: Infinity, words: new Set<string>() };
	const words = lyricWords(text);
	return { wordCount: words.length, words: new Set(words.map((word) => word.text)) };
}

function words(body: PassageBody, bodyIndex: number, firstId: number): Word[] {
	return lyricWords(body.text).map((word, index) => ({
		text: word.text,
		from: body.from + word.from,
		to: body.from + word.to,
		body: bodyIndex,
		index,
		id: firstId + index
	}));
}

/**
 * A tie-break in an LCS is not evidence of correspondence. At each rank of an
 * optimal alignment, keep a pair only if every optimal alignment uses that pair.
 * Prefix/suffix lengths enumerate those possibilities without enumerating paths.
 */
function forcedPairs(left: Word[], right: Word[]): [Word, Word][] {
	// The entire sung word sequence is positional evidence, even for a one-word
	// refrain with different outer punctuation or performer wrappers.
	if (left.length === right.length && left.every((word, i) => word.text === right[i].text)) {
		return left.map((word, i) => [word, right[i]]);
	}
	const stride = right.length + 1;
	const prefix = new Uint16Array((left.length + 1) * stride);
	const suffix = new Uint16Array(prefix.length);
	for (let i = 0; i < left.length; i++) {
		for (let j = 0; j < right.length; j++) {
			prefix[(i + 1) * stride + j + 1] =
				left[i].text === right[j].text
					? prefix[i * stride + j] + 1
					: Math.max(prefix[i * stride + j + 1], prefix[(i + 1) * stride + j]);
		}
	}
	for (let i = left.length - 1; i >= 0; i--) {
		for (let j = right.length - 1; j >= 0; j--) {
			suffix[i * stride + j] =
				left[i].text === right[j].text
					? suffix[(i + 1) * stride + j + 1] + 1
					: Math.max(suffix[(i + 1) * stride + j], suffix[i * stride + j + 1]);
		}
	}
	const length = suffix[0];
	const candidates: ([Word, Word] | null | undefined)[] = Array(length);
	for (let i = 0; i < left.length; i++) {
		for (let j = 0; j < right.length; j++) {
			const rank = prefix[i * stride + j];
			if (
				left[i].text === right[j].text &&
				rank + 1 + suffix[(i + 1) * stride + j + 1] === length
			) {
				candidates[rank] = candidates[rank] === undefined ? [left[i], right[j]] : null;
			}
		}
	}
	const pairs = candidates.filter((pair): pair is [Word, Word] => pair != null);
	// A lone common word is not a passage. Two ordered words provide context;
	// isolated words need a confirmed passage on both sides, within nearby lyrics.
	const anchored = pairs.map((pair, i) =>
		[pairs[i - 1], pairs[i + 1]].some(
			(neighbor) =>
				neighbor &&
				Math.abs(neighbor[0].index - pair[0].index) === 1 &&
				Math.abs(neighbor[1].index - pair[1].index) === 1
		)
	);
	return pairs.filter((pair, i) => {
		if (anchored[i]) return true;
		const before = pairs.findLastIndex((other, j) => j < i && anchored[j]);
		const after = pairs.findIndex((other, j) => j > i && anchored[j]);
		return (
			before >= 0 &&
			after >= 0 &&
			pair[0].index - pairs[before][0].index <= 24 &&
			pair[1].index - pairs[before][1].index <= 24 &&
			pairs[after][0].index - pair[0].index <= 24 &&
			pairs[after][1].index - pair[1].index <= 24
		);
	});
}

/** Merge touching ranges only when every occurrence has the same neighbor. */
export function coalescePassages(
	passages: readonly SharedPassage[],
	local: readonly PassageMember[] = []
): SharedPassage[] {
	const boundaries = new Map<number, Set<number>>();
	for (const member of [...passages.flatMap((passage) => passage.members), ...local]) {
		if (member.from !== member.to) continue;
		const positions = boundaries.get(member.header) ?? new Set<number>();
		positions.add(member.from);
		boundaries.set(member.header, positions);
	}
	const byMembership = new Map<string, SharedPassage[]>();
	for (const passage of passages) {
		if (passage.members.length < 2) continue;
		const members = passage.members
			.map((member) => ({ ...member }))
			.sort((a, b) => a.header - b.header);
		const key = members.map((member) => member.header).join(',');
		const group = byMembership.get(key) ?? [];
		group.push({ members });
		byMembership.set(key, group);
	}
	const result: SharedPassage[] = [];
	for (const group of byMembership.values()) {
		group.sort(
			(a, b) => a.members[0].from - b.members[0].from || a.members[0].to - b.members[0].to
		);
		let previous: SharedPassage | undefined;
		for (const passage of group) {
			// Deletions can collapse two copies of the same stored connection onto
			// one insertion point. It still has exactly one owner.
			if (
				previous?.members.every(
					(member, i) =>
						member.from === passage.members[i].from && member.to === passage.members[i].to
				)
			)
				continue;
			if (
				previous &&
				previous.members[0].from < previous.members[0].to &&
				passage.members[0].from < passage.members[0].to &&
				previous.members.every(
					(member, i) =>
						member.to === passage.members[i].from && !boundaries.get(member.header)?.has(member.to)
				)
			) {
				previous.members.forEach((member, i) => (member.to = passage.members[i].to));
			} else {
				result.push(passage);
				previous = passage;
			}
		}
	}
	return result.sort((a, b) => a.members[0].from - b.members[0].from);
}

/**
 * Establish exact, ordered passage correspondence once, at linking time.
 * Pairwise evidence becomes disjoint equivalence classes, never overlapping
 * pairwise ranges. Conflicting occurrences and order inversions stay local.
 */
export function alignPassages(input: readonly PassageBody[]): SharedPassage[] {
	const bodies = [...input].sort((a, b) => a.header - b.header);
	if (bodies.length < 2) return [];
	if (bodies.every((body) => body.text === bodies[0].text)) {
		return [
			{
				members: bodies.map((body) => ({
					header: body.header,
					from: body.from,
					to: body.from + body.text.length
				}))
			}
		];
	}
	const all: Word[] = [];
	const tokenized = bodies.map((body, i) => {
		const tokens = words(body, i, all.length);
		for (const token of tokens) all.push(token);
		return tokens;
	});
	const parent = all.map((word) => word.id);
	function root(id: number): number {
		while (parent[id] !== id) {
			parent[id] = parent[parent[id]];
			id = parent[id];
		}
		return id;
	}
	function connect(a: Word, b: Word): void {
		parent[root(b.id)] = root(a.id);
	}
	let remainingCells = MAX_TOTAL_CELLS;
	for (let i = 0; i < bodies.length; i++) {
		for (let j = i + 1; j < bodies.length; j++) {
			if (bodies[i].text === bodies[j].text) {
				tokenized[i].forEach((word, index) => connect(word, tokenized[j][index]));
				continue;
			}
			const cells = (tokenized[i].length + 1) * (tokenized[j].length + 1);
			if (
				tokenized[i].length > MAX_WORDS ||
				tokenized[j].length > MAX_WORDS ||
				cells > MAX_PAIR_CELLS ||
				cells > remainingCells
			)
				continue;
			remainingCells -= cells;
			for (const [a, b] of forcedPairs(tokenized[i], tokenized[j])) connect(a, b);
		}
	}
	const components = new Map<number, Word[]>();
	for (const word of all) {
		const id = root(word.id);
		const component = components.get(id) ?? [];
		component.push(word);
		components.set(id, component);
	}
	const rejected = new Set<number>();
	for (const [id, component] of components) {
		if (
			component.length < 2 ||
			new Set(component.map((word) => word.body)).size !== component.length
		)
			rejected.add(id);
	}
	// Transitivity can contradict order even when individual pairings do not.
	for (let i = 0; i < bodies.length; i++) {
		for (let j = i + 1; j < bodies.length; j++) {
			const shared = tokenized[i].flatMap((word) => {
				const id = root(word.id);
				const peer = rejected.has(id)
					? undefined
					: components.get(id)?.find((other) => other.body === j);
				return peer ? [{ id, index: peer.index }] : [];
			});
			let max = -1;
			for (const occurrence of shared) {
				if (occurrence.index < max) rejected.add(occurrence.id);
				max = Math.max(max, occurrence.index);
			}
			let min = Infinity;
			for (let k = shared.length - 1; k >= 0; k--) {
				if (shared[k].index > min) rejected.add(shared[k].id);
				min = Math.min(min, shared[k].index);
			}
		}
	}
	const passages: SharedPassage[] = [];
	// Bodies containing only punctuation (or still empty) have no word anchors,
	// but exact equality still establishes their complete positional connection.
	const wordless = new Map<string, PassageMember[]>();
	for (let i = 0; i < bodies.length; i++) {
		if (tokenized[i].length) continue;
		const body = bodies[i];
		const members = wordless.get(body.text) ?? [];
		members.push({ header: body.header, from: body.from, to: body.from + body.text.length });
		wordless.set(body.text, members);
	}
	for (const members of wordless.values()) {
		if (members.length > 1) passages.push({ members });
	}
	for (const [id, component] of components) {
		if (!rejected.has(id))
			passages.push({
				members: component.map((word) => ({
					header: bodies[word.body].header,
					from: word.from,
					to: word.to
				}))
			});
	}
	// Whitespace and punctuation inherit correspondence from the words on BOTH
	// sides. Group by the exact glue, so double spaces and local commas stay local.
	const glue = new Map<string, PassageMember[]>();
	for (let i = 0; i < bodies.length; i++) {
		const tokens = tokenized[i];
		for (let j = 0; j <= tokens.length; j++) {
			const left = tokens[j - 1];
			const right = tokens[j];
			if (
				(!left && !right) ||
				(left && rejected.has(root(left.id))) ||
				(right && rejected.has(root(right.id)))
			)
				continue;
			const from = left?.to ?? bodies[i].from;
			const to = right?.from ?? bodies[i].from + bodies[i].text.length;
			if (from === to) continue;
			const text = bodies[i].text.slice(from - bodies[i].from, to - bodies[i].from);
			const key = JSON.stringify([
				left ? root(left.id) : 'start',
				right ? root(right.id) : 'end',
				text
			]);
			const members = glue.get(key) ?? [];
			members.push({ header: bodies[i].header, from, to });
			glue.set(key, members);
		}
	}
	for (const members of glue.values()) if (members.length > 1) passages.push({ members });
	return coalescePassages(passages);
}
