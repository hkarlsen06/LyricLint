import type { Severity } from '$lib/core/types.js';

/** The shared plural vocabulary used by severity filters. */
export const severityPluralLabels: Record<Severity, string> = {
	error: 'Errors',
	warning: 'Warnings',
	suggestion: 'Suggestions',
	'manual-review': 'Manual review'
};
