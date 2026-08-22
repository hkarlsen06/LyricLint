import { defineConfig } from 'oxlint';

// Oxlint runs only the vendored anti-slop plugin (tools/oxlint/anti-slop, copied from
// https://github.com/dmmulroy/anti-slop and ours to maintain). ESLint stays the host for
// everything else — the Svelte rules have no oxlint counterpart — so `bun run lint` runs both.
export default defineConfig({
	ignorePatterns: [
		'**/node_modules/**',
		'.svelte-kit/**',
		'.claude/**',
		'build/**',
		'static/**',
		'test-results/**',
		'docs/**',
		'fixtures/**',
		'services/rules-assistant/generated/**',
		'tools/oxlint/anti-slop/**'
	],
	// No builtin rule sets: ESLint (with typescript-eslint and eslint-plugin-svelte) stays the
	// host for general linting, and oxlint's builtins cannot see a Svelte template, so they
	// report `bind:this` targets as never-assigned. Oxlint here is only the anti-slop host.
	plugins: [],
	categories: { correctness: 'off' },
	jsPlugins: [{ name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts' }],
	rules: {
		'anti-slop/no-chained-type-assertions': 'error',
		'anti-slop/no-conditional-empty-object-spread': 'error',
		'anti-slop/no-known-value-widening': 'error',
		'anti-slop/no-module-mocking': 'error',
		'anti-slop/no-object-parameters': 'error',
		'anti-slop/no-reflect-apply': 'error',
		'anti-slop/no-reflect-get': 'error',
		// This project has no schemas; its boundary parsing lives in type predicates and
		// assertion functions (clipboard-metadata, backup validation), which is what the
		// option admits. Ad hoc typeof narrowing elsewhere is still rejected.
		'anti-slop/no-runtime-typeof': ['error', { allowInTypeGuards: true }],
		// Off: "shape" is this codebase's documented domain term for the section-link merge
		// structure (core/link-shape.ts), not slop naming for a plain interface.
		'anti-slop/no-shape-in-symbol-names': 'off',
		// Same reasoning as no-runtime-typeof: the type-guard IS the boundary parser, so its
		// own input is legitimately `unknown`. (Option added in our vendored copy.)
		'anti-slop/no-unknown-parameters': ['error', { allowInTypeGuards: true }],
		'anti-slop/no-unknown-returns': 'error',
		'anti-slop/no-unknown-type-aliases': 'error',
		'anti-slop/no-unsafe-dictionary-type': 'error',
		'anti-slop/no-widen-then-assert': 'error',
		'anti-slop/require-safety-comment-for-type-assertion': 'error'
	},
	overrides: [
		{
			// A SAFETY comment on a test's stub cast documents nothing a reader needs; the
			// structural rules (module mocking, unknown parameters, …) all stay on in tests.
			files: ['**/*.test.ts', '**/*.spec.ts', 'vitest-setup-client.ts'],
			rules: {
				'anti-slop/require-safety-comment-for-type-assertion': 'off'
			}
		}
	]
});
