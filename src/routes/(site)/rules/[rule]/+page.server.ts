import { ruleReferences } from '$lib/rules/reference.js';
import type { EntryGenerator } from './$types.js';

export const entries: EntryGenerator = () =>
	ruleReferences().map((reference) => ({ rule: reference.slug }));
