/**
 * How a diagnostic is presented, wherever it is presented. The linter panel and
 * the editor's popover are two views of the same finding, so its meta line —
 * severity, location, citation — and its action row are one implementation used
 * twice rather than two that drift.
 */
export { default as DiagnosticActions } from './DiagnosticActions.svelte';
export { default as DiagnosticMeta } from './DiagnosticMeta.svelte';
export { default as SeverityTag } from './SeverityTag.svelte';
export { default as SourceCitation } from './SourceCitation.svelte';
export { default as SourceLink } from './SourceLink.svelte';
export { safeExternalUrl } from './source-url.js';
export { diagnosticKey, orderDiagnostics } from './order.js';
