import { enabledRules, sourceRegistry } from '$lib/rules/index.js';
import type { PageServerLoad } from './$types.js';

/*
 * These are build facts, not browser work.
 *
 * Importing the rules barrel from +page.svelte put the parser, the complete
 * rule registry, and Harper's client adapter in the landing bundle so it could
 * print one count and one URL. This route is statically prerendered, so derive
 * both once while building and serialize the two strings the page actually
 * needs. The lazy live demo still imports the real engine when it approaches
 * the viewport; the first screen no longer pays for it.
 */
export const load: PageServerLoad = () => ({
	ruleCount: enabledRules.length,
	harperUrl: sourceRegistry.get('T-HARPER')?.url ?? 'https://writewithharper.com/'
});
