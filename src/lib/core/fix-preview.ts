import type { Diagnostic, DiagnosticFix } from './types.js';

/**
 * The fix a selected diagnostic shows in the editor. Every fix that carries an
 * edit is previewable (safe and preview fixes alike), so the diff in the
 * document is what explains the change and `Apply` is the only decision left.
 */
export function previewableFix(diagnostic: Diagnostic): DiagnosticFix | undefined {
	return diagnostic.fixes?.find((fix) => fix.edit.edits.length > 0);
}

/**
 * A value-equal identity for a fix's edit. Effects key on this instead of the
 * fix object so a re-lint that produces an identical fix does not re-dispatch
 * the preview, while a genuinely different edit does.
 */
export function previewSignature(fix: DiagnosticFix | undefined): string {
	if (!fix) {
		return '';
	}
	const edits = fix.edit.edits.map((edit) => `${edit.from}-${edit.to}-${edit.insert}`).join('\0');
	return `${fix.edit.baseRevision}\0${edits}`;
}
