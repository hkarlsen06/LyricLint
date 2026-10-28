import { fireEvent, within, waitFor } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test } from 'vitest';
import { createTestWorkbench, diagnostic } from '../test-utils.js';
import { importDocument, renderProfile } from '#lib/conversion/index.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import LinterPanel from '../linter/LinterPanel.svelte';

afterEach(cleanup);
for (const [rule, title, sourceControl] of [
	['mxm.transcription.repeat-placeholder', 'Replace repeat placeholder', true],
	['mxm.numbers.context', 'Review quantity', false],
	['mxm.structure.instrumental', 'Review instrumental interval', false],
	['mxm.transcription.censor-mask', 'Review censored word', false]
] as const) {
	test(`opens only the ${title} task in Review and refuses a stale target`, async () => {
		const imported = importDocument({
			text: '[Chorus]\nFirst version\n\n[Outro]\nRepeat chorus',
			profile: 'genius',
			language: 'en'
		});
		if (!imported.ok) throw Error(imported.refusal.message);
		const projection = renderProfile(imported.value, 'musixmatch');
		if (!projection.ok) throw Error(projection.refusal.message);
		const { controller } = createTestWorkbench({ text: projection.value.text });
		controller.onSnapshot({
			...controller.snapshot,
			conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions)
		});
		const range = {
			from: projection.value.text.indexOf('Repeat chorus'),
			to: projection.value.text.length
		};
		controller.openConversionReview(
			diagnostic({ ruleId: rule, message: 'Review this passage.', severity: 'warning', ...range })
		);
		const view = await render(LinterPanel, { controller });
		const panel = within(view.container);
		await waitFor(() => expect(panel.getByRole('heading', { name: title })).toHaveFocus());
		expect(controller.activeTab).toBe('linter');
		expect(panel.queryByLabelText('Earlier source section') !== null).toBe(sourceControl);
		for (const name of [
			'Document settings',
			'Retained details',
			'Selected passage',
			'Wording and retained annotations',
			'Saved decisions',
			'Decisions that need listening',
			'Export .txt'
		])
			expect(panel.queryByText(name, { exact: true })).toBeNull();
		const heading = panel.getByRole('heading', { name: title }).getBoundingClientRect();
		expect(heading.top).toBeGreaterThanOrEqual(0);
		expect(heading.bottom).toBeLessThan(window.innerHeight);
		controller.onSnapshot({ ...controller.snapshot, selection: { anchor: 0, head: 5 } });
		expect(controller.requestedConversionReview?.range).toEqual(range);
		controller.onSnapshot({ ...controller.snapshot, revision: controller.snapshot.revision + 1 });
		await waitFor(() =>
			expect(panel.getByRole('status').textContent).toContain('The lyrics or format changed')
		);
		expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
		await fireEvent.click(panel.getByRole('button', { name: 'Back to Review' }));
		expect(controller.requestedConversionReview).toBeUndefined();
	});
}
