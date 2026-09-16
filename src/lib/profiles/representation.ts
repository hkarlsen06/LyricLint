import { profileLanguage } from './languages.js';
import type { TextEdit } from '$lib/core/types.js';
import { scanPhysicalLines } from '$lib/core/parser.js';
import type { ProfileId } from './types.js';

export interface RepresentationContext {
	profile: ProfileId;
	sourceProfile: ProfileId;
	language: string;
	contentKind?: 'original' | 'translation' | 'romanization' | 'unknown';
}

/** Only unambiguous preceding classes. Ambiguous-width symbols and combining marks stay exact. */
export function japanesePunctuationWidth(previous: string): 'full' | 'half' | undefined {
	if (/^[\x21-\x7e\uff61-\uff9f]$/u.test(previous)) return 'half';
	if (
		/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff01-\uff60]$/u.test(
			previous
		)
	)
		return 'full';
	return undefined;
}

/** MX-FR03: the official French lyric convention explicitly removes this spacing. */
export function frenchQuestionSpacingEdits(text: string, offset = 0): TextEdit[] {
	if (/[<>]/u.test(text)) return [];
	return Array.from(text.matchAll(/[^\S\r\n]+(?=\?)/gu), (match) => ({
		from: offset + match.index,
		to: offset + match.index + match[0].length,
		insert: ''
	}));
}

/** MX-JA09: change only the mark; never normalize the preceding character or whole string. */
export function japanesePunctuationEdits(text: string, offset = 0): TextEdit[] {
	if (/[<>]/u.test(text)) return [];
	const edits: TextEdit[] = [];
	for (const match of text.matchAll(/[?!？！]/gu)) {
		const prior = edits.at(-1);
		const previous =
			prior?.to === offset + match.index
				? prior.insert
				: (Array.from(text.slice(Math.max(0, match.index - 2), match.index)).at(-1) ?? '');
		const width = japanesePunctuationWidth(previous);
		if (!width) continue;
		const insert =
			width === 'full'
				? match[0] === '?'
					? '？'
					: match[0] === '!'
						? '！'
						: undefined
				: match[0] === '？'
					? '?'
					: match[0] === '！'
						? '!'
						: undefined;
		if (insert)
			edits.push({
				from: offset + match.index,
				to: offset + match.index + match[0].length,
				insert
			});
	}
	return edits;
}

/**
 * Pure representation candidates. The conversion model owns their source form and identity;
 * a rendered string must never be reimported or fed back as authored content on a mode switch.
 * Native-profile authored wording is exact even if that profile's linter offers a correction.
 */
export function representationEdits(text: string, context: RepresentationContext): TextEdit[] {
	if (context.profile !== 'musixmatch' || context.sourceProfile !== 'genius') return [];
	const language = profileLanguage(context.language);
	if (language !== 'fr' && language !== 'ja') return [];
	return scanPhysicalLines(text).flatMap((line) =>
		language === 'fr'
			? frenchQuestionSpacingEdits(line.text, line.from)
			: japanesePunctuationEdits(line.text, line.from)
	);
}
