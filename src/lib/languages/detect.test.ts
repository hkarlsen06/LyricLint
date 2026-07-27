import { beforeAll, describe, expect, it } from 'vitest';
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
});
