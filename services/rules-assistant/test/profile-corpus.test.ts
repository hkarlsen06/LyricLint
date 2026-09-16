import { describe, expect, it, vi } from 'vitest';
import { corpus as genius } from '../generated/rules-context-data';
import { corpus as musixmatch } from '../generated/musixmatch-context-data';
import { createCorpusCatalog } from '../src/corpus';
import { createHandler } from '../src/index';
import { developerPrompt, promptCacheKey } from '../src/prompt';
import { providerRequest } from '../src/provider';
import { validateAnswer } from '../src/schema';
import { goodTurnstile, makeEnv, makeRequest, providerReturning, requestBody } from './harness';

describe('profile corpus allowlist', () => {
	it('rejects Genius citations from a Musixmatch answer while accepting its reviewed IDs', () => {
		const context = createCorpusCatalog([genius, musixmatch]).resolve(
			musixmatch.ruleSetVersion,
			musixmatch.contentHash,
			'musixmatch'
		)!;
		const answer = {
			scope: 'reviewed',
			blocks: [
				{
					kind: 'prose',
					text: 'Review a section label.',
					ruleIds: ['mxm.transcription.labels'],
					sourceIds: ['MXM-MAIN']
				}
			]
		};
		expect(() => validateAnswer(answer, context.ruleIds, context.sourceIds)).not.toThrow();
		expect(() =>
			validateAnswer(
				{
					...answer,
					blocks: [
						{ ...answer.blocks[0], ruleIds: ['numbers.spell-out'], sourceIds: ['G-NUMBERS'] }
					]
				},
				context.ruleIds,
				context.sourceIds
			)
		).toThrow();
	});
	it('selects the exact profile/version/hash triple and leaves legacy clients on Genius', () => {
		const catalog = createCorpusCatalog([genius, musixmatch], genius.contentHash);
		expect(catalog.resolve(genius.ruleSetVersion)?.corpus).toBe(genius);
		expect(
			catalog.resolve(musixmatch.ruleSetVersion, musixmatch.contentHash, 'musixmatch')?.corpus
		).toBe(musixmatch);
		expect(catalog.resolve(musixmatch.ruleSetVersion, musixmatch.contentHash)).toBeUndefined();
		expect(
			catalog.resolve(genius.ruleSetVersion, genius.contentHash, 'musixmatch')
		).toBeUndefined();
		expect(catalog.resolve(musixmatch.ruleSetVersion, undefined, 'musixmatch')).toBeUndefined();
		expect(() => createCorpusCatalog([musixmatch], musixmatch.contentHash)).toThrow();
	});

	it('binds prompts, cache identity and offered tools to the selected platform', () => {
		const prompt = developerPrompt(musixmatch);
		expect(prompt).toContain('Ground every Musixmatch-specific claim');
		expect(prompt).toContain('Missing Arabic/Korean evidence');
		expect(prompt).not.toContain('Ground every Genius-specific claim');
		expect(promptCacheKey(musixmatch)).not.toBe(promptCacheKey(genius));
		const request = providerRequest(
			[{ role: 'user', content: 'Review this' }],
			'browser',
			true,
			musixmatch
		);
		expect(request.tools?.some((tool) => 'name' in tool && tool.name === 'manage_links')).toBe(
			false
		);
	});

	it('refuses a foreign profile corpus before contacting a provider or checking a challenge', async () => {
		vi.clearAllMocks();
		const provider = providerReturning({
			scope: 'general',
			blocks: [{ kind: 'general', text: 'Example', ruleIds: [], sourceIds: [] }]
		});
		const handler = createHandler({
			corpusCatalog: createCorpusCatalog([genius, musixmatch], genius.contentHash),
			provider,
			verifyTurnstile: goodTurnstile
		});
		const response = await handler(
			makeRequest(
				requestBody({
					profile: 'musixmatch',
					clientRuleSetVersion: genius.ruleSetVersion,
					clientCorpusHash: genius.contentHash,
					turnstileToken: 'good-token'
				})
			),
			makeEnv()
		);
		expect(response.status).toBe(409);
		expect(provider).not.toHaveBeenCalled();
		expect(goodTurnstile).not.toHaveBeenCalled();
	});
});
