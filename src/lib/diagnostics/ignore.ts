import type { Diagnostic } from '$lib/core/types.js';
import { diagnosticKey } from './order.js';

const CONTEXT_LENGTH = 32;

type IgnoreIdentity = [
	ruleId: string,
	message: string,
	text: string,
	before: string,
	after: string,
	from: number
];

function identity(diagnostic: Diagnostic, text: string): IgnoreIdentity {
	return [
		diagnostic.ruleId,
		diagnostic.message,
		text.slice(diagnostic.from, diagnostic.to),
		text.slice(Math.max(0, diagnostic.from - CONTEXT_LENGTH), diagnostic.from),
		text.slice(diagnostic.to, diagnostic.to + CONTEXT_LENGTH),
		diagnostic.from
	];
}

function parse(key: string): IgnoreIdentity | undefined {
	try {
		const value: unknown = JSON.parse(key);
		if (
			Array.isArray(value) &&
			value.length === 6 &&
			value.slice(0, 5).every((part) => typeof part === 'string') &&
			typeof value[5] === 'number'
		) {
			return value as IgnoreIdentity;
		}
	} catch {
		// Old rule-level session keys are deliberately not occurrence ignores.
	}
}

export function diagnosticIgnoreKey(diagnostic: Diagnostic, text: string): string {
	return JSON.stringify(identity(diagnostic, text));
}

export function ignoredDiagnosticRuleId(key: string): string {
	return parse(key)?.[0] ?? key;
}

function sharedEdge(left: string, right: string, fromEnd = false): number {
	let count = 0;
	while (
		count < left.length &&
		count < right.length &&
		left[fromEnd ? left.length - count - 1 : count] ===
			right[fromEnd ? right.length - count - 1 : count]
	) {
		count += 1;
	}
	return count;
}

/** Match each saved occurrence once, retaining it when unrelated text shifts its offsets. */
export function matchIgnoredDiagnostics(
	diagnostics: readonly Diagnostic[],
	text: string,
	ignored: readonly string[]
): Map<string, string> {
	const remaining = [...diagnostics];
	const result = new Map<string, string>();

	for (const key of ignored) {
		const saved = parse(key);
		if (!saved) continue;
		let best = -1;
		let bestContext = -1;
		let distance = Number.POSITIVE_INFINITY;
		for (let index = 0; index < remaining.length; index += 1) {
			const current = identity(remaining[index]!, text);
			if (saved.slice(0, 3).some((part, partIndex) => part !== current[partIndex])) continue;
			const context = sharedEdge(saved[3], current[3], true) + sharedEdge(saved[4], current[4]);
			const candidateDistance = Math.abs(saved[5] - current[5]);
			if (context > bestContext || (context === bestContext && candidateDistance < distance)) {
				best = index;
				bestContext = context;
				distance = candidateDistance;
			}
		}
		if (best >= 0) result.set(key, diagnosticKey(remaining.splice(best, 1)[0]!));
	}

	return result;
}
