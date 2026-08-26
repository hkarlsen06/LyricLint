export { findExactPerformer, normalizePerformerKey } from './identity.js';
export { allocatePerformerColor, performerColorIds } from './color.js';
export { extractPerformers } from './import.js';
export {
	assignUnknownVoice,
	assignVoiceGroup,
	assignVoiceLegend,
	insertSectionHeader,
	unknownVoiceOffers
} from './transform.js';
export { headerNameAtoms, isMirrorableHeaderName } from './header-rename.js';
