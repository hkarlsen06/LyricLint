import { parseDocument } from '#lib/core/parser.js';
import type { DraftRecord, EditorSnapshot } from '#lib/core/types.js';
import { importDocument, parseProjection, renderProfile } from '#lib/conversion/index.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';

/** Opening a plain main format never substitutes another format after an engine refusal. */
export function draftSnapshot(
	draft: DraftRecord,
	revision = 0
): { snapshot: EditorSnapshot; notice?: string } {
	let conversion = draft.conversion;
	let notice: string | undefined;
	const profile = draft.writing?.profile ?? conversion?.profile ?? 'genius';
	if (!conversion && profile === 'musixmatch') {
		const model = importDocument({
			text: draft.text,
			profile,
			language: draft.language,
			performers: draft.performers,
			lineAnchors: draft.lineAnchors,
			sectionLinks: draft.sectionLinks?.length ? draft.sectionLinks : undefined
		});
		if (model.ok)
			conversion = createConversionEnvelope(model.value, profile, profilePolicyVersions);
		else
			notice = `${model.refusal.message} Your Musixmatch lyrics remain editable. Retained details and format export are unavailable until this is resolved.`;
	}
	const projection =
		conversion && !draft.conversionRecovery
			? renderProfile(conversion.model, conversion.profile)
			: undefined;
	const snapshot: EditorSnapshot = {
		revision,
		text: draft.text,
		selection: draft.editorSelection ?? { anchor: 0, head: 0 },
		parsed:
			projection?.ok && conversion
				? parseProjection(conversion.model, projection.value, draft.language)
				: parseDocument(draft.text, { profile, language: draft.language }),
		diagnostics: [],
		composing: false,
		canUndo: false,
		canRedo: false
	};
	if (conversion) snapshot.conversion = conversion;
	if (draft.conversionRecovery) snapshot.conversionRecovery = draft.conversionRecovery;
	if (draft.originalRecovery) snapshot.originalRecovery = draft.originalRecovery;
	return notice ? { snapshot, notice } : { snapshot };
}
