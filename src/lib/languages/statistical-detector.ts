import Parser from 'languagedetect/lib/Parser.js';
import ISO639 from 'languagedetect/lib/ISO639.js';
import profiles from 'languagedetect/data/lang.json';

const threshold = 300;
const models = Object.entries(profiles.trigram);
const trigramIds = new Map<string, number>();
for (const [, model] of models) {
	for (const trigram of Object.keys(model)) {
		if (!trigramIds.has(trigram)) trigramIds.set(trigram, trigramIds.size);
	}
}
const stride = trigramIds.size;
const ranks = new Uint16Array(models.length * stride).fill(threshold);
for (const [language, [, model]] of models.entries()) {
	for (const [trigram, rank] of Object.entries(model)) {
		ranks[language * stride + trigramIds.get(trigram)!] = Number(rank);
	}
}
const codes = models.map(([name]) => ISO639.getCode2(name));
const languageIds = new Map(models.map(([name], index) => [name, index]));
const languagesByBlock = new Map(
	Object.entries(profiles['trigram-unicodemap']).map(([block, languages]) => [
		block,
		Object.keys(languages).map((name) => languageIds.get(name)!)
	])
);

/** Same profiles, sample parser and score ordering as languagedetect, with flat model ranks. */
export function statisticalLanguageScores(text: string): Array<[string | null, number]> {
	if (text.length < 3) return [];
	const sample = new Parser(text);
	sample.setPadStart(true);
	sample.analyze();
	const trigrams = Object.entries(sample.getTrigramRanks());
	if (trigrams.length === 0) return [];

	const ids: number[] = [];
	const sampleRanks: number[] = [];
	let missingDistance = 0;
	for (const [trigram, rank] of trigrams) {
		const id = trigramIds.get(trigram);
		if (id === undefined) {
			missingDistance += threshold;
		} else {
			ids.push(id);
			sampleRanks.push(rank);
		}
	}

	// Keep the dependency's reverse block traversal and first-seen language order:
	// equal scores retain that order, including aliases that share an ISO code.
	const blocks = Object.keys(sample.getUnicodeBlocks());
	const seen = new Uint8Array(models.length);
	const candidates: number[] = [];
	for (let block = blocks.length - 1; block >= 0; block--) {
		for (const language of languagesByBlock.get(blocks[block]!) ?? []) {
			if (!seen[language]) {
				seen[language] = 1;
				candidates.push(language);
			}
		}
	}

	const scores: Array<[string | null, number]> = [];
	for (let index = candidates.length - 1; index >= 0; index--) {
		const language = candidates[index]!;
		const offset = language * stride;
		let distance = missingDistance;
		for (let trigram = ids.length - 1; trigram >= 0; trigram--) {
			const rank = ranks[offset + ids[trigram]!]!;
			distance += rank === threshold ? threshold : Math.abs(sampleRanks[trigram]! - rank);
		}
		const score = 1 - distance / trigrams.length / threshold;
		if (score) scores.push([codes[language]!, score]);
	}
	return scores.sort((left, right) => right[1] - left[1]);
}
