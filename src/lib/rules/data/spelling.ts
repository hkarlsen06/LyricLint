export type SpellingContextGate =
	| 'general'
	| 'american-english'
	| 'cousin-meaning'
	| 'tool-meaning'
	| 'you-or-your-meaning'
	| 'percocet-meaning'
	| 'pronunciation'
	| 'line-position'
	| 'money-meaning'
	| 'accepted-variant';

export interface SpellingLookupContext {
	language: string;
}

interface SpellingMatchContext extends SpellingLookupContext {
	text: string;
	from: number;
	to: number;
	match: string;
}

export interface StandardizedSpelling {
	preferred: readonly string[];
	alternates: readonly string[];
	/**
	 * Curated, unambiguous transcription mistakes that are not themselves
	 * listed as alternates in the reviewed Genius guidance.
	 */
	commonMisspellings?: readonly string[];
	/**
	 * Detect a single insertion, deletion, substitution, or adjacent
	 * transposition around this preferred form. This is deliberately opt-in:
	 * short forms and preferred words with common one-edit neighbours would
	 * otherwise turn ordinary lyrics into spelling findings.
	 */
	fuzzy?: boolean;
	/** Real or intentionally stylized one-edit neighbours that must stay untouched. */
	fuzzyExceptions?: readonly string[];
	contextGate: SpellingContextGate;
	safe: boolean;
	pattern?: RegExp;
	exceptionDescription?: string;
	isException?: (context: SpellingMatchContext) => boolean;
	isSufficientContext?: (context: SpellingMatchContext) => boolean;
	resolvePreferred?: (context: SpellingMatchContext) => string;
}

export interface SpellingCandidate {
	from: number;
	to: number;
	found: string;
	replacement: string;
	contextGate: SpellingContextGate;
	safe: boolean;
	fuzzy: boolean;
}

const word = (source: string): RegExp =>
	new RegExp(`(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`, 'giu');

function nearby(context: SpellingMatchContext, radius = 36): string {
	return context.text
		.slice(Math.max(0, context.from - radius), Math.min(context.text.length, context.to + radius))
		.toLowerCase();
}

function isLineStart(context: SpellingMatchContext): boolean {
	const lineFrom = Math.max(context.text.lastIndexOf('\n', context.from - 1) + 1, 0);
	return context.text.slice(lineFrom, context.from).trim().length === 0;
}

function preserveSimpleCase(found: string, preferred: string): string {
	if (found === found.toUpperCase() && /\p{L}/u.test(found)) {
		return preferred.toUpperCase();
	}
	const first = found.match(/\p{L}/u)?.[0];
	if (first && first === first.toUpperCase()) {
		const index = preferred.search(/\p{L}/u);
		return index < 0
			? preferred
			: `${preferred.slice(0, index)}${preferred[index]?.toUpperCase()}${preferred.slice(index + 1)}`;
	}
	return preferred;
}

function normalizedSpelling(value: string): string {
	return value.normalize('NFC').toLocaleLowerCase('en').replaceAll('’', "'");
}

/** Whether two strings are one typo apart, including an adjacent transposition. */
function isSingleEditApart(left: string, right: string): boolean {
	const source = Array.from(normalizedSpelling(left));
	const target = Array.from(normalizedSpelling(right));
	const lengthDifference = source.length - target.length;
	if (Math.abs(lengthDifference) > 1 || (source.length === 0 && target.length === 0)) {
		return false;
	}

	if (lengthDifference === 0) {
		const differences: number[] = [];
		for (let index = 0; index < source.length; index += 1) {
			if (source[index] !== target[index]) {
				differences.push(index);
				if (differences.length > 2) {
					return false;
				}
			}
		}
		if (differences.length === 1) {
			return true;
		}
		return (
			differences.length === 2 &&
			differences[1] === differences[0] + 1 &&
			source[differences[0]] === target[differences[1]] &&
			source[differences[1]] === target[differences[0]]
		);
	}

	const longer = lengthDifference > 0 ? source : target;
	const shorter = lengthDifference > 0 ? target : source;
	let longerIndex = 0;
	let shorterIndex = 0;
	let skipped = false;
	while (longerIndex < longer.length && shorterIndex < shorter.length) {
		if (longer[longerIndex] === shorter[shorterIndex]) {
			longerIndex += 1;
			shorterIndex += 1;
			continue;
		}
		if (skipped) {
			return false;
		}
		skipped = true;
		longerIndex += 1;
	}
	return true;
}

const fuzzyWord = /['’]?[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*'?/gu;

/**
 * Reviewed spelling table. Empty alternate lists intentionally encode accepted,
 * pronunciation-dependent forms so callers do not infer a replacement.
 */
export const standardizedSpellings: readonly StandardizedSpelling[] = [
	{
		preferred: ["I'ma"],
		alternates: ["I'mma", 'Ima', 'Imma'],
		commonMisspellings: ["im'a"],
		fuzzy: true,
		fuzzyExceptions: ["I'm"],
		contextGate: 'general',
		safe: true,
		pattern: word("I'mma|Im'a|Ima|Imma")
	},
	{
		preferred: ["'cause"],
		alternates: ['cause', 'cos'],
		commonMisspellings: ['coz', 'couse'],
		fuzzy: true,
		contextGate: 'general',
		safe: true,
		pattern: new RegExp("(?<![\\p{L}\\p{N}_'’])(?:cause|couse|cos|coz)(?![\\p{L}\\p{N}_])", 'giu')
	},
	{
		preferred: ["'cause"],
		alternates: ['cuz'],
		contextGate: 'cousin-meaning',
		safe: false,
		pattern: word('cuz'),
		exceptionDescription: '`cuz` remains valid when it means cousin.',
		isException: (context) =>
			/\b(?:my|your|his|her|our|their|little|big|favorite|favourite)\s+cuz\b/u.test(
				nearby(context)
			),
		isSufficientContext: (context) =>
			/\bcuz\s+(?:i|you|we|they|he|she|it|the|a|an)\b/u.test(nearby(context))
	},
	{
		preferred: ['okay'],
		alternates: ['ok', 'O.K.'],
		commonMisspellings: ['okey'],
		fuzzy: true,
		contextGate: 'general',
		safe: true,
		pattern: word('O\\.K\\.|okey|ok'),
		resolvePreferred: (context) => (isLineStart(context) ? 'Okay' : 'okay')
	},
	{
		preferred: ["'til"],
		alternates: ['til'],
		contextGate: 'american-english',
		safe: false,
		pattern: new RegExp("(?<![\\p{L}\\p{N}_'’])til(?![\\p{L}\\p{N}_])", 'giu'),
		exceptionDescription: 'British English uses `till` and is not rewritten.',
		isSufficientContext: (context) => /^en-us$/iu.test(context.language)
	},
	{
		preferred: ['tryna'],
		alternates: ['trynna'],
		commonMisspellings: ['tryina'],
		fuzzy: true,
		contextGate: 'general',
		safe: true,
		pattern: word('trynna|tryina')
	},
	{
		preferred: ['ayy'],
		alternates: ['aye', 'ay'],
		commonMisspellings: ['ey', 'eyy', 'ayee'],
		contextGate: 'general',
		safe: true,
		pattern: word('ayee|aye|ay|eyy|ey')
	},
	{
		preferred: ['ho'],
		alternates: ['hoe'],
		contextGate: 'tool-meaning',
		safe: false,
		pattern: word('hoe'),
		exceptionDescription: '`hoe` remains valid for the gardening tool or its use.',
		isException: (context) =>
			/\b(?:garden|gardening|soil|weeds?|handle|blade|dig|row|field|farm)\b/u.test(nearby(context)),
		isSufficientContext: (context) =>
			/\b(?:know|hate|love|see|saw|with)\s+(?:that|this)\s+hoe\b/u.test(nearby(context)) ||
			/\bcall(?:ed|ing)?\s+\S+\s+(?:a|the)\s+hoe\b/u.test(nearby(context))
	},
	{
		preferred: ['though'],
		alternates: ['tho'],
		commonMisspellings: ['thoe', 'thogh', 'thoug'],
		contextGate: 'general',
		safe: true,
		pattern: word('thoe|thogh|thoug|tho')
	},
	{
		preferred: ['ya'],
		alternates: ['yah'],
		contextGate: 'you-or-your-meaning',
		safe: false,
		pattern: word('yah'),
		exceptionDescription: '`yah` remains valid when it means yeah or yes.',
		isSufficientContext: (context) =>
			/\b(?:tell|told|see|saw|hear|heard|love|need|want|miss|got|with|for)\s+yah\b/u.test(
				nearby(context)
			)
	},
	{
		preferred: ["y'all"],
		alternates: ['ya’ll'],
		commonMisspellings: ['yall', "ya'll"],
		fuzzy: true,
		contextGate: 'general',
		safe: true,
		pattern: word("ya’ll|ya'll|yall")
	},
	{
		preferred: ['skrrt'],
		alternates: ['skrt'],
		fuzzy: true,
		fuzzyExceptions: ['skirt'],
		contextGate: 'general',
		safe: true,
		pattern: word('skrt')
	},
	{
		preferred: ["Perc'", 'Perky'],
		alternates: ['Perk', 'Percy'],
		contextGate: 'percocet-meaning',
		safe: false,
		pattern: word('Perk|Percy'),
		exceptionDescription: 'The replacement applies only when the word refers to Percocet.',
		isSufficientContext: (context) =>
			/\b(?:percocet|pill|pills|pop|popped|dose|high)\b/u.test(nearby(context))
	},
	{
		preferred: ['bougie'],
		alternates: ['boujee', 'boujie'],
		commonMisspellings: ['bougi', 'bougy', 'bouji', 'bourgie'],
		fuzzy: true,
		fuzzyExceptions: ['boogie'],
		contextGate: 'general',
		safe: true,
		pattern: word('boujee|boujie|bourgie|bougi|bougy|bouji')
	},
	{
		preferred: ['shawty', 'shorty'],
		alternates: [],
		contextGate: 'pronunciation',
		safe: false,
		exceptionDescription: 'Both forms are accepted according to pronunciation.'
	},
	{
		preferred: ["lil'"],
		alternates: ['lil', "li'l"],
		contextGate: 'general',
		safe: true,
		pattern: new RegExp("(?<![\\p{L}\\p{N}_])(?:li'l|lil)(?![\\p{L}\\p{N}_'’])", 'giu')
	},
	{
		preferred: ['woah'],
		alternates: ['whoa'],
		commonMisspellings: ['whoah', 'whao', 'woa'],
		contextGate: 'general',
		safe: true,
		pattern: word('whoah|whoa|whao|woa')
	},
	{
		preferred: ['dog'],
		alternates: ['dawg'],
		contextGate: 'general',
		safe: true,
		pattern: word('dawg')
	},
	{
		preferred: ['chopper'],
		alternates: ['choppa'],
		commonMisspellings: ['choper'],
		fuzzy: true,
		fuzzyExceptions: ['chopped', 'shopper', 'copper', 'hopper'],
		contextGate: 'general',
		safe: true,
		pattern: word('choppa|choper')
	},
	{
		preferred: ['oughta'],
		alternates: ['oughtta'],
		fuzzy: true,
		fuzzyExceptions: ['ought'],
		contextGate: 'general',
		safe: true,
		pattern: word('oughtta')
	},
	{
		preferred: ['naive'],
		alternates: ['naïve'],
		commonMisspellings: ['naieve', 'niaive', 'neive'],
		fuzzy: true,
		fuzzyExceptions: ['waive'],
		contextGate: 'general',
		safe: true,
		pattern: word('naïve|naieve|niaive|neive')
	},
	{
		preferred: ['cliché'],
		alternates: ['cliche'],
		commonMisspellings: ['clichè', 'clichê', 'clichee'],
		fuzzy: true,
		contextGate: 'general',
		safe: true,
		pattern: word('clichee|cliche|clichè|clichê')
	},
	{
		preferred: ['alright', 'all right'],
		alternates: [],
		contextGate: 'accepted-variant',
		safe: false,
		exceptionDescription: 'Both forms are accepted.'
	},
	{
		preferred: ['a.k.a.', 'a.k.a.s'],
		alternates: ['AKA', 'AKAs', 'A.K.A', 'A.K.A.s'],
		contextGate: 'line-position',
		safe: false,
		pattern: new RegExp(
			'(?<![\\p{L}\\p{N}_])(?:A\\.K\\.A\\.s|A\\.K\\.A|AKAs|AKA)(?![\\p{L}\\p{N}_.])',
			'giu'
		),
		resolvePreferred: (context) => {
			if (isLineStart(context)) {
				return context.match.toLowerCase().endsWith('s') ? 'A.K.A.s' : 'A.K.A.';
			}
			return context.match.toLowerCase().endsWith('s') ? 'a.k.a.s' : 'a.k.a.';
		}
	},
	{
		preferred: ['GOAT', 'GOATs'],
		alternates: ['G.O.A.T.', 'G.O.A.T.s'],
		commonMisspellings: ['G.O.A.T', 'G.O.A.Ts'],
		contextGate: 'general',
		safe: true,
		pattern: word('G\\.O\\.A\\.T(?:\\.s|s|\\.)?'),
		resolvePreferred: (context) => (context.match.toLowerCase().endsWith('s') ? 'GOATs' : 'GOAT')
	},
	{
		preferred: ['VIP', 'VIPs'],
		alternates: ['V.I.P.', 'V.I.P.s'],
		commonMisspellings: ['vip', 'vips', 'V.I.P', 'V.I.Ps'],
		contextGate: 'general',
		safe: true,
		pattern: word('V\\.I\\.P(?:\\.s|s|\\.)?|VIPs?'),
		resolvePreferred: (context) => (context.match.toLowerCase().endsWith('s') ? 'VIPs' : 'VIP')
	},
	{
		preferred: ['ASAP'],
		alternates: ['A.S.A.P.'],
		commonMisspellings: ['asap', 'A.S.A.P'],
		contextGate: 'general',
		safe: true,
		pattern: word('A\\.S\\.A\\.P\\.?|ASAP'),
		exceptionDescription: 'A$AP performer names remain unchanged.',
		isException: (context) => /\ba\$ap\b/iu.test(nearby(context)),
		resolvePreferred: (context) =>
			/^\s+(?:rocky|ferg|mob|nast|twelvyy|ant|illz)\b/iu.test(context.text.slice(context.to))
				? 'A$AP'
				: 'ASAP'
	},
	{
		preferred: ['cream'],
		alternates: ['CREAM', 'C.R.E.A.M.'],
		commonMisspellings: ['creem'],
		contextGate: 'money-meaning',
		safe: false,
		pattern: new RegExp(
			'(?<![\\p{L}\\p{N}_])(?:C\\.R\\.E\\.A\\.M\\.|CREAM|creem)(?![\\p{L}\\p{N}_])',
			'giu'
		),
		exceptionDescription: 'Keep C.R.E.A.M. when naming the Wu-Tang Clan song.',
		isException: (context) => /\b(?:wu-tang|wu tang|song|track)\b/u.test(nearby(context)),
		isSufficientContext: (context) =>
			/\b(?:money|cash|dollars?|bands?|stacks?|paid|pay|rich)\b/u.test(nearby(context)),
		resolvePreferred: () => 'cream'
	},
	{
		preferred: ['HAM'],
		alternates: ['H.A.M.'],
		commonMisspellings: ['H.A.M'],
		contextGate: 'general',
		safe: true,
		pattern: word('H\\.A\\.M\\.?')
	}
];

function htmlTokenRanges(text: string): Array<{ from: number; to: number }> {
	return Array.from(text.matchAll(/<[^>]*>/gu), (match) => ({
		from: match.index,
		to: match.index + match[0].length
	}));
}

function intersectsHtml(
	range: { from: number; to: number },
	htmlRanges: readonly { from: number; to: number }[]
): boolean {
	return htmlRanges.some((html) => range.from < html.to && html.from < range.to);
}

/** Find sufficiently certain reviewed spelling candidates without touching literal HTML tags. */
export function lookupSpellingCandidates(
	text: string,
	context: SpellingLookupContext
): SpellingCandidate[] {
	const candidates: SpellingCandidate[] = [];
	const htmlRanges = htmlTokenRanges(text);

	for (const spelling of standardizedSpellings) {
		if (!spelling.pattern) {
			continue;
		}

		for (const match of text.matchAll(spelling.pattern)) {
			const from = match.index;
			const to = from + match[0].length;
			if (intersectsHtml({ from, to }, htmlRanges)) {
				continue;
			}

			const matchContext: SpellingMatchContext = {
				...context,
				text,
				from,
				to,
				match: match[0]
			};
			if (spelling.isException?.(matchContext)) {
				continue;
			}
			if (spelling.isSufficientContext && !spelling.isSufficientContext(matchContext)) {
				continue;
			}

			const preferred =
				spelling.resolvePreferred?.(matchContext) ??
				preserveSimpleCase(match[0], spelling.preferred[0] ?? match[0]);
			if (preferred === match[0]) {
				continue;
			}
			candidates.push({
				from,
				to,
				found: match[0],
				replacement: preferred,
				contextGate: spelling.contextGate,
				safe: spelling.safe,
				fuzzy: false
			});
		}
	}

	const occupiedRanges = new Set(
		candidates.map((candidate) => `${candidate.from}:${candidate.to}`)
	);
	for (const match of text.matchAll(fuzzyWord)) {
		const from = match.index;
		const to = from + match[0].length;
		if (intersectsHtml({ from, to }, htmlRanges) || occupiedRanges.has(`${from}:${to}`)) {
			continue;
		}

		const matches = standardizedSpellings.flatMap((spelling) =>
			spelling.fuzzy &&
			!spelling.preferred.some(
				(preferred) => normalizedSpelling(preferred) === normalizedSpelling(match[0])
			) &&
			!spelling.alternates.some(
				(alternate) => normalizedSpelling(alternate) === normalizedSpelling(match[0])
			) &&
			!spelling.fuzzyExceptions?.some(
				(exception) => normalizedSpelling(exception) === normalizedSpelling(match[0])
			)
				? spelling.preferred
						.filter((preferred) => isSingleEditApart(match[0], preferred))
						.map((preferred) => ({ spelling, preferred }))
				: []
		);
		if (matches.length !== 1) {
			continue;
		}

		const [{ spelling, preferred }] = matches;
		const replacement = preserveSimpleCase(match[0], preferred);
		candidates.push({
			from,
			to,
			found: match[0],
			replacement,
			contextGate: spelling.contextGate,
			safe: false,
			fuzzy: true
		});
	}

	return candidates.sort((left, right) => left.from - right.from || left.to - right.to);
}
