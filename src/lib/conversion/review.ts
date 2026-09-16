import type { Diagnostic, EditorSnapshot } from '$lib/core/types.js';
import { renderProfile } from './projection.js';

export type ConversionReviewKind = 'quantity' | 'instrumental' | 'censor' | 'repeat';

/** The shared card and popover offer only decisions with an implemented Song control. */
export function conversionReviewAction(
	diagnostic: Diagnostic
): { kind: ConversionReviewKind; label: string } | undefined {
	switch (diagnostic.ruleId) {
		case 'mxm.numbers.context':
			return { kind: 'quantity', label: 'Review quantity' };
		case 'mxm.structure.instrumental':
			return { kind: 'instrumental', label: 'Review instrumental interval' };
		case 'mxm.transcription.censor-mask':
			return { kind: 'censor', label: 'Review censored word' };
		case 'mxm.transcription.repeat-placeholder':
			return { kind: 'repeat', label: 'Review repeated passage' };
		default:
			return undefined;
	}
}

export interface RetainedFinding {
	id: string;
	sectionId?: string;
	message: string;
}

/** Metadata has its own location; a hidden boundary is never invented lyric text. */
export function retainedFindings(
	snapshot: EditorSnapshot,
	profile = snapshot.conversion?.profile
): RetainedFinding[] {
	const conversion = snapshot.conversion;
	if (!conversion || snapshot.conversionRecovery || snapshot.originalRecovery) return [];
	const projection = renderProfile(conversion.model, profile ?? conversion.profile);
	if (!projection.ok) return [{ id: 'projection', message: projection.refusal.message }];
	const findings: RetainedFinding[] = projection.value.findings.map((finding) => ({
		id: `${finding.code}:${finding.recordId}`,
		sectionId:
			conversion.model.voices.find((voice) => voice.id === finding.recordId)?.sectionId ??
			conversion.model.sections.find((section) => section.id === finding.recordId)?.id,
		message: finding.message
	}));
	if (profile === 'musixmatch') {
		for (const [index, section] of conversion.model.sections.entries()) {
			if (!section.type)
				findings.push({
					id: `section-type:${section.id}`,
					sectionId: section.id,
					message: `Choose the Musixmatch tag for section ${index + 1}. Its original Genius label is retained.`
				});
		}
		if (!conversion.model.sections.length && conversion.model.content.trim())
			findings.push({
				id: 'section-boundaries',
				message:
					'Confirm the musical section boundaries and tags. Blank lines alone do not establish section types.'
			});
	}
	return findings;
}
