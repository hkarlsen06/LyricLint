import { groupedRuleReferences } from '$lib/rules/reference.js';
import type { LayoutServerLoad } from './$types.js';

/**
 * The reference is build output, and this is where it stops being anything
 * else.
 *
 * It used to be derived in `+layout.svelte`, which meant it was derived twice:
 * once by the prerenderer, and again by the browser the moment it hydrated the
 * page it had just been sent. The second one threw. `reference.ts` loads the
 * statistical language detector for itself only where there is no `window` —
 * the static builder needs it synchronously, a browser fetches it on demand —
 * so in the browser `language.selection-mismatch` produced no diagnostic for
 * its example and the derivation refused to build, by design. The prerendered
 * list was on screen and correct; hydration then replaced all fifty-two rows
 * with nothing. That was live on the deployed build, and it is why nothing on
 * this page could be interactive.
 *
 * A **server** load rather than a universal one, and that is the whole fix:
 * a `+layout.ts` runs in the browser on a client-side navigation, so it would
 * only have moved the same derivation one file over. This one runs at prerender
 * time and never again, which also takes the parser, all fifty-two rules, the
 * spelling tables and the ~330KB language-detection corpus out of a
 * documentation page's bundle — none of which a reader of static prose was ever
 * going to need.
 */
export const load: LayoutServerLoad = () => ({ groups: groupedRuleReferences() });
