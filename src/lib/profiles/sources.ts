import type { SourceReference } from '$lib/core/types.js';
import { sourceRegistry } from '$lib/rules/data/sources.js';

/** Read source snapshots, with official and community standing kept distinct.
 * A reviewed source does not resolve every interpretation: coverage.ts records those limits. */
export const profileSources: readonly SourceReference[] = [
	{
		id: 'MXM-MAIN',
		platform: 'musixmatch',
		url: 'https://community.musixmatch.com/guidelines?lng=en',
		pageTitle: 'Musixmatch Lyrics Guidelines',
		sectionTitle: 'Transcription, formatting, sync, structure, performers and translation',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: 'd40e95310953b4eb5f91c8093d65862e53e4cb86d29a09ba9ed3d6a2983b0def',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-EN-I',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/216161-english-insights',
		pageTitle: 'English Insights',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '36402d7e4b2d1f2ce7b9e95b874a74470c281c858cf2fa3736e58791dfe10f44',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-EN-Q',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/215653-english-faq',
		pageTitle: 'English FAQ',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: 'fdcb256ef1532ed835500aa48f9dffae352b1472083902ec3a3a3d5eda5693e2',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-NO-I',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/219259-norwegian-insights',
		pageTitle: 'Norwegian Insights',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '7d1331e6cb0d2feca5d5bd85e22ecb1e404ddf05b066837ef8cf67b49fbf049e',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-DE-I',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/219239-german-insights',
		pageTitle: 'German Insights',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '7c0c15a204bb77395cc7e44c21d8c8d4de1b81c4f98b4375a6703ea25f6d39dd',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-ES-I',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/218397-spanish-insights',
		pageTitle: 'Spanish Insights',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '9621149d929e2ae8069252ac47aa692c99c51a3dc0d3e2c8bc9ddc428e015b72',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-ES-Q',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/215661-spanish-faq',
		pageTitle: 'Spanish FAQ',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: 'b29e53bbd20417de6e6d74eef9dd093eb98fcbeb4fa97059bf9ed15f52df5704',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-FR-I',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/218850-french-insights',
		pageTitle: 'French Insights',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: 'bdf22e24d4a510ff5fb103aff50b13b27097c5ae40bb21043b3bd1c82fdc9478',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-FR-Q',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/215665-french-faq',
		pageTitle: 'French FAQ',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '6c94259c2ded2aa531f6711e169827efb6f2459126e4c1d5e570dfa09899123f',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-JA-I',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/219237-japanese-insights',
		pageTitle: 'Japanese Insights',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '97e67c74ab0c1b88d495c2b7fdce05018f63d01616cf56d0c7893921b18769c4',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-JA-Q',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/215671-japanese-faq',
		pageTitle: 'Japanese FAQ',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: 'e4217af4b3c7d4916a0e89adeae67c19f15004940c9cf7b4f455eb1c4484dbeb',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-ROM',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/215401-romanization-and-supported-languages',
		pageTitle: 'Romanization and supported languages',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '271147d968958f74725942d2ecf1d02f2cb76ea828cba65dac03f2626dce752b',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-STUDIO',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/219731-the-studio-for-starters',
		pageTitle: 'The Studio for starters',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '3ba07aa34315f9acdc3d4158b688bd35ad48da26600d6819660068127c7526a7',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-TRANSLATE',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/articles/220242-take-your-favorite-lyrics-worldwide-how-to-translate',
		pageTitle: 'How to translate',
		sectionTitle: 'Official Musixmatch Help Center guidance',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '8c74405d1f496e52a2a8e5b2a0c8eca6c9d5197904321c5dc57a8cad0fafc49a',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-INSIGHTS',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/collections/571786-writing-guidelines-insights-per-language',
		pageTitle: 'Language Insights collection',
		sectionTitle: 'Official language-guidance directory',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '538fce989d0fc4b7517a9dc08245cb477c1065a5ef578932dcdedefded220936',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-FAQ',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/collections/571709-writing-guidelines-faq-per-language',
		pageTitle: 'Language FAQ collection',
		sectionTitle: 'Official language-guidance directory',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '84122e6ea4a25f111ee0099b895606010c2fc9f7929dc894c9908ffc22c3d85e',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-ROM-INSIGHTS',
		platform: 'musixmatch',
		url: 'https://support.musixmatch.com/en/collections/576646-romanization-insights-per-language',
		pageTitle: 'Romanization Insights collection',
		sectionTitle: 'Official language-guidance directory',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '5ea69063d4dadd84db974dcdba877bd560b8ada96ffa140b1cd12bcb01f1d218',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-METADATA',
		platform: 'musixmatch',
		url: 'https://docs.musixmatch.com/musixmatch-metadata',
		pageTitle: 'Musixmatch metadata',
		sectionTitle: 'Official Musixmatch developer documentation',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '2e94402fa418e3ff0ae44966b3f89631bcf26cb22b101cd46fddc2148410357b',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-BULK',
		platform: 'musixmatch',
		url: 'https://docs.musixmatch.com/enterprises/lyrics-bulk-submission',
		pageTitle: 'Lyrics bulk submission',
		sectionTitle: 'Official partner submission documentation',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '0ed9b3fd42848ec231961d2e3078e31f8c2fc4eac59120af625feb21d5f4e87d',
		reviewStatus: 'reviewed',
		authority: 'external',
		platformStanding: 'official'
	},
	{
		id: 'MXM-EN-EXT',
		platform: 'musixmatch',
		url: 'https://docs.google.com/document/d/1njyoifp2cyG-IQu0495eX1Mo0Hp2qy-vl4IeHX0DSCw/preview',
		pageTitle: 'English Extended Guidelines',
		sectionTitle: 'Linked community guidance, supplementary standing',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: 'e84c39d6ae793235f5d3d0e65c758fc043d36223457cc39e80f940d07797b19d',
		reviewStatus: 'reviewed',
		authority: 'community',
		platformStanding: 'community'
	},
	{
		id: 'MXM-LINES',
		platform: 'musixmatch',
		url: 'https://docs.google.com/document/d/1ikqb3f--GK_yFGifnEhQ1Crnpntn2V0wJxj5el2vqiE/preview',
		pageTitle: 'Line-break teaching guide',
		sectionTitle: 'Linked community guidance, supplementary standing',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '70a0f4cc4f2030f4b2e85ccfd3be7e9f9de73472e83a866e70c962673d8cdf82',
		reviewStatus: 'reviewed',
		authority: 'community',
		platformStanding: 'community'
	},
	{
		id: 'MXM-DE-EXT',
		platform: 'musixmatch',
		url: 'https://docs.google.com/document/d/1T-rAxki41XiVLjIijV0jvzSxsyXZnf1snmEObj7229M/preview',
		pageTitle: 'German extended guide',
		sectionTitle: 'Linked community guidance, supplementary standing',
		retrievedAt: '2026-09-16',
		lastVerifiedAt: '2026-09-16',
		contentHash: '6ee66604c0227e2889c69cbfad64f030f835d3d9448f8589a71fc42ef1a2c8b2',
		reviewStatus: 'reviewed',
		authority: 'community',
		platformStanding: 'community'
	}
];

export const profileSourceRegistry: ReadonlyMap<string, SourceReference> = new Map(
	profileSources.map((source) => [source.id, source])
);

export function getProfileSource(id: string): SourceReference | undefined {
	return profileSourceRegistry.get(id) ?? sourceRegistry.get(id);
}
