/**
 * Which rule IDs belong to Harper, in a module that costs nothing to import.
 *
 * These lived in `harper.ts` beside the integration that produces them, which
 * is where they read best — until the panel's sort needed to know whether a
 * finding came from Harper. `harper.ts` statically pulls the language registry
 * and the spelling table on its way to the WASM bridge, and
 * `diagnostics/order.ts` is imported by the editor as well as the shell, so
 * asking it that question there would drag the whole grammar integration into
 * every chunk that sorts a list.
 *
 * A second hand-written copy of the three strings was the other way out, and it
 * is the one this repository keeps a rule about: a set rebuilt in two places is
 * only as correct as the least careful place that rebuilds it. So the set moved
 * and `harper.ts` re-exports it, which leaves every existing importer alone.
 */
export const harperRuleIds = ['spelling.harper', 'style.harper', 'grammar.harper'] as const;

export type HarperRuleId = (typeof harperRuleIds)[number];

const harperRuleIdSet: ReadonlySet<string> = new Set(harperRuleIds);

/** Whether this finding came from the local proofreader rather than a rule. */
export function isHarperRuleId(ruleId: string): boolean {
	return harperRuleIdSet.has(ruleId);
}
