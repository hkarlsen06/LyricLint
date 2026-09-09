import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertAssistantReleaseReady } from './check-assistant-release.mjs';

const ready = {
	revision: 'current-main',
	mainRevision: 'current-main',
	dirty: false,
	jobs: ['checks', 'assistant', 'e2e'].map((name) => ({ name, conclusion: 'success' }))
};

test('allows a checked main revision even while Pages deployment is blocked', () => {
	assert.doesNotThrow(() =>
		assertAssistantReleaseReady({
			...ready,
			jobs: [...ready.jobs, { name: 'deploy', conclusion: 'failure' }]
		})
	);
});

for (const conclusion of ['failure', 'cancelled', 'skipped', '']) {
	for (const name of ['checks', 'assistant', 'e2e']) {
		test(`blocks the Worker when ${name} is ${conclusion || 'unfinished'}`, () => {
			assert.throws(
				() =>
					assertAssistantReleaseReady({
						...ready,
						jobs: ready.jobs.map((job) => (job.name === name ? { name, conclusion } : job))
					}),
				/requires a successful/
			);
		});
	}
}

test('blocks an unchecked, modified, or superseded release', () => {
	assert.throws(() => assertAssistantReleaseReady({ ...ready, jobs: [] }), /requires a successful/);
	assert.throws(() => assertAssistantReleaseReady({ ...ready, dirty: true }), /tracked changes/);
	assert.throws(
		() => assertAssistantReleaseReady({ ...ready, mainRevision: 'newer-main' }),
		/current GitHub main/
	);
});
