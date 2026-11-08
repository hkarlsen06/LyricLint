import { importDocument, planProfileSwitch, renderProfile, resolveDecision } from './index.js';
import type { ConversionAction } from './decisions.js';
import type { ProfileId } from '../profiles/types.js';
import { createConversionEnvelope } from '../persistence/conversion.js';
import { profilePolicyVersions } from '../profiles/versions.js';

/** Builds a saved active projection through the public conversion APIs. */
export function conversionFixture(
	text: string,
	profile: ProfileId = 'musixmatch',
	actions: { profile: ProfileId; action: ConversionAction }[] = []
) {
	const imported = importDocument({ text, profile: 'genius', language: 'en' });
	if (!imported.ok) throw new Error(imported.refusal.message);
	let model = imported.value;
	for (const step of actions) {
		const projection = renderProfile(model, step.profile);
		if (!projection.ok) throw new Error(projection.refusal.message);
		const result = resolveDecision(model, projection.value, step.action);
		if (!result.ok) throw new Error(result.refusal.message);
		model = result.value.document;
	}
	const plan = planProfileSwitch(model, { from: 'genius', to: profile });
	if (!plan.ok) throw new Error(plan.refusal.message);
	return createConversionEnvelope(plan.value.document, profile, profilePolicyVersions);
}
