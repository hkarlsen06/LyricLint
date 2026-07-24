export {
	escapeLegendText,
	mergeEquivalentSpans,
	serializeLegend,
	wrapVoiceSpan
} from './genius-markup.js';
export type { LegendMember, SerializableLegendGroup } from './genius-markup.js';
export { prepareCanonicalCopy, validateExport } from './export-validation.js';
export type {
	ExportValidationCode,
	ExportValidationIssue,
	ExportValidationResult
} from './export-validation.js';
