import { parseDocument } from '#lib/core/parser.js';
import type { Diagnostic, EditorSnapshot } from '#lib/core/types.js';
import { hasRepeatHeaderInstruction } from '#lib/rules/catalog/repeat-placeholder.js';
import { renderProfile } from './projection.js';

export type ConversionReviewKind = 'quantity' | 'instrumental' | 'censor' | 'repeat';

/** The shared card and popover offer only decisions with an implemented Review task. */
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

export type RetainedFinding = { id: string; message: string } & (
	| { kind: 'section-type' | 'repeat-header'; sectionId: string }
	| { kind: 'metadata'; sectionId?: string }
);

/** Metadata has its own location; a hidden boundary is never invented lyric text. */
export function retainedFindings(
	snapshot: EditorSnapshot,
	profile = snapshot.conversion?.profile
): RetainedFinding[] {
	const conversion = snapshot.conversion;
	if (!conversion || snapshot.conversionRecovery || snapshot.originalRecovery) return [];
	const projection = renderProfile(conversion.model, profile ?? conversion.profile);
	if (!projection.ok)
		return [{ kind: 'metadata', id: 'projection', message: projection.refusal.message }];
	const findings: RetainedFinding[] = projection.value.findings.map((finding) => ({
		kind: 'metadata',
		id: `${finding.code}:${finding.recordId}`,
		sectionId:
			conversion.model.voices.find((voice) => voice.id === finding.recordId)?.sectionId ??
			conversion.model.sections.find((section) => section.id === finding.recordId)?.id,
		message: finding.message
	}));
	if (profile === 'musixmatch') {
		for (const [index, section] of conversion.model.sections.entries()) {
			if (
				hasRepeatHeaderInstruction(
					parseDocument(section.header).sections[0]?.header?.rawNamePart ?? ''
				)
			) {
				findings.push({
					kind: 'repeat-header',
					id: `repeat-header:${section.id}`,
					sectionId: section.id,
					message: `Resolve the retained repeat instruction ${section.header}. Open this header in Genius to transcribe the intended repeated lyrics and edit the instruction. No source version or copy count is assumed.`
				});
			} else if (!section.type) {
				const label = section.header.trim() || section.name || `section ${index + 1}`;
				const firstLine = conversion.model.content
					.slice(section.at, conversion.model.sections[index + 1]?.at)
					.trim()
					.split('\n')[0]!;
				const characters = [...firstLine];
				const excerpt = characters.slice(0, 80).join('') + (characters.length > 80 ? '…' : '');
				findings.push({
					kind: 'section-type',
					id: `section-type:${section.id}`,
					sectionId: section.id,
					message: `Choose a Musixmatch tag for ${label}${excerpt ? `, with retained opening “${excerpt}”` : ' (empty section)'}.`
				});
			}
		}
		if (!conversion.model.sections.length && conversion.model.content.trim())
			findings.push({
				kind: 'metadata',
				id: 'section-boundaries',
				message:
					'Confirm the musical section boundaries and tags. Blank lines alone do not establish section types.'
			});
	}
	return findings;
}
