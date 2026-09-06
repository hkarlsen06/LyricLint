import { beforeAll, describe, expect, it, vi } from 'vitest';
import LanguageDetect from 'languagedetect';
import { parseDocument } from '$lib/core/parser.js';
import { detectSongLanguage, loadStatisticalLanguageDetector } from './detect.js';

describe('song language detection', () => {
	beforeAll(() => loadStatisticalLanguageDetector());

	it('detects visible French lyrics without section headers or performer markup', () => {
		const document = parseDocument(
			'[Verse: A & <i>B</i>]\n<i>Je regarde la lumière du matin</i>\nEt je sais que tu resteras avec moi ce soir'
		);

		expect(detectSongLanguage(document, 'en')).toMatchObject({
			tag: 'fr',
			displayName: 'French',
			method: 'statistical',
			range: { from: 25, to: 55 }
		});
	});

	it('treats regional English selections as the same detected language', () => {
		const document = parseDocument(
			'[Verse]\nI see the morning light and know that you will stay with me tonight\nThrough every shadow and every open door'
		);

		expect(detectSongLanguage(document, 'en-US')?.tag).toBe('en');
	});

	it('detects Norwegian lyrics mixed with English phrases under an English selection', () => {
		const document = parseDocument(`[Verse]
Before the drugs, I was a nice guy
Just want to tell you
Ayy, yo, hva skjer, homie?
Jeg gikk nettopp tom, har du noe mer, homie?
Yeah, homie, du vet lomma mi er apotek, homie
Fortsatt varm som sensommer
Ringer én chick og tre kommer
Baby, do your dance on me
Jeg er fra siste stopp på 151
Hun vil bare ha penger, bra, det er ikke no problem
Jeg har to som er klare, alle gode ting er tre
Jeg drar hjem til Rykkinn for å røyke weeden min i fred`);

		expect(detectSongLanguage(document, 'en')?.tag).toBe('no');
	});

	it('recognizes Japanese and Korean from their scripts', () => {
		expect(
			detectSongLanguage(
				parseDocument('[Verse]\n朝の光を見ながら、あなたのことを思い出している'),
				'en'
			)
		).toMatchObject({ tag: 'ja', method: 'script' });
		expect(
			detectSongLanguage(
				parseDocument('[Verse]\n사랑하는 마음을 노래하며 오늘도 너를 기다리고 있어'),
				'en'
			)
		).toMatchObject({ tag: 'ko', method: 'script' });
	});

	it('withholds a result for short or closely related ambiguous text', () => {
		expect(detectSongLanguage(parseDocument('[Verse]\nOh yeah'), 'en')).toBeUndefined();
		expect(
			detectSongLanguage(
				parseDocument(
					'[Vers]\nJeg ser på deg og tenker på alle dagene vi hadde sammen, men nå er alt stille og hjertet mitt lengter hjem'
				),
				'da'
			)
		).toBeUndefined();
	});

	it('reuses statistical input after a header or performer wrapper edit with fresh lyric ranges', () => {
		const lyric = 'I see the morning light and know that you will stay with me tonight';
		const original = detectSongLanguage(parseDocument(`[Verse]\n${lyric}`), 'en');
		const detect = vi.spyOn(LanguageDetect.prototype, 'detect');
		try {
			const prefix = '[Chorus: Avery]\n<i>';
			const current = detectSongLanguage(parseDocument(`${prefix}${lyric}</i>`), 'fr');
			expect(current).toEqual({
				...original,
				range: { from: prefix.length, to: prefix.length + lyric.length }
			});
			expect(detect).not.toHaveBeenCalled();
		} finally {
			detect.mockRestore();
		}
	});

	it('rechecks the selected-language threshold against cached statistical scores', () => {
		const document = parseDocument(
			'[Vers]\nJeg ser på deg og tenker på alle dagene vi hadde sammen, men nå er alt stille og hjertet mitt lengter hjem'
		);
		detectSongLanguage(document, 'en');
		const detect = vi.spyOn(LanguageDetect.prototype, 'detect');
		try {
			expect(detectSongLanguage(document, 'da')).toBeUndefined();
			expect(detect).not.toHaveBeenCalled();
		} finally {
			detect.mockRestore();
		}
	});

	it('recomputes changed lyrics and returns results that cannot mutate cached analysis', () => {
		const english = parseDocument(
			'[Verse]\nI see the morning light and know that you will stay with me tonight'
		);
		const original = detectSongLanguage(english, 'en')!;
		const expected = structuredClone(original);
		original.tag = 'fr';
		original.range.from = 1000;
		expect(detectSongLanguage(english, 'en')).toEqual(expected);
		expect(
			detectSongLanguage(
				parseDocument(
					'[Verse]\nJe regarde la lumière du matin et je sais que tu resteras avec moi ce soir'
				),
				'en'
			)?.tag
		).toBe('fr');
	});

	it('keeps script counts exact across repeated lines, eviction and oversized input', () => {
		const lyric = '사랑하는 마음을 노래하며 오늘도 너를 기다리고 있어';
		const original = detectSongLanguage(parseDocument(`[Verse]\n${lyric}`), 'en');
		for (let index = 0; index < 1005; index++) {
			detectSongLanguage(parseDocument(`짧은 글 ${index}`), 'en');
		}
		expect(detectSongLanguage(parseDocument(`[Verse]\n${lyric}`), 'en')).toEqual(original);
		const long = Array.from({ length: 100 }, () => lyric).join(' ');
		expect(long.length).toBeGreaterThan(2048);
		expect(detectSongLanguage(parseDocument(`[Verse]\n${long}`), 'en')).toMatchObject({
			tag: 'ko',
			method: 'script',
			range: { from: 8, to: 8 + long.length }
		});
		expect(detectSongLanguage(parseDocument(`[Verse]\n${lyric}\n${lyric}`), 'en')?.tag).toBe('ko');
	});
});
