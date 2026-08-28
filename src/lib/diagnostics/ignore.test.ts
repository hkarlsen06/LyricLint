import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '$lib/core/types.js';
import {
	acceptsDiagnosticAsCorrect,
	diagnosticIgnoreKey,
	ignoredDiagnosticAccepted,
	ignoredDiagnosticText,
	matchIgnoredDiagnostics,
	unknownVoiceAcceptanceKey
} from './ignore.js';
import { unknownVoiceMessage } from '$lib/rules/catalog/performer-inline-mismatch.js';
import { diagnosticKey } from './order.js';

function diagnostic(from: number, overrides: Partial<Diagnostic> = {}): Diagnostic {
	return {
		ruleId: 'ad-libs.parentheses',
		severity: 'suggestion',
		message: 'Use parentheses for this ad-lib.',
		explanation: '',
		sourceIds: [],
		from,
		to: from + 3,
		...overrides
	};
}

describe('diagnostic ignores', () => {
	it('matches only the chosen occurrence and follows it when earlier text shifts', () => {
		const text = 'hey middle hey end';
		const first = diagnostic(0);
		const second = diagnostic(11);
		const ignored = diagnosticIgnoreKey(second, text);

		expect([...matchIgnoredDiagnostics([first, second], text, [ignored]).values()]).toEqual([
			diagnosticKey(second)
		]);

		const shiftedText = `prefix ${text}`;
		const shiftedFirst = diagnostic(7);
		const shiftedSecond = diagnostic(18);
		expect([
			...matchIgnoredDiagnostics([shiftedFirst, shiftedSecond], shiftedText, [ignored]).values()
		]).toEqual([diagnosticKey(shiftedSecond)]);
	});
});

describe('an accepted occurrence', () => {
	const text = 'hey middle hey end';

	it('is recognized by the one predicate the button and the toast read', () => {
		expect(acceptsDiagnosticAsCorrect(diagnostic(0))).toBe(false);
		expect(acceptsDiagnosticAsCorrect(diagnostic(0, { presumedCorrect: true }))).toBe(true);
		expect(
			acceptsDiagnosticAsCorrect(diagnostic(0, { ruleId: 'section.header-unrecognized' }))
		).toBe(true);
		expect(acceptsDiagnosticAsCorrect(diagnostic(0, { ruleId: 'unknown.unresolved' }))).toBe(true);
		expect(acceptsDiagnosticAsCorrect(diagnostic(0, { ruleId: 'performer.inline-mismatch' }))).toBe(
			true
		);
	});

	it('carries the marker without moving what the key matches', () => {
		const plain = diagnostic(11);
		const accepted = diagnostic(11, { presumedCorrect: true });

		expect(ignoredDiagnosticAccepted(diagnosticIgnoreKey(plain, text))).toBe(false);
		expect(ignoredDiagnosticAccepted(diagnosticIgnoreKey(accepted, text))).toBe(true);

		// The marker is presentation, so it may not decide which occurrence the key
		// finds: both answers about the same finding resolve to the same one.
		const first = diagnostic(0);
		for (const key of [diagnosticIgnoreKey(plain, text), diagnosticIgnoreKey(accepted, text)]) {
			expect([...matchIgnoredDiagnostics([first, plain], text, [key]).values()]).toEqual([
				diagnosticKey(plain)
			]);
		}
	});

	// Every key written before the two answers were told apart is six parts long,
	// and reads as the ordinary ignore it was.
	it('reads a stored six-part key as an ignore and still matches it', () => {
		const target = diagnostic(11);
		const stored = JSON.stringify(JSON.parse(diagnosticIgnoreKey(target, text)).slice(0, 6));

		expect(JSON.parse(stored)).toHaveLength(6);
		expect(ignoredDiagnosticAccepted(stored)).toBe(false);
		expect([...matchIgnoredDiagnostics([diagnostic(0), target], text, [stored]).values()]).toEqual([
			diagnosticKey(target)
		]);
	});

	it('refuses a seventh part it cannot vouch for', () => {
		const parts = JSON.parse(diagnosticIgnoreKey(diagnostic(11), text));
		const forged = JSON.stringify([...parts, 'whatever']);

		expect(ignoredDiagnosticAccepted(forged)).toBe(false);
		expect(matchIgnoredDiagnostics([diagnostic(11)], text, [forged]).size).toBe(0);
	});
});

/**
 * `performer.inline-mismatch` is about the voice, not the words it sings, and
 * an acceptance keyed on those words died on the first edit inside the tags —
 * the card asked `The performer is unknown` again after every rewrite.
 */
describe('a finding with its own identity text', () => {
	function voiceFinding(from: number, to: number): Diagnostic {
		return diagnostic(from, {
			to,
			ruleId: 'performer.inline-mismatch',
			message: unknownVoiceMessage,
			identityText: 'Unknown italic voice'
		});
	}

	it('keys on the identity and follows the finding while its lyrics change', () => {
		const text = 'lead line\n<i>hello there</i>';
		const key = diagnosticIgnoreKey(voiceFinding(10, 28), text);

		// The identity is also what the ignored list prints: what was accepted is
		// the voice, and the lyrics the key would otherwise show are long gone.
		expect(ignoredDiagnosticText(key)).toBe('Unknown italic voice');

		const editedText = 'lead line\n<i>completely new words</i>';
		const edited = voiceFinding(10, 37);
		expect([...matchIgnoredDiagnostics([edited], editedText, [key]).values()]).toEqual([
			diagnosticKey(edited)
		]);
	});

	it('mints at wrap time the acceptance the finding then arrives wearing', () => {
		const preText = 'lead line\nhello there';
		const key = unknownVoiceAcceptanceKey(preText, { from: 10, to: 21 }, 2);
		expect(ignoredDiagnosticAccepted(key)).toBe(true);

		const postText = 'lead line\n<i>hello there</i>';
		const finding = voiceFinding(10, 28);
		expect([...matchIgnoredDiagnostics([finding], postText, [key]).values()]).toEqual([
			diagnosticKey(finding)
		]);
	});
});
