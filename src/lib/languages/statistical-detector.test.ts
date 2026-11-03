import { describe, expect, it } from 'vitest';
import LanguageDetect from 'languagedetect';
import profiles from 'languagedetect/data/lang.json';
import { statisticalLanguageScores } from './statistical-detector.js';

const reference = new LanguageDetect();
reference.setLanguageType('iso2');

const lyrics = [
	'I see the morning light and know that you will stay with me tonight',
	'Je regarde la lumière du matin et je sais que tu resteras avec moi ce soir',
	'Jeg ser på deg og tenker på alle dagene vi hadde sammen, men nå er alt stille',
	'Ich sehe das Licht am Morgen und weiß, dass du heute Nacht bei mir bleibst',
	'Cuando sale la luna yo te espero en la calle y pienso en nuestro amor',
	'Я вижу утренний свет и знаю что ты останешься со мной этой ночью',
	'أرى ضوء الصباح وأعلم أنك ستبقى معي هذه الليلة',
	'사랑하는 마음을 노래하며 오늘도 너를 기다리고 있어',
	'朝の光を見ながら、あなたのことを思い出している',
	'मैं सुबह की रोशनी देखता हूँ और जानता हूँ कि तुम आज रात मेरे साथ रहोगे',
	'আমার সোনার বাংলা আমি তোমায় ভালোবাসি',
	'Καλημέρα στον κόσμο και στο φως της αγάπης',
	'שלום עולם אני רואה את אור הבוקר',
	'😀 A\u0301 café १२३ こんにちは\n\tمرحبا привет end',
	'İstanbul I ı i İ e\u0301 é 𐐀 𐐨',
	'',
	'a',
	'aa',
	'   ',
	'123 456 789 012',
	'abc abc abd abe abc',
	'\ud800\ud800\udfff\u0000\u0001',
	'~!@#$%^&*()_|+-=?;:",.<>[]{}\\/'
];

describe('flat statistical language scoring', () => {
	it('matches every score and its tie order on multilingual lyrics and Unicode edges', () => {
		for (const text of lyrics) {
			expect(statisticalLanguageScores(text), JSON.stringify(text)).toEqual(reference.detect(text));
		}
	});

	it('preserves the complete model vocabulary, including the rank-zero form', () => {
		for (const [language, model] of Object.entries(profiles.trigram)) {
			const ranked = Object.entries(model).sort(
				(left, right) => Number(left[1]) - Number(right[1])
			);
			for (const text of [
				ranked[0]![0].repeat(20),
				ranked
					.slice(0, 30)
					.map(([trigram]) => trigram)
					.join(' '),
				ranked
					.slice(-30)
					.map(([trigram]) => trigram)
					.join(' ')
			]) {
				expect(statisticalLanguageScores(text), language).toEqual(reference.detect(text));
			}
		}
	});

	it('matches mixed scripts, unseen trigrams and changing inputs without score state leaking', () => {
		let state = 0x651ba;
		const alphabet = Array.from('abcxyz0123 \t\néøåñßİıжяאبتहक中가😀\u0301');
		for (let sample = 0; sample < 100; sample++) {
			let text = '';
			for (let character = 0; character < 40 + sample * 3; character++) {
				state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
				text += alphabet[state % alphabet.length];
			}
			expect(statisticalLanguageScores(text), `sample ${sample}`).toEqual(reference.detect(text));
		}
		const long = lyrics.slice(0, 7).join('\n').repeat(200);
		expect(long.length).toBeGreaterThan(65_536);
		expect(statisticalLanguageScores(long)).toEqual(reference.detect(long));
	});
});
