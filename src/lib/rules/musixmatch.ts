import { profileLanguage } from '$lib/profiles/languages.js';
import { hasConfirmedFact } from '$lib/profiles/confirmed-facts.js';
import type {
	Diagnostic,
	LyricLine,
	ParsedDocument,
	RuleContext,
	RuleDefinition,
	TextRange
} from '$lib/core/types.js';
import { languagePolicyGaps } from '$lib/profiles/coverage.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './catalog/utils.js';
import { repeatPlaceholderRule } from './catalog/repeat-placeholder.js';
import {
	frenchQuestionSpacingEdits,
	japanesePunctuationEdits
} from '$lib/profiles/representation.js';
export { japanesePunctuationWidth } from '$lib/profiles/representation.js';

const general = ['MXM-MAIN'];
const latinLanguages = ['en', 'no', 'de', 'es', 'fr'];

function startsWithRetainedCase(text: string): boolean {
	const word = /^\s*["“«「『]*(\p{L}[\p{L}\p{M}'’-]*)/u.exec(text)?.[1] ?? '';
	return /\p{Ll}\p{Lu}/u.test(word) || /^\s*["“«「『]*e\.e\./u.test(text);
}

function language(context: RuleContext): string {
	return profileLanguage(context.language);
}

function lyrics(document: ParsedDocument): LyricLine[] {
	return document.sections
		.flatMap((section) => section.lines)
		.filter((line) => line.text.trim() !== '' && line.text.trim() !== '#INSTRUMENTAL');
}

function review(
	rule: RuleDefinition,
	range: TextRange,
	message: string,
	explanation: string,
	sourceIds: string[] = rule.sourceIds
): Diagnostic {
	return {
		...diagnostic(rule, range, message, explanation, undefined, sourceIds),
		severity: 'manual-review'
	};
}

function preview(
	rule: RuleDefinition,
	context: RuleContext,
	range: TextRange,
	message: string,
	explanation: string,
	label: string,
	insert: string
): Diagnostic {
	return diagnostic(rule, range, message, explanation, [
		replacementFix(context, 'preview', label, range, insert)
	]);
}

/** Physical layout is independent of the parser's Genius section-header interpretation. */
function physicalLines(document: ParsedDocument): LyricLine[] {
	const lines: LyricLine[] = [];
	const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/gu;
	for (const match of document.text.matchAll(pattern)) {
		if (match[0] === '') continue;
		const from = match.index;
		const to = from + match[1].length;
		const ending = match[2];
		lines.push({
			from,
			to,
			text: match[1],
			styleSpans: [],
			lineEnding:
				ending === '\r\n' ? 'crlf' : ending === '\n' ? 'lf' : ending === '\r' ? 'cr' : 'none',
			lineEndingRange: { from: to, to: from + match[0].length }
		});
	}
	return lines;
}

const labelsRule: RuleDefinition = {
	id: 'mxm.transcription.labels',
	version: 1,
	defaultSeverity: 'warning',
	sourceIds: general,
	check(document) {
		return physicalLines(document).flatMap((line) =>
			/^\s*\[[^\]\r\n]+\]\s*$/u.test(line.text) && !/^\s*\[\?+\]\s*$/u.test(line.text)
				? [
						review(
							this,
							line,
							'Review this bracketed label for Musixmatch.',
							'Musixmatch keeps section and performer tags outside lyric text. Confirm this is metadata; bracketed vocals and uncertain words must remain until their meaning is known. Switching retains recognized Genius metadata separately.'
						)
					]
				: []
		);
	}
};

const repetitionRule: RuleDefinition = {
	...repeatPlaceholderRule,
	id: 'mxm.transcription.repeat-placeholder',
	sourceIds: general
};

const censorRule: RuleDefinition = {
	id: 'mxm.transcription.censor-mask',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: general,
	check(document) {
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(line, /(?:\p{L}+\*+\p{L}*|\*{2,}\p{L}*)/gu).map((match) =>
				review(
					this,
					match,
					'Confirm the audible part of this censored word.',
					'Musixmatch transcribes audible expletives and represents an audio-censored cutoff with a hyphen. Stars do not establish which letters were heard; listen before replacing them.'
				)
			)
		);
	}
};

const soundRule: RuleDefinition = {
	id: 'mxm.transcription.sound-description',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: general,
	check(document) {
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(line, /(?<!\*)\*[^*\r\n]+\*(?!\*)/gu).map((match) =>
				review(
					this,
					match,
					'Confirm whether this is a sound description.',
					'Musixmatch excludes descriptions of production sounds but retains sung vocalizations. Asterisks alone do not establish that distinction; keep the text until its role is confirmed.'
				)
			)
		);
	}
};

const unknownRule: RuleDefinition = {
	id: 'mxm.transcription.unknown',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: ['MXM-EN-Q'],
	check(document, context) {
		if (language(context) !== 'en') return [];
		const findings: Diagnostic[] = [];
		for (const match of document.text.matchAll(/\[\?+\]|\(\?+\)|(?<=^|\s)\?+(?=$|\s)/gu)) {
			findings.push(
				review(
					this,
					{ from: match.index, to: match.index + match[0].length },
					'This word still needs transcription.',
					'The English Musixmatch FAQ rejects question-mark replacement tokens. Keep this uncertainty visible until listening or research establishes the word; deleting the token or inventing lyrics would lose information.'
				)
			);
		}
		return findings;
	}
};

const stanzaRule: RuleDefinition = {
	id: 'mxm.format.stanza-length',
	version: 1,
	defaultSeverity: 'warning',
	sourceIds: general,
	settlesOn: 'document',
	check(document) {
		const findings: Diagnostic[] = [];
		let block: LyricLine[] = [];
		const flush = () => {
			if (block.length > 10)
				findings.push(
					diagnostic(
						this,
						{ from: block[0].from, to: block[block.length - 1].to },
						'This lyric block has more than ten lines.',
						'Musixmatch limits formatted sections to ten physical lyric lines. Choose a break that follows the music and meaning; soft wraps are not extra lines, and a layout break does not establish a new musical tag.'
					)
				);
			block = [];
		};
		const headers = new Set(
			document.sections.flatMap(({ header }) => (header ? [header.from] : []))
		);
		for (const line of physicalLines(document)) {
			if (!line.text.trim() || line.text.trim() === '#INSTRUMENTAL' || headers.has(line.from))
				flush();
			else block.push(line);
		}
		flush();
		return findings;
	}
};

const lineInitialRule: RuleDefinition = {
	id: 'mxm.format.line-initial',
	version: 1,
	defaultSeverity: 'suggestion',
	sourceIds: general,
	fixability: 'preview',
	check(document, context) {
		if (![...latinLanguages, 'ja'].includes(language(context))) return [];
		return lyrics(document).flatMap((line) => {
			const match = /^\s*["“«「『]*(\p{Ll})/u.exec(line.text);
			if (!match || /^\s*(?:iPhone|iPad|iOS|e\.e\.)/u.test(line.text)) return [];
			if (startsWithRetainedCase(line.text)) return [];
			const from = line.from + match[0].length - match[1].length;
			const range = { from, to: from + match[1].length };
			return [
				preview(
					this,
					context,
					range,
					'Review the lowercase line beginning.',
					'Musixmatch capitalizes lyric line beginnings. Preserve established name casing and review mixed-language context before changing it.',
					`Capitalize ${match[1]}`,
					match[1].toLocaleUpperCase(context.language)
				)
			];
		});
	}
};

const sentenceRule: RuleDefinition = {
	id: 'mxm.format.sentence-case',
	version: 1,
	defaultSeverity: 'suggestion',
	sourceIds: general,
	fixability: 'preview',
	check(document, context) {
		if (!latinLanguages.includes(language(context))) return [];
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(line, /[?!]\s+["“«]?(?<letter>\p{Ll})/gu).flatMap((match) => {
				const letter = match.groups.letter!;
				const range = { from: match.to - letter.length, to: match.to };
				if (startsWithRetainedCase(line.text.slice(range.from - line.from))) return [];
				return preview(
					this,
					context,
					range,
					'Review the lowercase sentence beginning.',
					'Capitalize the start after a question or exclamation when it begins a new sentence. Names and quoted fragments require context.',
					`Capitalize ${letter}`,
					letter.toLocaleUpperCase(context.language)
				);
			})
		);
	}
};

const expressiveCaseRule: RuleDefinition = {
	id: 'mxm.format.expressive-case',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: general,
	settlesOn: 'document',
	check(document, context) {
		if (![...latinLanguages, 'ja'].includes(language(context))) return [];
		return lyrics(document).flatMap((line) => {
			const words = line.text.match(/\p{L}[\p{L}\p{M}]*/gu) ?? [];
			const shouting = words.length >= 3 && words.every((word) => /^\p{Lu}+$/u.test(word));
			const title =
				words.length >= 4 &&
				language(context) !== 'de' &&
				words.every((word) => /^\p{Lu}\p{Ll}+$/u.test(word));
			return shouting || title
				? [
						review(
							this,
							line,
							'Review this line’s expressive capitalization.',
							'Musixmatch does not use all-caps for shouting or arbitrary title case. Names, acronyms, German nouns and embedded languages require context; no automatic lowercasing is offered.'
						)
					]
				: [];
		});
	}
};

const parentheticalRule: RuleDefinition = {
	id: 'mxm.format.parenthetical-case',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: ['MXM-MAIN', 'MXM-EN-Q', 'MXM-ES-I', 'MXM-JA-Q'],
	check(document, context) {
		const lang = language(context);
		if (!['en', 'es', 'ja'].includes(lang)) return [];
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(line, /\([^()\r\n]*\)/gu).flatMap((match) => {
				if (lang === 'ja' && /\p{L}/u.test(match.text))
					return [
						review(
							this,
							match,
							'The Japanese parenthetical case guidance needs review.',
							'The Japanese FAQ names parenthetical beginnings among capitalization cases, while the main page requires grammar-dependent capitals. Preserve the authored form until this scope is resolved.',
							['MXM-MAIN', 'MXM-JA-Q']
						)
					];
				if (
					!/^\(\p{Lu}/u.test(match.text) ||
					/^\((?:I(?:['’]|\s|\))|[A-Z]{2,}\b)/u.test(match.text)
				)
					return [];
				return [
					review(
						this,
						match,
						'Review capitalization in these backing vocals.',
						'Musixmatch normally uses grammatical case inside backing-vocal parentheses. A name, a new sentence, or another vocal role can justify the capital; do not lowercase all parenthetical lyrics.',
						[lang === 'en' ? 'MXM-EN-Q' : 'MXM-ES-I']
					)
				];
			})
		);
	}
};

/** A terminal period in a spelled initialism is not a sentence-ending full stop. */
export function isDottedInitialism(textBeforeAndIncludingPeriod: string): boolean {
	return /(?:^|[^\p{L}\p{N}])(?:\p{Lu}\.){2,}$/u.test(textBeforeAndIncludingPeriod);
}

const terminalRule: RuleDefinition = {
	id: 'mxm.punctuation.line-ending',
	version: 1,
	defaultSeverity: 'warning',
	sourceIds: general,
	fixability: 'preview',
	check(document, context) {
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(line, /[,.](?=["'“”‘’)\]}」』]*\s*$)/gu).flatMap((match) => {
				const offset = match.from - line.from;
				if (
					match.text === '.' &&
					(line.text[offset - 1] === '.' || isDottedInitialism(line.text.slice(0, offset + 1)))
				)
					return [];
				// A decimal, a name, or an abbreviation is not settled by a terminal mark.
				const name = match.text === ',' ? 'comma' : 'period';
				return [
					preview(
						this,
						context,
						match,
						`Review this terminal ${name}.`,
						'Musixmatch excludes commas and non-acronym periods at lyric line endings. Acronyms retain their own punctuation; review names and abbreviations before removal.',
						`Remove the ${name}`,
						''
					)
				];
			})
		);
	}
};

const repeatedMarksRule: RuleDefinition = {
	id: 'mxm.punctuation.repeated-marks',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: general,
	check(document) {
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(line, /[!?！？]{2,}/gu).map((match) =>
				review(
					this,
					match,
					'Review repeated question or exclamation marks.',
					'Musixmatch permits these marks with restraint. Keep the mark needed by grammar or delivery; expressive intent and title punctuation require review.'
				)
			)
		);
	}
};

const interruptionRule: RuleDefinition = {
	id: 'mxm.punctuation.interruption',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: general,
	check(document) {
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(line, /(?:…|\.{3,}|—)(?=["'“”‘’)]*\s*$)/gu).map((match) =>
				review(
					this,
					match,
					'Confirm the reason for this line-ending interruption.',
					'Musixmatch uses a hyphen for an unfinished word and an ellipsis for an unfinished sentence or fade-out. A musical pause alone does not establish either; a Genius dropped-word dash cannot be rewritten from shape alone.'
				)
			)
		);
	}
};

const numericRule: RuleDefinition = {
	id: 'mxm.numbers.context',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: general,
	check(document, context) {
		const lang = language(context);
		return lyrics(document).flatMap((line) => {
			// Most lyric lines contain no digits. Avoid testing Unicode word boundaries at
			// every character, and search English number words only in English scope.
			const candidates = /\p{Nd}/u.test(line.text)
				? matchesOutsideMarkup(
						line,
						/(?<![\p{L}\p{N}])[\p{Nd}]+(?:[.,:/][\p{Nd}]+)*(?![\p{L}\p{N}])/gu
					)
				: [];
			if (lang === 'en')
				candidates.push(
					...matchesOutsideMarkup(
						line,
						/\b(?:eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/giu
					)
				);
			return candidates.flatMap((match) => {
				if (hasConfirmedFact(context, 'quantity', match, match.text)) return [];
				const sources =
					lang === 'fr'
						? ['MXM-MAIN', 'MXM-FR-I', 'MXM-FR-Q']
						: lang === 'es'
							? ['MXM-MAIN', 'MXM-ES-Q']
							: general;
				return [
					review(
						this,
						match,
						lang === 'fr'
							? 'Review this number and the French time exceptions.'
							: 'Confirm this number’s meaning before converting it.',
						'Musixmatch generally spells quantities through ten and uses digits above ten, with separate rules for dates, phones, decades, names, fixed expressions and times. Exact times and o’clock differ. A value alone does not prove its role or pronunciation; no numeric rewrite is offered.' +
							(lang === 'fr'
								? ' The French source is unclear about precise times and the boundary at ten, so authored wording is retained.'
								: ''),
						sources
					)
				];
			});
		});
	}
};

const standardizedForms = new Map([
	['imma', "I'ma"],
	['ima', "I'ma"],
	['outa', 'outta'],
	['ballin', "ballin'"],
	['gon', "gon'"],
	['til', "'til"]
]);

const standardizedRule: RuleDefinition = {
	id: 'mxm.spelling.standardized',
	version: 1,
	defaultSeverity: 'suggestion',
	sourceIds: general,
	fixability: 'preview',
	check(document, context) {
		if (language(context) !== 'en') return [];
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(
				line,
				/(?<![\p{L}'’])(?:imma|ima|outa|outta|ballin|gon|til)(?![\p{L}'’])/giu
			).flatMap((match) => {
				const form = match.text.toLowerCase();
				const replacement = standardizedForms.get(form);
				if (!replacement) return [];
				const insert =
					match.text[0] === match.text[0].toUpperCase() && form !== 'imma' && form !== 'ima'
						? replacement.charAt(0).toUpperCase() + replacement.slice(1)
						: replacement;
				return [
					preview(
						this,
						context,
						match,
						'Review this standardized slang spelling.',
						'Musixmatch lists a finite set of standardized forms. Apply this form only if the sung word has that meaning; names, dialect and letter-by-letter delivery must remain as heard.',
						`Use ${insert}`,
						insert
					)
				];
			})
		);
	}
};

const speechRule: RuleDefinition = {
	id: 'mxm.punctuation.direct-speech',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: general,
	check(document, context) {
		const lang = language(context);
		if (!latinLanguages.includes(lang)) return [];
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(line, /[,;:]\s*["“«]/gu).map((match) =>
				review(
					this,
					match,
					'Confirm this quotation’s role and punctuation.',
					lang === 'es'
						? 'Spanish direct speech uses a colon, a space and an opening quotation mark, except when the colon would end a line. Indirect speech and hypothetical words differ; quoted artist, song or album names are not necessarily speech.'
						: lang === 'fr'
							? 'French Musixmatch guidance restricts colons and semicolons except when they belong to a sung song title. Quotation role needs context; do not apply the general comma rule blindly.'
							: 'The main Musixmatch page introduces direct speech with a comma, quotation marks and a capital. Quoted names and fragments are different roles. The German community supplement has different, advisory punctuation; preserve ambiguous text.',
					lang === 'es' ? ['MXM-ES-I', 'MXM-ES-Q'] : lang === 'fr' ? ['MXM-FR-I'] : general
				)
			)
		);
	}
};

const instrumentalRule: RuleDefinition = {
	id: 'mxm.structure.instrumental',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: general,
	settlesOn: 'document',
	check(document, context) {
		const lines = physicalLines(document);
		return lines.flatMap((line, index) => {
			if (line.text.trim() !== '#INSTRUMENTAL') return [];
			const lang = language(context);
			const hasBefore = lines
				.slice(0, index)
				.some((item) => item.text.trim() && item.text.trim() !== '#INSTRUMENTAL');
			const hasAfter = lines
				.slice(index + 1)
				.some((item) => item.text.trim() && item.text.trim() !== '#INSTRUMENTAL');
			const findings: Diagnostic[] = [];
			if (
				!hasBefore ||
				!hasAfter ||
				!hasConfirmedFact(context, 'instrumental-interval', line, line.text)
			)
				findings.push(
					review(
						this,
						line,
						!hasBefore || !hasAfter
							? 'An instrumental marker belongs between lyric sections.'
							: 'Confirm this instrumental interval.',
						'Musixmatch uses this marker only for more than fifteen consecutive seconds without qualifying lyrics between separately tagged sections, never inside a section or at a track edge. Whole-track instrumental status is separate. Text or two lyric-start times cannot prove the interval.'
					)
				);
			if (lang === 'ja')
				findings.push(
					review(
						this,
						line,
						'The instrumental spacing sources disagree.',
						'The main Musixmatch page requires a blank after the marker; the Japanese FAQ says it is not needed. The authored spacing is retained and no competing fix is offered.',
						['MXM-MAIN', 'MXM-JA-Q']
					)
				);
			else if (hasAfter && lines[index + 1]?.text.trim())
				findings.push(
					diagnostic(
						this,
						line,
						'Review the missing blank after the instrumental marker.',
						'The main Musixmatch guideline puts a blank line after an interior instrumental marker. Confirm the interval and its section placement before changing layout.',
						[
							replacementFix(
								context,
								'preview',
								'Add a blank line',
								{ from: line.lineEndingRange.to, to: line.lineEndingRange.to },
								document.text.slice(line.lineEndingRange.from, line.lineEndingRange.to) || '\n'
							)
						]
					)
				);
			return findings;
		});
	}
};

const spanishPlacementRule: RuleDefinition = {
	id: 'mxm.vocals.spanish-placement',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: ['MXM-ES-I'],
	check(document, context) {
		if (language(context) !== 'es') return [];
		return lyrics(document).flatMap((line) =>
			/^\s*\(/u.test(line.text) || /[.,;:!?]\s*\(/u.test(line.text)
				? [
						review(
							this,
							line,
							'Review the placement of these secondary vocals.',
							'Spanish guidance avoids initial or whole-line backing parentheses and punctuation immediately before them. Confirm lead, background, audience and overlapping roles before moving or unwrapping text; the change can affect timing.'
						)
					]
				: []
		);
	}
};

const spanishAcronymRule: RuleDefinition = {
	id: 'mxm.spelling.spanish-acronym',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: ['MXM-ES-Q'],
	check(document, context) {
		if (language(context) !== 'es') return [];
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(line, /(?<!\p{L})(?:\p{Lu}\.){2,}/gu).map((match) =>
				review(
					this,
					match,
					'Confirm whether these letters form an acronym.',
					'The Spanish FAQ writes acronyms in capitals without separating dots or spaces. Sung individual letters, abbreviations and names are different cases; their role cannot be inferred from punctuation alone.'
				)
			)
		);
	}
};

const spanishAccentsRule: RuleDefinition = {
	id: 'mxm.spelling.spanish-accents',
	version: 1,
	defaultSeverity: 'suggestion',
	sourceIds: ['MXM-ES-Q'],
	fixability: 'preview',
	check(document, context) {
		if (language(context) !== 'es') return [];
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(
				line,
				/(?<!\p{L})(?:sólo|éste|ésta|éstos|éstas|ése|ésa|ésos|ésas|aquél|aquélla|aquéllos|aquéllas|fué|fuí|dió|vió)(?!\p{L})/giu
			).map((match) => {
				const insert = match.text.replace(
					/[áéíóÁÉÍÓ]/gu,
					(character) => character.normalize('NFD')[0]
				);
				return preview(
					this,
					context,
					match,
					'Review this Spanish accent convention.',
					'The Musixmatch Spanish FAQ uses these specified words without a written accent. Check quoted names or embedded-language text before changing the form; this is not a general accent-removal rule.',
					`Use ${insert}`,
					insert
				);
			})
		);
	}
};

const lineLengthRule: RuleDefinition = {
	id: 'mxm.format.line-length',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: ['MXM-ES-Q'],
	check(document, context) {
		if (language(context) !== 'es') return [];
		return lyrics(document).flatMap((line) =>
			line.text.length > 70
				? [
						review(
							this,
							line,
							'Review this line against the Spanish character limit.',
							`The Spanish FAQ limits lines to 70 characters but does not define the Unicode counting unit. This line has ${line.text.length} UTF-16 units and ${Array.from(line.text).length} Unicode code points. Review musical phrasing and the count; do not split automatically at an arbitrary position.`
						)
					]
				: []
		);
	}
};

const frenchMarksRule: RuleDefinition = {
	id: 'mxm.punctuation.french-marks',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: ['MXM-FR-I'],
	check(document, context) {
		if (language(context) !== 'fr') return [];
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(line, /[!:;]/gu).map((match) =>
				review(
					this,
					match,
					'Review this mark under the French guideline.',
					'French Musixmatch guidance excludes exclamation marks, colons and semicolons, except punctuation that belongs to a sung song title. Preserve title punctuation; a text-only check cannot establish that exception.'
				)
			)
		);
	}
};

const frenchQuestionSpaceRule: RuleDefinition = {
	id: 'mxm.punctuation.french-question-space',
	version: 1,
	defaultSeverity: 'warning',
	sourceIds: ['MXM-FR-I'],
	fixability: 'preview',
	check(document, context) {
		if (language(context) !== 'fr') return [];
		return lyrics(document).flatMap((line) =>
			frenchQuestionSpacingEdits(line.text, line.from).map((match) =>
				preview(
					this,
					context,
					match,
					'Remove the space before this question mark.',
					'The French Musixmatch article specifically places a question mark without a preceding space. This lyric convention differs from some ordinary French publishing typography.',
					'Remove the space',
					''
				)
			)
		);
	}
};

const frenchElisionRule: RuleDefinition = {
	id: 'mxm.spelling.french-elision',
	version: 1,
	defaultSeverity: 'suggestion',
	sourceIds: ['MXM-FR-Q'],
	fixability: 'preview',
	check(document, context) {
		if (language(context) !== 'fr') return [];
		return lyrics(document).flatMap((line) =>
			matchesOutsideMarkup(line, /(?<!\p{L})y['’]\s*a(?!\p{L})/giu).map((match) =>
				preview(
					this,
					context,
					match,
					'Review the apostrophe in y a.',
					'The French Musixmatch FAQ writes this spoken form as y a, without an apostrophe. Preserve unrelated quoted names or embedded languages.',
					'Use y a',
					match.text[0] === 'Y' ? 'Y a' : 'y a'
				)
			)
		);
	}
};

const japaneseWidthRule: RuleDefinition = {
	id: 'mxm.punctuation.japanese-width',
	version: 1,
	defaultSeverity: 'suggestion',
	sourceIds: ['MXM-JA-Q'],
	fixability: 'preview',
	check(document, context) {
		if (language(context) !== 'ja') return [];
		return lyrics(document).flatMap((line) =>
			japanesePunctuationEdits(line.text, line.from).flatMap((match) => {
				const insert = match.insert;
				return [
					preview(
						this,
						context,
						match,
						'Match this punctuation to the preceding character width.',
						'The Japanese Musixmatch FAQ uses fullwidth question and exclamation marks after fullwidth characters and ASCII marks after halfwidth characters. Only this mark changes; lyric scripts and other character forms stay exact.',
						`Use ${insert}`,
						insert
					)
				];
			})
		);
	}
};

const sourceCoverageRule: RuleDefinition = {
	id: 'mxm.policy.language-coverage',
	version: 1,
	defaultSeverity: 'manual-review',
	sourceIds: ['MXM-INSIGHTS', 'MXM-FAQ', 'MXM-ROM'],
	settlesOn: 'document',
	check(document, context) {
		const lang = language(context);
		if ((lang !== 'ar' && lang !== 'ko') || !document.text.trim()) return [];
		const ranges = [...(context.languageRanges ?? [])].sort((a, b) => a.from - b.from);
		const declared = ranges.find((range) => profileLanguage(range.language) === lang);
		let anchor = declared ? { from: declared.from, to: declared.to } : undefined;
		if (!anchor) {
			for (const line of lyrics(document)) {
				let from = line.from;
				for (const range of ranges) {
					if (range.from <= from && from < range.to) from = range.to;
				}
				if (from < line.to) {
					anchor = {
						from,
						to: Math.min(line.to, ranges.find((range) => from < range.from)?.from ?? line.to)
					};
					break;
				}
			}
		}
		if (!anchor) return [];
		return [
			review(
				this,
				anchor,
				'Review the language-specific policy coverage.',
				`${languagePolicyGaps[lang]} General Musixmatch checks run where their scope applies; no English spelling, number conversion or transliteration fallback is used. This is an evidence gap, not a claim that the lyrics are wrong.`
			)
		];
	}
};

/** These checks have identical policy, wording and edits in every language family. */
export const languageIndependentMusixmatchRules: ReadonlySet<RuleDefinition> = new Set([
	labelsRule,
	repetitionRule,
	censorRule,
	soundRule,
	stanzaRule,
	terminalRule,
	repeatedMarksRule,
	interruptionRule
]);

export const musixmatchRules: readonly RuleDefinition[] = [
	labelsRule,
	repetitionRule,
	censorRule,
	soundRule,
	unknownRule,
	stanzaRule,
	lineInitialRule,
	sentenceRule,
	expressiveCaseRule,
	parentheticalRule,
	terminalRule,
	repeatedMarksRule,
	interruptionRule,
	numericRule,
	standardizedRule,
	speechRule,
	instrumentalRule,
	spanishPlacementRule,
	spanishAcronymRule,
	spanishAccentsRule,
	lineLengthRule,
	frenchMarksRule,
	frenchQuestionSpaceRule,
	frenchElisionRule,
	japaneseWidthRule,
	sourceCoverageRule
];
