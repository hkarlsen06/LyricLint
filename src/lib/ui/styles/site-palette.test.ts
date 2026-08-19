import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The marketing site pins the dark scheme by reassigning the palette on `.site`,
 * and there is one way to get that wrong that looks exactly like working CSS.
 *
 * A custom property is inherited as its *substituted* value. `--color-control:
 * var(--color-surface)` is declared on `:root`, so it resolves against `:root`'s
 * own `--color-surface` — the light one — and what reaches `.site` is already a
 * colour. Overriding `--color-surface` further down the tree does not reach back
 * and change it. The app's own dark scheme never meets this because it
 * redeclares the anchors on `:root` too, where every derivation re-substitutes
 * for free.
 *
 * Left out, the failure is silent and partial: the page renders, most of it is
 * right, and a handful of surfaces keep light-mode values. It shipped once as a
 * near-white default-tier button under near-white text, which made `Browse the
 * rules` beside the hero's contrast action unreadable.
 *
 * So this walks the derivations rather than trusting the list in site.css to
 * stay complete. Two obligations, and the second is the one a hand-written list
 * loses first:
 *
 *   1. every token the dark scheme redeclares is redeclared on `.site`, and
 *   2. every token derived from one of those — at any depth — is too.
 */

/*
 * Comments come out first, and that is not tidiness.
 *
 * These stylesheets explain themselves at length, and the explanations quote
 * the declarations they are about — the note on `.site` contains the literal
 * text `--color-control: var(--color-surface)` with no semicolon after it. A
 * declaration matcher run over the raw file therefore starts there and swallows
 * everything up to the next `;`, taking the real declarations in between with
 * it. That is how the first run of this test reported `--color-overlay` missing
 * from a block that declares it on the line it was pointing at.
 */
function readSource(relativePath: string): string {
	return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8').replace(
		/\/\*[\s\S]*?\*\//gu,
		''
	);
}

/** The declarations inside a `{ … }` block, as property → value.
 *
 * Internal whitespace is collapsed because it is insignificant in CSS and not
 * ours to control: a value long enough for prettier to wrap is indented to its
 * own block's depth, and the two blocks compared here sit at different depths,
 * so a byte comparison would report a disagreement about a tab. */
function declarationsIn(block: string): Map<string, string> {
	const declarations = new Map<string, string>();
	for (const [, property, value] of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gu)) {
		declarations.set(property, value.replace(/\s+/gu, ' ').trim());
	}
	return declarations;
}

/**
 * The body of the first rule whose selector matches, brace-counted rather than
 * matched with a regex — `color-mix()` and nested `@media` both put braces and
 * parentheses inside these blocks, and a lazy `[^}]+` stops at the first one.
 */
function ruleBody(css: string, selector: string): string {
	const start = css.indexOf(selector);
	expect(start, `${selector} is missing from the stylesheet`).toBeGreaterThanOrEqual(0);

	const open = css.indexOf('{', start);
	let depth = 0;
	for (let index = open; index < css.length; index += 1) {
		if (css[index] === '{') depth += 1;
		else if (css[index] === '}') {
			depth -= 1;
			if (depth === 0) return css.slice(open + 1, index);
		}
	}

	throw new Error(`${selector} is not closed`);
}

const tokens = readSource('./tokens.css');
const site = readSource('./site.css');

// `:root` is the first rule in tokens.css; the dark block is the one nested in
// the media query below it.
const rootDeclarations = declarationsIn(ruleBody(tokens, ':root {'));
const darkDeclarations = declarationsIn(ruleBody(tokens, '@media (prefers-color-scheme: dark) {'));
const siteDeclarations = declarationsIn(ruleBody(site, '.site {'));

/** Every custom property referenced by a value, `color-mix()` arguments included. */
function referencesIn(value: string): string[] {
	return [...value.matchAll(/var\(\s*(--[a-z0-9-]+)/gu)].map(([, property]) => property);
}

describe('the marketing site pins a complete dark palette', () => {
	it('reads both palettes out of tokens.css', () => {
		// Guards the parser: a selector that stopped matching would leave these
		// empty and every assertion below would pass over nothing.
		expect(rootDeclarations.size).toBeGreaterThan(60);
		expect(darkDeclarations.size).toBeGreaterThan(30);
		expect(siteDeclarations.size).toBeGreaterThan(30);
	});

	it('restates every token the dark scheme moves', () => {
		const missing = [...darkDeclarations.keys()].filter(
			(property) => !siteDeclarations.has(property)
		);

		expect(missing, 'declare these on `.site` in site.css').toEqual([]);
	});

	it('restates every token derived from one the dark scheme moves', () => {
		// A derivation is scheme-varying if it reaches a scheme-varying base
		// through any chain of `var()` references, so this closes over the graph
		// rather than checking one hop.
		const varying = new Set(darkDeclarations.keys());
		for (let changed = true; changed;) {
			changed = false;
			for (const [property, value] of rootDeclarations) {
				if (varying.has(property)) continue;
				if (referencesIn(value).some((reference) => varying.has(reference))) {
					varying.add(property);
					changed = true;
				}
			}
		}

		const missing = [...varying].filter(
			(property) => rootDeclarations.has(property) && !siteDeclarations.has(property)
		);

		expect(missing, 'declare these on `.site` in site.css').toEqual([]);
	});

	/*
	 * And every token both blocks state, they state identically.
	 *
	 * The site used to run a deeper set of surfaces of its own, and read side by
	 * side that was two products: pressing `Open the workbench` lifted every
	 * surface in the window four points, the masthead this stylesheet draws at
	 * exactly the document toolbar's height arrived a different colour than the
	 * toolbar, and the two were near enough that nobody caught it in a
	 * screenshot. There is one dark scheme now. This is what stops a retune of
	 * either block from quietly restoring the other one.
	 *
	 * Only the intersection, because the two blocks are not the same list and
	 * should not be: `.site` also restates the derivations `:root` declares
	 * (`--color-control: var(--color-surface)` and its kind), which the dark
	 * block never has to touch because a derivation declared on `:root`
	 * re-substitutes there for free. Those are covered by the two assertions
	 * above.
	 */
	it('states the same value as the dark scheme for every token both declare', () => {
		const disagreements = [...darkDeclarations]
			.filter(([property]) => siteDeclarations.has(property))
			.filter(([property, value]) => siteDeclarations.get(property) !== value)
			.map(
				([property, value]) => `${property}: ${value} (site: ${siteDeclarations.get(property)})`
			);

		expect(disagreements, 'the site pins the dark scheme, so these have to match').toEqual([]);
	});

	/*
	 * There is deliberately no assertion that a restated derivation still reads
	 * `var(--the-same-base)`. `--color-chrome` is the case that killed it: it is
	 * `var(--color-fill-subtle)` at `:root` and its own value in dark, so the
	 * text of the two declarations differs even where the rendered colour does
	 * not. What a token owes is to be declared at all — declared, it is a
	 * decision either way; missing, it is silently the light theme's.
	 */
});

/*
 * The boundary of a control has to be findable, and for a long time it was not:
 * `--color-border-input` rode `--color-border-strong`, which measures 1.55:1
 * against the control fill in the dark scheme and 2.83:1 in light — under the
 * 3:1 WCAG 1.4.11 asks of a UI component's only visible edge, on the search
 * fields that are these sections' primary control. The chips already learned
 * this (`controls.css` documents rejecting border-strong at 2.35:1) and the
 * token is now tuned per scheme; this is what keeps a retune of either scheme
 * from quietly sinking the boundary again.
 *
 * The math is the audit's: OKLCH → linear sRGB → WCAG relative luminance,
 * cross-checked against the stylesheet's own published figure for the accent
 * on the selection fill (3.92:1 at `site.css`'s `.site-hit` note — this
 * implementation reproduces it at 3.91).
 */
describe('control boundaries hold 3:1 in both schemes', () => {
	function oklchToLinearSrgb(l: number, c: number, hDeg: number): [number, number, number] {
		const h = (hDeg * Math.PI) / 180;
		const a = c * Math.cos(h);
		const b = c * Math.sin(h);
		const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
		const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
		const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
		return [
			4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
			-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
			-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
		].map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
	}

	function luminance([r, g, b]: [number, number, number]): number {
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}

	/** A declared value resolved through `var()` chains to its `oklch()` literal. */
	function resolve(declarations: Map<string, string>, property: string): string {
		let value = declarations.get(property);
		for (let hops = 0; value !== undefined && hops < 8; hops += 1) {
			const reference = /^var\(\s*(--[a-z0-9-]+)\s*\)$/u.exec(value);
			if (!reference) break;
			value = declarations.get(reference[1]!);
		}
		expect(value, `${property} does not resolve to a literal`).toBeDefined();
		return value!;
	}

	function contrast(declarations: Map<string, string>, first: string, second: string): number {
		const parse = (property: string): [number, number, number] => {
			const match = /oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/u.exec(
				resolve(declarations, property)
			);
			expect(match, `${property} is not a plain oklch() literal`).not.toBeNull();
			return oklchToLinearSrgb(Number(match![1]) / 100, Number(match![2]), Number(match![3]));
		};
		const [lighter, darker] = [luminance(parse(first)), luminance(parse(second))].sort(
			(a, b) => b - a
		);
		return (lighter + 0.05) / (darker + 0.05);
	}

	// The dark palette is the light one with the dark block's declarations laid
	// over it, exactly as the cascade applies them.
	const light = rootDeclarations;
	const dark = new Map([...rootDeclarations, ...darkDeclarations]);

	it.each([
		['light', light],
		['dark', dark]
	] as const)(
		'the input border clears 3:1 on its fill and its canvas in %s',
		(_scheme, palette) => {
			expect(contrast(palette, '--color-border-input', '--color-control')).toBeGreaterThanOrEqual(
				3
			);
			expect(contrast(palette, '--color-border-input', '--color-canvas')).toBeGreaterThanOrEqual(3);
		}
	);
});
