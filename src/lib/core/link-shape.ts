// Decision record: docs/subsystems/section-links.md — read it before changing this file, and update it with any behavior change.
import type { Section, TextRange } from '$lib/core/types.js';

/**
 * The shape of a link group: which words its members keep in step, and which
 * they are each allowed to sing their own way.
 *
 * A group used to be one body repeated, so a chorus that differed by a single
 * line could not be linked at all — the only offer was to overwrite it. Here a
 * member's body is a partition into alternating **shared runs** and
 * **divergent runs**, and the two facts that make the whole feature work are:
 *
 * - every member has the same number of divergent runs, and
 * - the shared text between run `k-1` and run `k` is identical in every member.
 *
 * So a position in shared text is expressible in coordinates every member
 * agrees on — "so many characters into the shared run after hole 3" — which is
 * what lets an edit made in one copy be carried to the others without either
 * one being rewritten wholesale.
 *
 * Only the divergent runs are stored. The shared runs are the gaps between
 * them, which is what keeps the invariant true by construction rather than by
 * two lists agreeing.
 *
 * Everything here is in body-relative coordinates and touches no CodeMirror, so
 * it can be tested as arithmetic.
 */

interface Token extends TextRange {
	text: string;
}

function isTokenWhitespace(char: string): boolean {
	return /\s/u.test(char);
}

/**
 * Above this, the quadratic alignment is abandoned for a whole-body comparison.
 * A chorus is tens of tokens; a document pasted into one section is not a
 * chorus, and spending seconds proving it is worse than reporting the one
 * difference that is honestly there.
 */
const MAX_TOKENS = 2000;

/**
 * How much of the shorter body must already be shared before the picker treats
 * two differently named sections as likely copies of one another.
 *
 * This is also the linter's gate for volunteering a repeated song part. One
 * owner matters here: if discovery and the rule used different thresholds,
 * two surfaces would give different answers about which lyrics are alike.
 */
export const MIN_LINK_SIMILARITY = 0.5;

/** Keep automatic discovery far below the one-off link aligner's hard ceiling. */
export const MAX_LINK_DISCOVERY_TOKENS = 400;

const SIMILARITY_CACHE_LIMIT = 64;
const similarityCache = new Map<string, number>();

/** A section body normalized the same way everywhere that discovers copies. */
export function comparableSectionBody(section: Section): string {
	return section.lines
		.map((line) => line.text.trim())
		.filter((line) => line.length > 0)
		.join('\n');
}

/**
 * Words and line breaks, with the whitespace between them left as glue.
 *
 * Words rather than characters, because a character alignment finds `to` inside
 * `tonight` and `together` and calls it a common anchor — a shared run nobody
 * would recognise as shared, which then propagates edits the user never asked
 * to propagate. Line breaks are tokens of their own so the alignment keeps a
 * lyric's line structure instead of drifting words across it.
 */
function tokenize(body: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;
	while (index < body.length) {
		const char = body[index] ?? '';
		if (char === '\n') {
			tokens.push({ from: index, to: index + 1, text: '\n' });
			index += 1;
			continue;
		}
		if (isTokenWhitespace(char)) {
			index += 1;
			continue;
		}
		let end = index;
		while (end < body.length && !isTokenWhitespace(body[end] ?? '')) {
			end += 1;
		}
		tokens.push({ from: index, to: end, text: body.slice(index, end) });
		index = end;
	}
	return tokens;
}

/** `tokenize`'s count without allocating the tokens, for discovery ceilings. */
function tokenCount(body: string): number {
	let count = 0;
	let inWord = false;
	for (let index = 0; index < body.length; index += 1) {
		const char = body[index];
		if (char === '\n') {
			count += 1;
			inWord = false;
		} else if (isTokenWhitespace(char ?? '')) {
			inWord = false;
		} else if (!inWord) {
			count += 1;
			inWord = true;
		}
	}
	return count;
}

/**
 * Longest common subsequence of two token lists, as `left index → right index`.
 *
 * A line break is worth two word tokens. Lyrics repeat words constantly, so an
 * unweighted LCS can gain one word by abandoning a matching newline
 * and aligning that word with the line beside it. The resulting hole crosses
 * the boundary and the picker draws both neighbouring lines as one replacement.
 * Keeping line breaks as anchors leaves word-level alignment to happen inside
 * the lines they actually belong to.
 */
function lcsPairs(left: readonly Token[], right: readonly Token[]): Map<number, number> {
	const rows = left.length;
	const cols = right.length;
	const stride = cols + 1;
	const table = new Uint32Array((rows + 1) * stride);
	for (let row = rows - 1; row >= 0; row -= 1) {
		for (let col = cols - 1; col >= 0; col -= 1) {
			const text = left[row]?.text;
			table[row * stride + col] =
				text === right[col]?.text
					? (table[(row + 1) * stride + col + 1] ?? 0) + (text === '\n' ? 2 : 1)
					: Math.max(table[(row + 1) * stride + col] ?? 0, table[row * stride + col + 1] ?? 0);
		}
	}
	const pairs = new Map<number, number>();
	let row = 0;
	let col = 0;
	while (row < rows && col < cols) {
		const text = left[row]?.text;
		const match =
			text === right[col]?.text
				? (table[(row + 1) * stride + col + 1] ?? 0) + (text === '\n' ? 2 : 1)
				: -1;
		if (match === table[row * stride + col]) {
			pairs.set(row, col);
			row += 1;
			col += 1;
		} else if ((table[(row + 1) * stride + col] ?? 0) >= (table[row * stride + col + 1] ?? 0)) {
			row += 1;
		} else {
			col += 1;
		}
	}
	return pairs;
}

/**
 * The same run of tokens in every body, but only where the text between the
 * first and last token is identical throughout.
 *
 * The tokens matching is not enough on its own: the glue between them is not
 * tokenized, so two copies can match word for word and still differ by a double
 * space. Verifying the whole span is what keeps "shared" meaning shared.
 */
function spanFor(
	bodies: readonly string[],
	tokens: readonly Token[][],
	partners: readonly Map<number, number>[],
	first: number,
	last: number
): TextRange[] | undefined {
	const base = tokens[0];
	const from = base?.[first]?.from;
	const to = base?.[last]?.to;
	if (from === undefined || to === undefined) {
		return undefined;
	}
	const text = (bodies[0] ?? '').slice(from, to);
	const ranges: TextRange[] = [{ from, to }];
	for (let body = 1; body < bodies.length; body += 1) {
		const pairs = partners[body - 1];
		const own = tokens[body];
		const start = own?.[pairs?.get(first) ?? -1]?.from;
		const end = own?.[pairs?.get(last) ?? -1]?.to;
		if (
			start === undefined ||
			end === undefined ||
			(bodies[body] ?? '').slice(start, end) !== text
		) {
			return undefined;
		}
		ranges.push({ from: start, to: end });
	}
	return ranges;
}

/**
 * Hand the whitespace at a run's edges back to the shared text either side.
 *
 * A run begins where the last matched word ended, so `my love` against
 * `my friend` opens the difference at the space and reports ` love` against
 * ` friend` — a difference whose first character is the same in both copies,
 * which is the one thing a difference is not.
 *
 * Whitespace only, and never a letter. `love` against `lover` share four
 * characters, and trimming those would end the shared run in the middle of a
 * word — the coincidental anchor that tokenizing by word exists to prevent,
 * arriving through the back door. A run where one member has nothing is left
 * alone, because there is no character there to be shared.
 */
function trimSharedWhitespace(
	candidates: { from: number; to: number }[],
	bodies: readonly string[]
): void {
	const charAt = (member: number, at: number): string => (bodies[member] ?? '').charAt(at);
	const shrinkable = (): boolean => candidates.every((range) => range.from < range.to);
	while (shrinkable()) {
		const lead = charAt(0, candidates[0]?.from ?? 0);
		if (
			!/\s/u.test(lead) ||
			candidates.some((range, member) => charAt(member, range.from) !== lead)
		) {
			break;
		}
		candidates.forEach((range) => (range.from += 1));
	}
	while (shrinkable()) {
		const tail = charAt(0, (candidates[0]?.to ?? 1) - 1);
		if (
			!/\s/u.test(tail) ||
			candidates.some((range, member) => charAt(member, range.to - 1) !== tail)
		) {
			break;
		}
		candidates.forEach((range) => (range.to -= 1));
	}
}

/**
 * The gaps between the shared spans, slot by slot, dropped where every member
 * agrees the slot is empty.
 *
 * Dropped together or kept together, never per member: a run that is empty in
 * one copy and a whole word in another is exactly the difference worth
 * recording — `there tonight` against `there`, where one of them simply stops.
 * Keeping the empty side is what gives that difference somewhere to be typed.
 */
function holesBetween(shared: readonly TextRange[][], bodies: readonly string[]): TextRange[][] {
	const slots = shared[0]?.length ?? 0;
	const holes: TextRange[][] = bodies.map(() => []);
	for (let slot = 0; slot <= slots; slot += 1) {
		const candidates = bodies.map((body, member) => ({
			from: slot === 0 ? 0 : (shared[member]?.[slot - 1]?.to ?? 0),
			to: slot === slots ? body.length : (shared[member]?.[slot]?.from ?? body.length)
		}));
		if (candidates.every((range) => range.from === range.to)) {
			continue;
		}
		trimSharedWhitespace(candidates, bodies);
		candidates.forEach((range, member) => holes[member]?.push(range));
	}
	return holes;
}

/** Everything differs, or nothing does. The answer when alignment is refused. */
function wholeBodies(bodies: readonly string[]): TextRange[][] {
	const first = bodies[0] ?? '';
	if (bodies.every((body) => body === first)) {
		return bodies.map(() => []);
	}
	return bodies.map((body) => [{ from: 0, to: body.length }]);
}

/**
 * Work out which parts of these bodies already say the same thing.
 *
 * This runs when a link is made, and never again on its own: an alignment
 * recomputed on every edit cannot tell a mistake from a decision. Fix a typo in
 * one copy and a live aligner has to guess whether the copies were meant to
 * converge or to diverge further — guess one way and it eats a difference the
 * user meant, guess the other and the typo stays in one copy for good. So this
 * decides the shape once and the shape is then kept as stored intent.
 *
 * Returns one list of divergent runs per body, all of the same length.
 */
export function alignBodies(bodies: readonly string[]): TextRange[][] {
	if (bodies.length < 2) {
		return bodies.map(() => []);
	}
	const tokens = bodies.map(tokenize);
	if (tokens.some((list) => list.length > MAX_TOKENS)) {
		return wholeBodies(bodies);
	}
	const base = tokens[0] ?? [];
	const partners = tokens.slice(1).map((other) => lcsPairs(base, other));

	// A base token is shared only where *every* other body matched it, and a run
	// only continues where every body's partner index advances with it — two
	// matched tokens that are adjacent here but not there have something between
	// them somewhere, which is a difference.
	const runs: { first: number; last: number }[] = [];
	for (let index = 0; index < base.length; index += 1) {
		if (!partners.every((pairs) => pairs.has(index))) {
			continue;
		}
		const previous = runs.at(-1);
		const continues =
			previous?.last === index - 1 &&
			partners.every((pairs) => pairs.get(index) === (pairs.get(index - 1) ?? -2) + 1);
		if (continues && previous) {
			previous.last = index;
		} else {
			runs.push({ first: index, last: index });
		}
	}

	const shared: TextRange[][] = bodies.map(() => []);
	for (const run of runs) {
		for (let last = run.last; last >= run.first; last -= 1) {
			const spans = spanFor(bodies, tokens, partners, run.first, last);
			if (spans) {
				spans.forEach((range, member) => shared[member]?.push(range));
				break;
			}
		}
	}
	return holesBetween(shared, bodies);
}

/**
 * The fraction of the shorter body already shared by two possible copies.
 *
 * It deliberately uses `alignBodies`, so the words a discovery score calls
 * shared are exactly the words the link itself would mirror. Empty bodies have
 * no evidence of similarity. An exact match is answered before the optional
 * token ceiling, while a refused non-exact alignment scores zero.
 */
export function linkBodySimilarity(
	left: string,
	right: string,
	options: { maxTokens?: number } = {}
): number {
	if (left.length === 0 || right.length === 0) {
		return 0;
	}
	if (left === right) {
		return 1;
	}
	const maxTokens = options.maxTokens ?? MAX_TOKENS;
	if (tokenCount(left) > maxTokens || tokenCount(right) > maxTokens) {
		return 0;
	}
	const key = `${left.length}:${left}\u0000${right}`;
	let similarity = similarityCache.get(key);
	if (similarity === undefined) {
		const holes = alignBodies([left, right]);
		const own = (holes[0] ?? []).reduce((total, hole) => total + (hole.to - hole.from), 0);
		similarity = (left.length - own) / Math.min(left.length, right.length);
		if (similarityCache.size >= SIMILARITY_CACHE_LIMIT) {
			similarityCache.clear();
		}
		similarityCache.set(key, similarity);
	}
	return similarity;
}

/** Whether similarity is strong enough to offer these bodies as copies. */
export function bodiesAreSimilarEnoughToLink(
	left: string,
	right: string,
	options: { maxTokens?: number } = {}
): boolean {
	return linkBodySimilarity(left, right, options) >= MIN_LINK_SIMILARITY;
}

/**
 * A span in one member's body together with the divergent runs it covers, as a
 * half-open `[firstHole, lastHole)` range into that member's own run list.
 */
export interface HoleSpan extends TextRange {
	firstHole: number;
	lastHole: number;
}

/**
 * Widen a span until neither end is inside a divergent run, and say which runs
 * that swallowed.
 *
 * An edit that reaches into a difference — retyping a line that contains one,
 * deleting across it — is the user writing over words that were deliberately
 * their own, so the difference goes and the words become shared. Widening is
 * what makes that expressible: both ends then sit in shared text, where every
 * member has the same coordinates.
 */
export function expandOverHoles(holes: readonly TextRange[], from: number, to: number): HoleSpan {
	let start = from;
	let end = to;
	for (const hole of holes) {
		if (hole.from < start && start < hole.to) {
			start = hole.from;
		}
		if (hole.from < end && end < hole.to) {
			end = hole.to;
		}
	}
	let firstHole = 0;
	while (firstHole < holes.length && (holes[firstHole]?.to ?? 0) <= start) {
		firstHole += 1;
	}
	let lastHole = firstHole;
	while (lastHole < holes.length && (holes[lastHole]?.from ?? 0) < end) {
		lastHole += 1;
	}
	return { from: start, to: end, firstHole, lastHole };
}

/**
 * Grow a span out to the whole shared runs it touches, without crossing a
 * divergent one.
 *
 * What gets carried to the peers is therefore a whole run rather than the
 * handful of characters that changed, and that is a correctness property rather
 * than a convenience. A shared run is identical in every member *by definition*,
 * so writing the whole of it is idempotent where the group is in step and
 * repairs it where it is not — while carrying only the edited slice trusts every
 * offset inside the run to already line up, and quietly leaves the copies
 * disagreeing forever the first time one does not.
 *
 * It is also what makes a group with no differences behave exactly as the old
 * whole-body link did: one run, the whole body, replaced.
 *
 * The hole indices are untouched, because a run boundary is where a hole starts
 * and widening to it crosses nothing.
 */
export function widenToRuns(holes: readonly TextRange[], length: number, span: HoleSpan): HoleSpan {
	return {
		...span,
		from: span.firstHole === 0 ? 0 : (holes[span.firstHole - 1]?.to ?? span.from),
		to: span.lastHole === holes.length ? length : (holes[span.lastHole]?.from ?? span.to)
	};
}

/** Whether a change sits wholly inside one divergent run, and is therefore its own. */
export function holeContaining(
	holes: readonly TextRange[],
	from: number,
	to: number
): number | undefined {
	const index = holes.findIndex((hole) => hole.from <= from && to <= hole.to);
	return index < 0 ? undefined : index;
}

/**
 * The same span, in another member's body.
 *
 * Both ends are measured from the nearest divergent run rather than from the
 * top of the body, because the distance between two holes is shared text and is
 * therefore the same number in every member — while the holes themselves are
 * different lengths and would throw off anything counted past them.
 */
export function translateSpan(
	source: { holes: readonly TextRange[]; length: number },
	peer: { holes: readonly TextRange[]; length: number },
	span: { from: number; to: number; firstHole: number; lastHole: number }
): TextRange | undefined {
	if (source.holes.length !== peer.holes.length) {
		return undefined;
	}
	const startAnchor = span.firstHole === 0 ? 0 : source.holes[span.firstHole - 1]?.to;
	const endAnchor =
		span.lastHole === source.holes.length ? source.length : source.holes[span.lastHole]?.from;
	const peerStartAnchor = span.firstHole === 0 ? 0 : peer.holes[span.firstHole - 1]?.to;
	const peerEndAnchor =
		span.lastHole === peer.holes.length ? peer.length : peer.holes[span.lastHole]?.from;
	if (
		startAnchor === undefined ||
		endAnchor === undefined ||
		peerStartAnchor === undefined ||
		peerEndAnchor === undefined
	) {
		return undefined;
	}
	const from = peerStartAnchor + (span.from - startAnchor);
	const to = peerEndAnchor - (endAnchor - span.to);
	return from <= to && from >= 0 && to <= peer.length ? { from, to } : undefined;
}
