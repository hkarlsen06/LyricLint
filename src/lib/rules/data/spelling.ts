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

/**
 * Reviewed spelling table. Empty alternate lists intentionally encode accepted,
 * pronunciation-dependent forms so callers do not infer a replacement.
 */
export const standardizedSpellings: readonly StandardizedSpelling[] = [
	{
		preferred: ["I'ma"],
		alternates: ["I'mma", 'Ima', 'Imma'],
		contextGate: 'general',
		safe: true,
		pattern: word("I'mma|Ima|Imma")
	},
	{
		preferred: ["'cause"],
		alternates: ['cause', 'cos'],
		contextGate: 'general',
		safe: true,
		pattern: new RegExp("(?<![\\p{L}\\p{N}_'’])(?:cause|cos)(?![\\p{L}\\p{N}_])", 'giu')
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
		contextGate: 'general',
		safe: true,
		pattern: word('O\\.K\\.|ok'),
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
		contextGate: 'general',
		safe: true,
		pattern: word('trynna')
	},
	{
		preferred: ['ayy'],
		alternates: ['aye', 'ay'],
		contextGate: 'general',
		safe: true,
		pattern: word('aye|ay')
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
			/\b(?:that|this|a|my|your|his|her|these|those)\s+hoe\b/u.test(nearby(context))
	},
	{
		preferred: ['though'],
		alternates: ['tho'],
		contextGate: 'general',
		safe: true,
		pattern: word('tho')
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
		contextGate: 'general',
		safe: true,
		pattern: word('ya’ll')
	},
	{
		preferred: ['skrrt'],
		alternates: ['skrt'],
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
		contextGate: 'general',
		safe: true,
		pattern: word('boujee|boujie')
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
		contextGate: 'general',
		safe: true,
		pattern: word('whoa')
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
		contextGate: 'general',
		safe: true,
		pattern: word('choppa')
	},
	{
		preferred: ['oughta'],
		alternates: ['oughtta'],
		contextGate: 'general',
		safe: true,
		pattern: word('oughtta')
	},
	{
		preferred: ['naive'],
		alternates: ['naïve'],
		contextGate: 'general',
		safe: true,
		pattern: word('naïve')
	},
	{
		preferred: ['cliché'],
		alternates: ['cliche'],
		contextGate: 'general',
		safe: true,
		pattern: word('cliche')
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
		pattern: word('A\\.K\\.A\\.s|A\\.K\\.A|AKAs|AKA'),
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
		contextGate: 'general',
		safe: true,
		pattern: word('G\\.O\\.A\\.T\\.s|G\\.O\\.A\\.T\\.'),
		resolvePreferred: (context) => (context.match.toLowerCase().endsWith('s') ? 'GOATs' : 'GOAT')
	},
	{
		preferred: ['VIP', 'VIPs'],
		alternates: ['V.I.P.', 'V.I.P.s'],
		contextGate: 'general',
		safe: true,
		pattern: word('V\\.I\\.P\\.s|V\\.I\\.P\\.'),
		resolvePreferred: (context) => (context.match.toLowerCase().endsWith('s') ? 'VIPs' : 'VIP')
	},
	{
		preferred: ['ASAP'],
		alternates: ['A.S.A.P.'],
		contextGate: 'general',
		safe: true,
		pattern: word('A\\.S\\.A\\.P\\.'),
		exceptionDescription: 'A$AP performer names remain unchanged.',
		isException: (context) => /\bA\$AP\b/u.test(nearby(context))
	},
	{
		preferred: ['cream'],
		alternates: ['CREAM', 'C.R.E.A.M.'],
		contextGate: 'money-meaning',
		safe: false,
		pattern: new RegExp(
			'(?<![\\p{L}\\p{N}_])(?:C\\.R\\.E\\.A\\.M\\.|CREAM)(?![\\p{L}\\p{N}_])',
			'gu'
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
		contextGate: 'general',
		safe: true,
		pattern: word('H\\.A\\.M\\.')
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
			candidates.push({
				from,
				to,
				found: match[0],
				replacement: preferred,
				contextGate: spelling.contextGate,
				safe: spelling.safe
			});
		}
	}

	return candidates.sort((left, right) => left.from - right.from || left.to - right.to);
}
