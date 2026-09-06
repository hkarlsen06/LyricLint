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

async function loadDetector(): Promise<void> {
	try {
		const { default: LanguageDetector } = await import('languagedetect');
		detector = new LanguageDetector();
		detector.setLanguageType('iso2');
	} catch (error) {
		// A failed load is retried by the next asking editor rather than
		// remembered, so the promise is cleared before the rejection travels.
		detectorPromise = undefined;
		throw error;
	}
}

/** Load the statistical profiles only when a non-empty editor asks for them. */
export function loadStatisticalLanguageDetector(): Promise<void> {
	return (detectorPromise ??= loadDetector());
}

interface SongLanguageDetection {
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

const scriptPatterns = [
	/[\p{Script=Hiragana}\p{Script=Katakana}]/gu,
	/\p{Script=Han}/gu,
	...scriptProfiles.map((profile) => profile.pattern)
];
const lineAnalysisLimit = 1000;
const maximumCachedLineLength = 2048;
const maximumCachedStatisticalLength = 65_536;

interface VisibleLine {
	text: string;
	leadingWhitespace: number;
	trailingWhitespace: number;
	letters: number;
	scripts: readonly number[];
}

const visibleLines = new Map<string, VisibleLine>();
let statisticalText: string | undefined;
let statisticalResult: ReadonlyMap<string, number> | undefined;

function maskedVisibleLine(text: string): string {
	return text
		.replace(/<[^>]*>/gu, (tag) => ' '.repeat(tag.length))
		.replace(/&(?:amp|lt|gt|quot|#39);/giu, (entity) => ' '.repeat(entity.length))
		.replaceAll('[?]', '   ');
}

/** The lyric text detection reads, and where its first visible line sits. */
interface VisibleLyrics {
	text: string;
	range?: TextRange;
	letters: number;
	scripts: readonly number[];
}

function visibleLine(text: string): VisibleLine {
	const cached = visibleLines.get(text);
	if (cached) return cached;
	const masked = maskedVisibleLine(text);
	const result: VisibleLine = {
		text: masked.replace(/\s+/gu, ' ').trim(),
		leadingWhitespace: /^\s*/u.exec(masked)?.[0].length ?? 0,
		trailingWhitespace: /\s*$/u.exec(masked)?.[0].length ?? 0,
		letters: countMatches(masked, /\p{L}/gu),
		scripts: scriptPatterns.map((pattern) => countMatches(masked, pattern))
	};
	if (text.length <= maximumCachedLineLength) {
		if (visibleLines.size >= lineAnalysisLimit) {
			const oldest = visibleLines.keys().next().value;
			if (oldest !== undefined) visibleLines.delete(oldest);
		}
		visibleLines.set(text, result);
	}
	return result;
}

function visibleLyrics(document: ParsedDocument): VisibleLyrics {
	const text: string[] = [];
	let range: TextRange | undefined;
	let letters = 0;
	const scripts = scriptPatterns.map(() => 0);
	for (const section of document.sections) {
		for (const line of section.lines) {
			const visible = visibleLine(line.text);
			if (visible.text.length > 0) text.push(visible.text);
			letters += visible.letters;
			for (let index = 0; index < scripts.length; index++) {
				scripts[index]! += visible.scripts[index]!;
			}
			if (!range && visible.letters > 0) {
				range = {
					from: line.from + visible.leadingWhitespace,
					to: Math.max(line.from + visible.leadingWhitespace, line.to - visible.trailingWhitespace)
				};
			}
		}
	}
	return { text: text.join(' '), range, letters, scripts };
}

function countMatches(text: string, pattern: RegExp): number {
	let count = 0;
	pattern.lastIndex = 0;
	while (pattern.exec(text) !== null) count++;
	return count;
}

function directScriptTag(counts: readonly number[], letterCount: number): string | undefined {
	const kanaCount = counts[0]!;
	const hanCount = counts[1]!;

	if (kanaCount >= 4 && (kanaCount + hanCount) / letterCount >= 0.55) {
		return 'ja';
	}
	if (hanCount >= 12 && hanCount / letterCount >= 0.65) {
		return 'zh';
	}

	for (const [index, profile] of scriptProfiles.entries()) {
		const count = counts[index + 2]!;
		if (count >= profile.minimumLetters && count / letterCount >= profile.minimumShare) {
			return profile.tag;
		}
	}
	return undefined;
}

function normalizedDetectorTag(tag: string): string | undefined {
	const normalized = tag === 'sr' || tag === 'hr' || tag === 'bs' ? 'sh' : tag;
	return selectableTags.has(normalized) ? normalized : undefined;
}

function statisticalScores(text: string): ReadonlyMap<string, number> {
	// Headers, performer wrappers and the selected language can change while
	// the statistical input stays identical. Reuse only those text-local scores;
	// selection-dependent thresholds and current document ranges remain fresh.
	if (text === statisticalText && statisticalResult) return statisticalResult;
	const scores = new Map<string, number>();
	for (const [rawTag, score] of detector!.detect(text)) {
		const tag = normalizedDetectorTag(rawTag);
		if (!tag) continue;
		scores.set(tag, Math.max(scores.get(tag) ?? 0, score));
	}
	if (text.length <= maximumCachedStatisticalLength) {
		statisticalText = text;
		statisticalResult = scores;
	}
	return scores;
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

	const { text, range, letters: letterCount, scripts } = visibleLyrics(document);
	if (!range) return undefined;
	if (letterCount === 0) return undefined;

	const scriptTag = directScriptTag(scripts, letterCount);
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
	const scores = statisticalScores(text);

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
