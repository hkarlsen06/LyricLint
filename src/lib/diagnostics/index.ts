/**
 * How a diagnostic is presented, wherever it is presented. The linter panel and
 * the editor's popover are two views of the same finding, so its severity tag,
 * its action row, and its provenance are one implementation used twice rather
 * than two that drift.
 */
export { default as DiagnosticActions } from './DiagnosticActions.svelte';
export { default as DiagnosticSources } from './DiagnosticSources.svelte';
export { default as SeverityTag } from './SeverityTag.svelte';
export { default as SourceLink } from './SourceLink.svelte';
export { safeExternalUrl } from './source-url.js';
export { diagnosticKey, orderDiagnostics } from './order.js';
