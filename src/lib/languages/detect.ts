import type { ParsedDocument, TextRange } from '$lib/core/types.js';
import type LanguageDetect from 'languagedetect';
import { languageSourceInventory } from './inventory.js';
import { getLanguagePack, resolveLanguageTag } from './registry.js';

const minimumStatisticalLetters = 40;
const minimumStatisticalScore = 0.2;
const minimumSelectedScoreRatio = 1.15;
const norwegianMarkers =
	/(?<!\p{L})(?:fortsatt|gjør|gjøre|hva|mer|mye|noe|noen|røyke|skjer)(?!\p{L})/giu;
const selectableTags = new Set(['en', ...languageSourceInventory.map((entry) => entry.tag)]);

let detector: LanguageDetect | undefined;
let detectorPromise: Promise<void> | undefined;

/** Load the statistical profiles only when a non-empty editor asks for them. */
export function loadStatisticalLanguageDetector(): Promise<void> {
	return (detectorPromise ??= import('languagedetect')
		.then(({ default: LanguageDetector }) => {
			detector = new LanguageDetector();
			detector.setLanguageType('iso2');
		})
		.catch((error: unknown) => {
			detectorPromise = undefined;
			throw error;
		}));
}

export interface SongLanguageDetection {
	tag: string;
	displayName: string;
	confidence: number;
	method: 'script' | 'statistical';
	range: TextRange;
}

interface ScriptProfile {
	tag: string;
	pattern: RegExp;
	minimumLetters: number;
	minimumShare: number;
}

const scriptProfiles: readonly ScriptProfile[] = [
	{ tag: 'ko', pattern: /\p{Script=Hangul}/gu, minimumLetters: 8, minimumShare: 0.65 },
	{ tag: 'th', pattern: /\p{Script=Thai}/gu, minimumLetters: 8, minimumShare: 0.65 },
	{ tag: 'he', pattern: /\p{Script=Hebrew}/gu, minimumLetters: 8, minimumShare: 0.65 },
	{ tag: 'el', pattern: /\p{Script=Greek}/gu, minimumLetters: 8, minimumShare: 0.65 },
	{ tag: 'gu', pattern: /\p{Script=Gujarati}/gu, minimumLetters: 8, minimumShare: 0.65 },
	{ tag: 'hi', pattern: /\p{Script=Devanagari}/gu, minimumLetters: 8, minimumShare: 0.65 },
	{ tag: 'si', pattern: /\p{Script=Sinhala}/gu, minimumLetters: 8, minimumShare: 0.65 },
	{ tag: 'my', pattern: /\p{Script=Myanmar}/gu, minimumLetters: 8, minimumShare: 0.65 },
	{ tag: 'am', pattern: /\p{Script=Ethiopic}/gu, minimumLetters: 8, minimumShare: 0.65 }
];

function maskedVisibleLine(text: string): string {
	return text
		.replace(/<[^>]*>/gu, (tag) => ' '.repeat(tag.length))
		.replace(/&(?:amp|lt|gt|quot|#39);/giu, (entity) => ' '.repeat(entity.length))
		.replaceAll('[?]', '   ');
}

function visibleLyrics(document: ParsedDocument): { text: string; range?: TextRange } {
	const lines = document.sections
		.flatMap((section) => section.lines)
		.map((line) => ({ line, masked: maskedVisibleLine(line.text) }));
	const firstVisibleLine = lines.find(({ masked }) => /\p{L}/u.test(masked));
	const cleaned = lines
		.map(({ masked }) => masked)
		.join('\n')
		.replace(/\s+/gu, ' ')
		.trim();

	if (!firstVisibleLine) {
		return { text: cleaned };
	}

	const leadingWhitespace = /^\s*/u.exec(firstVisibleLine.masked)?.[0].length ?? 0;
	const trailingWhitespace = /\s*$/u.exec(firstVisibleLine.masked)?.[0].length ?? 0;
	return {
		text: cleaned,
		range: {
			from: firstVisibleLine.line.from + leadingWhitespace,
			to: Math.max(
				firstVisibleLine.line.from + leadingWhitespace,
				firstVisibleLine.line.to - trailingWhitespace
			)
		}
	};
}

function countMatches(text: string, pattern: RegExp): number {
	return Array.from(text.matchAll(pattern)).length;
}

function directScriptTag(text: string, letterCount: number): string | undefined {
	const kanaCount =
		countMatches(text, /\p{Script=Hiragana}/gu) + countMatches(text, /\p{Script=Katakana}/gu);
	const hanCount = countMatches(text, /\p{Script=Han}/gu);

	if (kanaCount >= 4 && (kanaCount + hanCount) / letterCount >= 0.55) {
		return 'ja';
	}
	if (hanCount >= 12 && hanCount / letterCount >= 0.65) {
		return 'zh';
	}

	for (const profile of scriptProfiles) {
		const count = countMatches(text, profile.pattern);
		if (count >= profile.minimumLetters && count / letterCount >= profile.minimumShare) {
			return profile.tag;
		}
	}
	return undefined;
}

function normalizedDetectorTag(tag: unknown): string | undefined {
	if (typeof tag !== 'string') return undefined;
	const normalized = tag === 'sr' || tag === 'hr' || tag === 'bs' ? 'sh' : tag;
	return selectableTags.has(normalized) ? normalized : undefined;
}

/**
 * Estimate the primary language of visible lyric lines without network access.
 *
 * Strong script signals are handled directly. Latin, Arabic, and Cyrillic languages
 * use LanguageDetect's local n-gram profiles and require a clear lead over the
 * selected language.
 */
export function detectSongLanguage(
	document: ParsedDocument,
	selectedLanguage: string
): SongLanguageDetection | undefined {
	const selectedTag = resolveLanguageTag(selectedLanguage);
	if (selectedTag === 'und') return undefined;

	const { text, range } = visibleLyrics(document);
	if (!range) return undefined;
	const letterCount = countMatches(text, /\p{L}/gu);
	if (letterCount === 0) return undefined;

	const scriptTag = directScriptTag(text, letterCount);
	if (scriptTag) {
		return {
			tag: scriptTag,
			displayName: getLanguagePack(scriptTag).displayName,
			confidence: 1,
			method: 'script',
			range
		};
	}

	if (letterCount < minimumStatisticalLetters) return undefined;
	if (!detector) return undefined;
	const scores = new Map<string, number>();
	for (const [rawTag, score] of detector.detect(text)) {
		const tag = normalizedDetectorTag(rawTag);
		if (!tag) continue;
		scores.set(tag, Math.max(scores.get(tag) ?? 0, score));
	}

	let best = [...scores].sort((left, right) => right[1] - left[1])[0];
	const norwegianScore = scores.get('no');
	if (
		best?.[0] === 'da' &&
		norwegianScore !== undefined &&
		best[1] < norwegianScore * minimumSelectedScoreRatio &&
		countMatches(text, norwegianMarkers) >= 2
	) {
		best = ['no', norwegianScore];
	}
	if (!best || best[1] < minimumStatisticalScore) return undefined;
	const selectedScore = scores.get(selectedTag) ?? 0;
	if (best[0] !== selectedTag && best[1] < selectedScore * minimumSelectedScoreRatio) {
		return undefined;
	}

	return {
		tag: best[0],
		displayName: getLanguagePack(best[0]).displayName,
		confidence: best[1],
		method: 'statistical',
		range
	};
}
