import { afterEach, expect, it, vi } from 'vitest';
import { corpusMetadata } from '../../../services/rules-assistant/generated/rules-context-meta.js';
import { GET } from './+server.js';

afterEach(() => vi.unstubAllEnvs());

it('publishes the build revision and browser corpus identity without caching', async () => {
	const revision = 'a'.repeat(40);
	vi.stubEnv('RELEASE_REVISION', revision);
	const response = GET();
	expect(await response.json()).toEqual({
		revision,
		...corpusMetadata,
		clientCorpusHash: true,
		answersUrl: 'https://assistant.test/v1/answers'
	});
	expect(response.headers.get('cache-control')).toBe('no-store');
});

it.each([
	[' https://staging.example/v1/answers ', 'https://staging.example/v1/answers'],
	['  ', ''],
	[undefined, 'https://api.lyriclint.com/v1/answers']
])('records the actual browser endpoint configured as %j', async (configured, expected) => {
	vi.stubEnv('RELEASE_REVISION', 'a'.repeat(40));
	vi.stubEnv('PUBLIC_ASSISTANT_ANSWERS_URL', configured);
	expect(await GET().json()).toMatchObject({ answersUrl: expected });
});

it.each(['', 'main', '123abcd', 'a'.repeat(41)])(
	'refuses an invalid configured build revision %j',
	(revision) => {
		vi.stubEnv('RELEASE_REVISION', revision);
		expect(() => GET()).toThrow('RELEASE_REVISION must be a full Git commit SHA.');
	}
);
