#!/usr/bin/env bun
/**
 * List every named rule the bundled Harper build ships, with its default state.
 *
 * Harper is not one lint but ~823 individually named rules, each toggleable by
 * name through its lint config — which is the lever the provider in
 * `src/lib/rules/harper.ts` has for tuning a general-purpose prose checker to
 * lyrics, the same way it already teaches Harper the reviewed spellings through
 * `importWords`. Curating which rules to disable starts from this inventory.
 *
 * This is not a one-time survey: Harper adds, renames, and re-defaults rules
 * between releases, so a curated disable-list rots silently under a
 * `harper.js` bump. Rerun it against the new version and diff the output —
 * a disabled rule that no longer exists is a rule that quietly came back on.
 *
 *   bun run harper:rules
 */
import { LocalLinter } from 'harper.js';
import { binary } from 'harper.js/binary';

const linter = new LocalLinter({ binary });
const config = await linter.getDefaultLintConfig();
const descriptions = await linter.getLintDescriptions();
const names = Object.keys(descriptions).sort();
const enabled = names.filter((name) => config[name] === true).length;
console.log(`TOTAL RULES: ${names.length} (${enabled} on by default)`);
for (const name of names) {
	const state = config[name];
	const mark = state === true ? 'ON ' : state === false ? 'off' : 'nul';
	console.log(`${mark} ${name}: ${descriptions[name]}`);
}
