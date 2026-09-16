import { profileLanguage } from './languages.js';
import type { ProfileGuideline } from './types.js';

/** Complete claim inventory from docs/platform-guidelines-comparison.md.
 * A check can cover only a syntactic subset; limit records the unautomated remainder.
 * Workflow and review entries are deliberate coverage, never a claim of automatic verification. */
export const profileGuidelines: readonly ProfileGuideline[] = [
	{
		id: 'MX-SCOPE-01',
		topic: 'Introduction',
		statement:
			'Contribution rules apply across community, artist, representative, publisher and distributor accounts; tools/submission paths differ.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit: 'Workflow: distinguish guideline support from having a native submission integration.'
	},
	{
		id: 'MX-T01',
		topic: 'Transcribe A',
		statement:
			"Listen to the whole recording and produce the transcription yourself; do not copy another source's transcription.",
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit: 'Workflow: conversion cannot certify authorship, listening or provenance.'
	},
	{
		id: 'MX-T02',
		topic: 'Transcribe A',
		statement:
			'Include the complete vocal material, including producer tags, backing vocals and live performer/audience interjections.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'review',
		ruleIds: [],
		limit: 'Review: retain vocals; switching cannot choose the recording or prove completeness.'
	},
	{
		id: 'MX-T03',
		topic: 'Transcribe A',
		statement: 'Write every actual repetition; do not substitute a multiplier for repeated lyrics.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.transcription.repeat-placeholder'],
		limit:
			'Check: shared placeholder finding is possible. Expansion requires known scope, count and wording.'
	},
	{
		id: 'MX-T04',
		topic: 'Transcribe A',
		statement:
			'Preserve audible expletives; represent an actual censored cutoff with a hyphen rather than asterisks.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.transcription.censor-mask'],
		limit:
			'Review: mask→prefix is information loss in reverse; a hyphen alone does not establish censoring.'
	},
	{
		id: 'MX-T05',
		topic: 'Transcribe B',
		statement: 'Exclude section and artist labels from the transcription text.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.transcription.labels'],
		limit: 'Convert/retain recognized syntax as metadata; ambiguous brackets stay visible.'
	},
	{
		id: 'MX-T06',
		topic: 'Transcribe B',
		statement: 'Exclude production-sound effects and descriptions.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.transcription.sound-description'],
		limit:
			'Convert/retain only when the item is known to be a description, not sung text or a censor mask.'
	},
	{
		id: 'MX-T07',
		topic: 'Transcribe C',
		statement:
			'Include significant filler/vocalization, with moderation rather than exhaustive prolonged vowel strings.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'review',
		ruleIds: [],
		limit:
			'Review: stylistic significance and echo origin require listening. Never delete repeated vowels automatically.'
	},
	{
		id: 'MX-T08',
		topic: 'Transcribe D',
		statement:
			'Generally use original scripts; consult the linked romanization guidance for details.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit:
			'Retain original script; no automatic transliteration. See official supplemental sources below.'
	},
	{
		id: 'MX-T09',
		topic: 'Transcribe note',
		statement:
			'Potential hate speech, slurs/dehumanization, incitement, discriminatory conspiracy claims and extremist material require accuracy review with other contributors, including a Specialist; without agreement, leave the task; an internal ticket path is provided.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit:
			"Workflow: document MXM's contribution process, without generating censorship rewrites, asserting verification, or contacting anybody automatically."
	},
	{
		id: 'MX-F01',
		topic: 'Format A',
		statement:
			'Divide lyrics according to musical structure; a formatted section has at most ten lines.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.format.stanza-length'],
		limit:
			'Check/review: count actual lyric lines, not soft wraps; splitting requires an appropriate boundary.'
	},
	{
		id: 'MX-F02',
		topic: 'Format B',
		statement: 'Capitalize line beginnings and proper nouns.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.format.line-initial'],
		limit:
			'Check only cased scripts and reviewed contexts; proper-name inference is not automatic proof.'
	},
	{
		id: 'MX-F03',
		topic: 'Format B',
		statement: 'Capitalize the following start after a question/exclamation.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.format.sentence-case'],
		limit: 'Check/review sentence starts under the language policy.'
	},
	{
		id: 'MX-F04',
		topic: 'Format B',
		statement: 'Do not use arbitrary title capitals or uppercase to depict shouting.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.format.expressive-case'],
		limit: 'Check/review; preserve acronyms and established name casing.'
	},
	{
		id: 'MX-F05',
		topic: 'Format B',
		statement: 'Parenthetical backing vocals take capitals when grammar calls for them.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.format.parenthetical-case'],
		limit: 'Review contextual changes; do not globally lowercase parenthetical beginnings.'
	},
	{
		id: 'MX-F06',
		topic: 'Format C',
		statement: 'Ordinary numbers above ten use digits; ten and below use words.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.numbers.context'],
		limit: 'Convert only recognized quantities under a reviewed language-specific numeric policy.'
	},
	{
		id: 'MX-F07',
		topic: 'Format C',
		statement: 'Phone numbers, dates and decades use numerical forms.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.numbers.context'],
		limit: 'Preserve identifier strings/leading zeros; classify dates separately from counts.'
	},
	{
		id: 'MX-F08',
		topic: 'Format C',
		statement: "Exact times use digits, but an o'clock time spells its number.",
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.numbers.context'],
		limit: 'Convert only an established time expression; retain its source form.'
	},
	{
		id: 'MX-F09',
		topic: 'Format D',
		statement: 'No terminal comma or non-acronym period.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.punctuation.line-ending'],
		limit:
			'Check with MXM provenance and an acronym-aware predicate; resolve language-specific punctuation qualifications.'
	},
	{
		id: 'MX-F10',
		topic: 'Format D',
		statement: 'Question and exclamation marks are permitted with restraint.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.punctuation.repeated-marks'],
		limit: 'Check/review; French restrictions below prevent universal reuse.'
	},
	{
		id: 'MX-F11',
		topic: 'Format D',
		statement: 'End hyphens/ellipses indicate interruption or fade-out.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.punctuation.interruption'],
		limit: 'Review the semantic kind before transforming punctuation; no global dash replacement.'
	},
	{
		id: 'MX-F12',
		topic: 'Format E',
		statement: 'Use the supplied standardized slang forms, with meaning-sensitive distinctions.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.spelling.standardized'],
		limit: 'Share only evidenced overlaps; a Genius dictionary is not an MXM dictionary.'
	},
	{
		id: 'MX-F13',
		topic: 'Format F',
		statement:
			'Introduce direct speech with a comma, enclose it in quotation marks and capitalize its beginning.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.punctuation.direct-speech'],
		limit:
			'Review speech recognition. Curly glyphs in MXM examples do not by themselves mandate curly quotes. Spanish has a specific colon instruction.'
	},
	{
		id: 'MX-Y01',
		topic: 'Sync note',
		statement:
			'Correct transcription errors while syncing; saving endorses the contribution as a whole.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit: 'Workflow: successful formatting/timing checks cannot certify the whole contribution.'
	},
	{
		id: 'MX-Y02',
		topic: 'Sync A',
		statement:
			'Align each line with the onset of its first sung character, without an artificial breathing lead-in.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit:
			'Preserve authored timing; do not shift every timestamp or claim audio alignment from text.'
	},
	{
		id: 'MX-Y03',
		topic: 'Sync B',
		statement:
			'Review each line and refine its timing; the native tools provide per-line adjustments and restart.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit:
			'Workflow: our existing controls may support editing, but copied text does not transfer sync automatically.'
	},
	{
		id: 'MX-Y04',
		topic: 'Sync C',
		statement:
			"Listen to full lines and work carefully; the source illustrates that syncing should take at least the recording's duration.",
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit:
			'Human/audio review, not a deterministic elapsed-time validator or a delay imposed by the editor.'
	},
	{
		id: 'MX-S01',
		topic: 'Tag Structure A, Intro',
		statement: 'A distinct opening passage, at the beginning.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit: 'Convert a known type; do not infer it merely because a paragraph is first.'
	},
	{
		id: 'MX-S02',
		topic: 'Tag Structure A, Verse',
		statement: 'Narrative passage whose music commonly returns with changed words.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit: 'Preserve known structure; differing text alone does not prove a Verse.'
	},
	{
		id: 'MX-S03',
		topic: 'Tag Structure A, Pre-Chorus',
		statement: 'A connecting passage preparing a chorus, commonly after a verse.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit: 'Convert known type; do not invent it from position.'
	},
	{
		id: 'MX-S04',
		topic: 'Tag Structure A, Chorus',
		statement: 'A prominent memorable passage, often repeating unchanged.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit: 'Matching repeated text does not alone establish the type.'
	},
	{
		id: 'MX-S05',
		topic: 'Tag Structure A, Hook',
		statement:
			'A catchy, often more repetitive and less melodic/lyrical passage, distinguished from Chorus.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit: 'Preserve distinction; explicit target decision when correspondence is not established.'
	},
	{
		id: 'MX-S06',
		topic: 'Tag Structure A, Bridge',
		statement: 'A contrasting passage, commonly later in the song and between chorus repetitions.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit: "The source's approximate position is descriptive, not a percentage-based detector."
	},
	{
		id: 'MX-S07',
		topic: 'Tag Structure A, Outro',
		statement:
			'A concluding passage at the end, possibly distinguished by music despite repeated words.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit: 'Type is not derivable from repeated wording or final position alone.'
	},
	{
		id: 'MX-S08',
		topic: 'Tag Structure A/D',
		statement:
			'Do not force every available type into a song; genre/tradition can change interpretation.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit: 'Seven described tags do not justify lossy collapse of all other source concepts.'
	},
	{
		id: 'MX-S09',
		topic: 'Tag Structure B',
		statement: 'Listen to the full recording and assign a structure tag to each section.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit: 'Metadata workflow; no implication that tag labels are copied lyric text.'
	},
	{
		id: 'MX-S10',
		topic: 'Tag Structure C',
		statement:
			'For an interior stretch exceeding 15 consecutive seconds without lyrics, type and sync an `#INSTRUMENTAL` lyric line.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.structure.instrumental'],
		limit:
			'Require known interval boundaries and no qualifying lyrical content; vocalization/joik classification requires review. Two lyric-start anchors do not establish duration.'
	},
	{
		id: 'MX-S11',
		topic: 'Tag Structure C',
		statement:
			"Put that marker between separately tagged sections, never inside one or at the song's beginning/end.",
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.structure.instrumental'],
		limit: 'Check known placement; do not convert an entire instrumental song to this marker.'
	},
	{
		id: 'MX-S12',
		topic: 'Tag Structure C',
		statement: 'Put a blank line after the instrumental marker.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'check',
		ruleIds: ['mxm.structure.instrumental'],
		limit: 'Source conflict for Japanese; no automatic shared spacing rule.'
	},
	{
		id: 'MX-S13',
		topic: 'Tag Structure D',
		statement: 'Seek community help for uncertain structure instead of forcing a type.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit: 'Review with an explicit unknown/unresolved state; no automatic outreach.'
	},
	{
		id: 'MX-P01',
		topic: 'Tag Performers heading',
		statement: 'The described feature is desktop-only.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit:
			"This limits native handoff claims, not LyricLint's ability to retain local metadata on a phone."
	},
	{
		id: 'MX-P02',
		topic: 'Tag Performers A',
		statement:
			'Finish required structure tags and other contribution work before performer tagging.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit: 'Metadata workflow; explicit sections are a prerequisite for native section tagging.'
	},
	{
		id: 'MX-P03',
		topic: 'Tag Performers B',
		statement: 'Listen to each complete section before assigning its performers.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit: 'Review identity; roster presence is not proof of who sang.'
	},
	{
		id: 'MX-P04',
		topic: 'Tag Performers B',
		statement: 'A single performer can be assigned to an entire section.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit: 'Convert known section assignment into metadata.'
	},
	{
		id: 'MX-P05',
		topic: 'Tag Performers B',
		statement: 'For multiple performers, select their particular lyric ranges and tag each.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit: 'Retain full range/group identity; no evidence for a four-style MXM limit.'
	},
	{
		id: 'MX-P06',
		topic: 'Tag Performers C',
		statement: 'Tag individual people rather than bands, using their commonly known stage names.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'review',
		ruleIds: [],
		limit: 'Do not expand a band into guessed members, rename people, or infer identities.'
	},
	{
		id: 'MX-P07',
		topic: 'Tag Performers D',
		statement:
			'Fanchant category covers crowd/uncredited-ensemble vocals; the prose names K-pop, while its linked example is outside K-pop.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'review',
		ruleIds: [],
		limit:
			'Preserve category as explicit fact; genre scope needs clarification before a restrictive rule.'
	},
	{
		id: 'MX-P08',
		topic: 'Tag Performers D',
		statement:
			'Voice-over category covers primary lyrics from an uncredited, unrecognized human voice.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'review',
		ruleIds: [],
		limit: 'Review vocal role; unknown identity alone does not select this category.'
	},
	{
		id: 'MX-P09',
		topic: 'Tag Performers D',
		statement:
			'Backing-vocalist category covers backing vocals without a credited/recognized performer.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'review',
		ruleIds: [],
		limit: 'Review role separately from performer identity.'
	},
	{
		id: 'MX-P10',
		topic: 'Tag Performers D',
		statement: 'Robotic-vocal category covers voices edited beyond recognition as human.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'review',
		ruleIds: [],
		limit: 'No automatic AI↔robotic equivalence.'
	},
	{
		id: 'MX-P11',
		topic: 'Tag Performers E',
		statement: 'Ask the community about difficult cases.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit: 'Workflow only; no external messages from the engine.'
	},
	{
		id: 'MX-L01',
		topic: 'Translate heading',
		statement: 'The described translation feature is desktop-only.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit: 'Native workflow limitation; local preservation is a separate capability.'
	},
	{
		id: 'MX-L02',
		topic: 'Translate A',
		statement:
			'Translate the existing formatted lines individually; do not combine several source lines into one translation line.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit:
			'Preserve known alignment metadata; no automatic translation. Japanese has a meaning-distribution qualification.'
	},
	{
		id: 'MX-L03',
		topic: 'Translate A',
		statement: 'Prefer verified, locked source lyrics to reduce later translation loss.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'workflow',
		ruleIds: [],
		limit: 'Recommendation, not a text-validation error or a claim LyricLint can verify the lock.'
	},
	{
		id: 'MX-L04',
		topic: 'Translate B',
		statement: 'Transcription and formatting rules also apply to translations.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'metadata',
		ruleIds: [],
		limit: 'Track translation status explicitly; do not infer it from script/header vocabulary.'
	},
	{
		id: 'MX-L05',
		topic: 'Translate C',
		statement: "Preserve the source line's tone.",
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'review',
		ruleIds: [],
		limit: 'Human linguistic review.'
	},
	{
		id: 'MX-L06',
		topic: 'Translate D',
		statement: 'Retain words/names that cannot sensibly be translated.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'review',
		ruleIds: [],
		limit: 'No automatic proper-name translation or normalization.'
	},
	{
		id: 'MX-L07',
		topic: 'Translate E',
		statement:
			'Convey the intended message idiomatically instead of mechanically translating each word.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-MAIN'],
		handling: 'review',
		ruleIds: [],
		limit: 'Outside deterministic format conversion.'
	},
	{
		id: 'MX-EN01',
		topic: 'FAQ, unclear lyrics',
		statement:
			'Seek help/research instead of leaving blanks or question-mark replacement tokens for undeciphered words.',
		languages: ['en'],
		sourceIds: ['MXM-EN-Q'],
		handling: 'check',
		ruleIds: ['mxm.transcription.unknown'],
		limit:
			'Direct conflict with Genius `[?]` for English. Keep the uncertainty visible as unresolved work; neither delete the token nor invent a word.'
	},
	{
		id: 'MX-EN02',
		topic: 'FAQ, abbreviations',
		statement: 'Ask for confirmation of unlisted abbreviated forms.',
		languages: ['en'],
		sourceIds: ['MXM-EN-Q'],
		handling: 'review',
		ruleIds: [],
		limit:
			'A deterministic engine can report missing coverage, not invent an approved spelling or contact a contributor.'
	},
	{
		id: 'MX-EN03',
		topic: 'FAQ, backing vocals',
		statement:
			'Secondary vocals use parentheses and generally lowercase beginnings unless grammar or sentence-ending punctuation calls for capitals.',
		languages: ['en'],
		sourceIds: ['MXM-EN-Q'],
		handling: 'check',
		ruleIds: ['mxm.format.parenthetical-case'],
		limit:
			"Confirms a specific difference from Genius's ad-lib initial-capital convention. This is not permission to lowercase proper nouns or English `I`."
	},
	{
		id: 'MX-EN04',
		topic: 'FAQ, sync/remixes/live',
		statement:
			'Align the first sound without a lead-in; include live speech and remix vocals unless effects make them genuinely indecipherable; listen to the entire track before marking it instrumental.',
		languages: ['en'],
		sourceIds: ['MXM-EN-Q'],
		handling: 'workflow',
		ruleIds: [],
		limit:
			'Authoritative workflow qualification, not proof that current anchors are accurate or that a long opening means an instrumental track.'
	},
	{
		id: 'MX-EN05',
		topic: 'Insights, Brand Love',
		statement: 'Supplies brand spellings and context-dependent short names.',
		languages: ['en'],
		sourceIds: ['MXM-EN-I'],
		handling: 'review',
		ruleIds: [],
		limit:
			'Curated identity evidence; do not expand every nickname or treat brand recognition as certain.'
	},
	{
		id: 'MX-EN06',
		topic: 'Insights, regional/slang tables',
		statement:
			'Supplies British, Nigerian, Patois and contemporary slang with meanings and allowed variants.',
		languages: ['en'],
		sourceIds: ['MXM-EN-I'],
		handling: 'review',
		ruleIds: [],
		limit:
			"These are separate lexical inventories; translating dialect into standard English is not a correction. A token's meaning still matters."
	},
	{
		id: 'MX-NO01',
		topic: 'Dialektbruk',
		statement:
			'Preserve the dialect actually sung instead of standardizing an original transcription to Bokmål/Nynorsk.',
		languages: ['no'],
		sourceIds: ['MXM-NO-I'],
		handling: 'review',
		ruleIds: [],
		limit:
			'Existing Genius-mode dictionary checks are narrow language curation; never use them to erase sung Norwegian dialect in MXM. Artist origin is suggested human research, not an automatic dialect classifier.'
	},
	{
		id: 'MX-NO02',
		topic: 'Stor forbokstav',
		statement:
			"Use normal Norwegian proper-name/acronym case and the company's/product's actual casing.",
		languages: ['no'],
		sourceIds: ['MXM-NO-I'],
		handling: 'review',
		ruleIds: [],
		limit:
			'Does not expressly revoke the main line-initial rule. Preserve names such as mixed-case brands; do not blanket-case tokens.'
	},
	{
		id: 'MX-NO03',
		topic: 'Translation / compounds',
		statement:
			'Prefer Bokmål for translations into Norwegian; compound translations normally join, with hyphens for certain long/readability cases.',
		languages: ['no'],
		sourceIds: ['MXM-NO-I'],
		handling: 'review',
		ruleIds: [],
		limit:
			'The Bokmål preference is translation-specific, not authorization to normalize original dialect lyrics. Compound analysis needs language context.'
	},
	{
		id: 'MX-NO04',
		topic: 'Samisk og joiking',
		statement:
			'Sámi is a separate language whose writing must be retained; knowledgeable transcription is needed. Lyricless joik is described as instrumental.',
		languages: ['no'],
		sourceIds: ['MXM-NO-I'],
		handling: 'source-conflict',
		ruleIds: [],
		limit:
			'Do not map Sámi into Norwegian or remove vocables by heuristic. The joik reference to `#INSTRUMENTAL` needs reconciliation with the main interior-only marker rule and track-level instrumental workflow.'
	},
	{
		id: 'MX-DE01',
		topic: 'English-word casing',
		statement:
			'English nouns embedded in German use noun capitals; English clauses retain English grammar; borrowed verbs/adjectives remain lowercase; specified adjective+noun combinations capitalize both.',
		languages: ['de'],
		sourceIds: ['MXM-DE-I'],
		handling: 'review',
		ruleIds: [],
		limit:
			'Token-level “English-looking word” detection cannot choose the rule. Existing Genius title-case diagnostics are not a German grammar engine.'
	},
	{
		id: 'MX-DE02',
		topic: 'Apostrophes',
		statement:
			'A curated elision table depends on actual sung pronunciation and explicitly allows alternatives in several entries, including apostrophized/non-apostrophized forms.',
		languages: ['de'],
		sourceIds: ['MXM-DE-I'],
		handling: 'review',
		ruleIds: [],
		limit:
			'Encode allowed sets and scope, not a single canonical rewrite. Absence from a supplemental table cannot prohibit an official allowed form.'
	},
	{
		id: 'MX-DE03',
		topic: 'Producer tags',
		statement: 'Audible producer tags are lyrics; a recognition list is supplied.',
		languages: ['de'],
		sourceIds: ['MXM-DE-I'],
		handling: 'review',
		ruleIds: [],
		limit:
			'Broad agreement on preserving vocals. A list of known tags never authorizes insertion of an unheard tag.'
	},
	{
		id: 'MX-DE04',
		topic: 'Dialects',
		statement:
			'Dialect-shortened words can be independent words without elision apostrophes; contractions of separate words use apostrophes.',
		languages: ['de'],
		sourceIds: ['MXM-DE-I'],
		handling: 'review',
		ruleIds: [],
		limit:
			'Do not “repair” every shortened German dialect token as omitted Standard German letters.'
	},
	{
		id: 'MX-ES01',
		topic: 'Insights, punctuation',
		statement:
			'Terminal punctuation is limited to necessary question/exclamation marks and closing parentheses/quotes. Hyphens mark incomplete words; ellipses mark incomplete sentences, not ordinary performance pauses.',
		languages: ['es'],
		sourceIds: ['MXM-ES-I'],
		handling: 'check',
		ruleIds: ['mxm.punctuation.line-ending', 'mxm.punctuation.interruption'],
		limit:
			'Review interruption/phrase context; do not strip closing syntax or infer ellipses from pauses.'
	},
	{
		id: 'MX-ES02',
		topic: 'Insights, elision/contractions',
		statement:
			'A shortened single word generally omits the apostrophe unless it distinguishes another real word; merged-word contractions use an apostrophe; established colloquial abbreviations can be exceptions.',
		languages: ['es'],
		sourceIds: ['MXM-ES-I'],
		handling: 'review',
		ruleIds: [],
		limit:
			"Genius's general omission-apostrophe guidance cannot be applied as an unconditional Spanish MXM rule."
	},
	{
		id: 'MX-ES03',
		topic: 'Insights, spelling',
		statement:
			'Normal accents remain; an apostrophe does not replace an accent. Retain original `s`/`z` if aspiration/substitution is audible, omitting only when entirely absent.',
		languages: ['es'],
		sourceIds: ['MXM-ES-I'],
		handling: 'review',
		ruleIds: [],
		limit: 'Accent checks can be scoped; phonetic presence requires listening.'
	},
	{
		id: 'MX-ES04',
		topic: 'Insights, direct speech',
		statement:
			'Actual direct speech uses colon + space + opening quote + capital. Omit the colon if it would end a line. Quotation may span lines. Indirect speech has no colon/quotes; hypothetical quoted words keep quotes but receive no colon or automatic initial capital.',
		languages: ['es'],
		sourceIds: ['MXM-ES-I'],
		handling: 'check',
		ruleIds: ['mxm.punctuation.direct-speech'],
		limit:
			"Explicit conflict with `MX-F13`'s comma. Review and encode the Spanish exception; do not apply a global quote-prefix transform."
	},
	{
		id: 'MX-ES05',
		topic: 'Insights, vocal roles',
		statement:
			"Lead normally opens the line and determines sync; sequential secondary lyrics are plain, overlapping/background lyrics parenthesized. Unison/harmony is written once; echoes/reverb/nonhuman effects are excluded. In live performances, a lead's audience-directed aside takes parentheses unless alone on its line. Audience vocals are plain when carrying lyrics or standing alone, otherwise follow background treatment.",
		languages: ['es'],
		sourceIds: ['MXM-ES-I'],
		handling: 'review',
		ruleIds: [],
		limit:
			'Role/overlap/effect classification needs audio or supplied facts. Performer identity alone does not decide role; text similarity does not prove an echo or simultaneous unison.'
	},
	{
		id: 'MX-ES06',
		topic: 'Insights, backing placement',
		statement:
			'Put secondary text midline only where a lead pause accommodates it, otherwise favor line end. Avoid initial parentheses; remove them when they enclose an entire line. No punctuation immediately before an opening parenthesis.',
		languages: ['es'],
		sourceIds: ['MXM-ES-I'],
		handling: 'check',
		ruleIds: ['mxm.vocals.spanish-placement'],
		limit:
			'Structural edits can change timing and vocal attachment; require role/placement evidence. No unconditional “move all parentheses” conversion.'
	},
	{
		id: 'MX-ES07',
		topic: 'Insights, parenthetical case',
		statement:
			'Normally lowercase openings, with grammatical/name and sentence-ending-punctuation exceptions.',
		languages: ['es'],
		sourceIds: ['MXM-ES-I'],
		handling: 'check',
		ruleIds: ['mxm.format.parenthetical-case'],
		limit:
			"Confirmed conflict with Genius's capital-initial ad-lib convention; grammar remains a precondition."
	},
	{
		id: 'MX-ES08',
		topic: 'FAQ, acronyms/laughter',
		statement: 'Acronyms use uppercase without separating dots/spaces; laughter units use commas.',
		languages: ['es'],
		sourceIds: ['MXM-ES-Q'],
		handling: 'check',
		ruleIds: ['mxm.spelling.spanish-acronym'],
		limit: 'Do not infer acronym or laughter role from arbitrary letters.'
	},
	{
		id: 'MX-ES09',
		topic: 'FAQ, numbers',
		statement:
			'Context can justify words above ten; the source illustrates a large quantity without a complete exception predicate.',
		languages: ['es'],
		sourceIds: ['MXM-ES-Q'],
		handling: 'check',
		ruleIds: ['mxm.numbers.context'],
		limit:
			'The generic >10 conversion is not unconditional. Review fixed/contextual expressions and large values.'
	},
	{
		id: 'MX-ES10',
		topic: 'FAQ, names/case',
		statement:
			'Preserve artist/band spelling/case; detailed grammar distinguishes names, religion, geography, celestial objects, titles, dates and ordinary nouns. Mentioned artist, song and album names may be quoted.',
		languages: ['es'],
		sourceIds: ['MXM-ES-Q'],
		handling: 'review',
		ruleIds: [],
		limit:
			'No generic proper-name normalization. Direct speech is not the only permitted quotation role. The current Genius Spanish dictionary rules cover only a small subset.'
	},
	{
		id: 'MX-ES11',
		topic: 'FAQ, spelling/accents',
		statement:
			'Contains contextual homophone distinctions and explicit accent conventions, including unaccented `solo` and specified demonstratives/short verb forms.',
		languages: ['es'],
		sourceIds: ['MXM-ES-Q'],
		handling: 'check',
		ruleIds: ['mxm.spelling.spanish-accents'],
		limit:
			'Record source-specific lexical cases; not a general accent-removal operation. Meaning-dependent pairs remain review.'
	},
	{
		id: 'MX-ES12',
		topic: 'FAQ, line breaks',
		statement: 'At most 70 characters per lyric line and ten lines per stanza.',
		languages: ['es'],
		sourceIds: ['MXM-ES-Q'],
		handling: 'check',
		ruleIds: ['mxm.format.line-length', 'mxm.format.stanza-length'],
		limit:
			'Adds a limit missing from the main plan. Unicode counting unit and stanza/tag relationship are unspecified; review the count definition before enforcement and never auto-split at character 70.'
	},
	{
		id: 'MX-FR01',
		topic: 'Insights, punctuation',
		statement:
			'Commas follow grammatical lists/appositions/vocatives, not every audible pause; coordination has specific exceptions.',
		languages: ['fr'],
		sourceIds: ['MXM-FR-I'],
		handling: 'review',
		ruleIds: [],
		limit: 'Grammar/audio timing are different inputs; no pause-based comma insertion.'
	},
	{
		id: 'MX-FR02',
		topic: 'Insights, forbidden marks',
		statement:
			'Exclamation marks, colons and semicolons are prohibited, with an exception for punctuation belonging to a sung song title.',
		languages: ['fr'],
		sourceIds: ['MXM-FR-I'],
		handling: 'check',
		ruleIds: ['mxm.punctuation.french-marks'],
		limit:
			"Conflicts with general MXM allowance and Genius's excitement-based exclamation convention. Scope the reviewed French rule and name exception explicitly."
	},
	{
		id: 'MX-FR03',
		topic: 'Insights, questions',
		statement:
			'Required question marks have no preceding space, for grammatical questions or clearly questioning delivery.',
		languages: ['fr'],
		sourceIds: ['MXM-FR-I'],
		handling: 'check',
		ruleIds: ['mxm.punctuation.french-question-space'],
		limit:
			'Specific typography rule, not a blanket import of ordinary French publishing spacing. Delivery still needs judgment.'
	},
	{
		id: 'MX-FR04',
		topic: 'Insights, elision',
		statement:
			'Mark beginning/end elisions with apostrophes; retain standard spelling for internal elisions.',
		languages: ['fr'],
		sourceIds: ['MXM-FR-I'],
		handling: 'review',
		ruleIds: [],
		limit: 'Do not share an unconstrained Genius/English apostrophe inserter.'
	},
	{
		id: 'MX-FR05',
		topic: 'Insights, imperatives/verlan',
		statement:
			'Join imperatives and pronouns with hyphens; verlan retains underlying spelling and hyphenates rearranged syllables.',
		languages: ['fr'],
		sourceIds: ['MXM-FR-I'],
		handling: 'review',
		ruleIds: [],
		limit: 'Needs grammatical/lexical interpretation; no arbitrary syllable splitting.'
	},
	{
		id: 'MX-FR06',
		topic: 'Insights, times',
		statement:
			'The prose spells sub-ten or “precise” times, but its examples also use numeric times with minutes. Exactly ten is not specified.',
		languages: ['fr'],
		sourceIds: ['MXM-FR-I'],
		handling: 'source-conflict',
		ruleIds: ['mxm.numbers.context'],
		limit:
			'Internally ambiguous source: retain wording and block automatic boundary decisions until clarified.'
	},
	{
		id: 'MX-FR07',
		topic: 'FAQ, elision/decades',
		statement:
			'`y a` has no apostrophe; French decade expressions and embedded English decade expressions have different constructions.',
		languages: ['fr'],
		sourceIds: ['MXM-FR-Q'],
		handling: 'check',
		ruleIds: ['mxm.spelling.french-elision'],
		limit:
			'Explicit language scope, including mixed-language spans; no global decade-apostrophe rewrite.'
	},
	{
		id: 'MX-FR08',
		topic: 'FAQ, numbers',
		statement: 'Above-ten quantities normally use digits, but fixed expressions stay in words.',
		languages: ['fr'],
		sourceIds: ['MXM-FR-Q'],
		handling: 'check',
		ruleIds: ['mxm.numbers.context'],
		limit: 'Numeric interpretation must exclude fixed expressions; no blanket >10 conversion.'
	},
	{
		id: 'MX-FR09',
		topic: 'FAQ, backing vocals',
		statement:
			'Avoid disruptive midphrase backing/echo placement; significant backing material can appear at line end or separately.',
		languages: ['fr'],
		sourceIds: ['MXM-FR-Q'],
		handling: 'review',
		ruleIds: [],
		limit:
			'Does not provide a reliable text-only echo-deletion predicate. Preserve until role/placement is established.'
	},
	{
		id: 'MX-JA01',
		topic: 'Insights script sections; FAQ 3–5',
		statement:
			'Use original Japanese script even when release metadata is romanized; do not add furigana/readings, including unusual readings. Artist-selected kanji matter; use Japanese glyph forms rather than Chinese variants.',
		languages: ['ja'],
		sourceIds: ['MXM-JA-I', 'MXM-JA-Q'],
		handling: 'review',
		ruleIds: [],
		limit:
			'Header-English policy on Genius is unrelated. Distinguish pronunciation glosses from actual backing vocals before any removal; no global Han-character normalization.'
	},
	{
		id: 'MX-JA02',
		topic: 'Insights structure; FAQ 6',
		statement:
			'Structure belongs in tagging. Explicit A-melody/pre-chorus/chorus labels have stated mappings; B-melody, solo and C-melody labels each allow more than one target. Intro/outro refer to sung sections, not pure instrumental edges.',
		languages: ['ja'],
		sourceIds: ['MXM-JA-I', 'MXM-JA-Q'],
		handling: 'metadata',
		ruleIds: [],
		limit:
			'Some explicit source labels support mapping; ambiguous labels require choice. Preserve source labels and musical identity.'
	},
	{
		id: 'MX-JA03',
		topic: 'FAQ 1, 9',
		statement:
			'Halfwidth spacing/commas can aid phrasing and readability; line breaks follow meaning and singability.',
		languages: ['ja'],
		sourceIds: ['MXM-JA-Q'],
		handling: 'review',
		ruleIds: [],
		limit: 'No automatic spacing at every script boundary or split at a fixed character count.'
	},
	{
		id: 'MX-JA04',
		topic: 'FAQ 2, 11, 13',
		statement:
			'Vocalization spelling and Katakana/Latin choice depend on pronunciation, ordinary usage and official lyrics; repeated vocables can use hyphens/spaces/line breaks by phrasing.',
		languages: ['ja'],
		sourceIds: ['MXM-JA-Q'],
		handling: 'review',
		ruleIds: [],
		limit: 'No universal romanization/interjection replacement or separator.'
	},
	{
		id: 'MX-JA05',
		topic: 'FAQ 7',
		statement:
			'Separate blocks with blank lines, but says a blank is not needed immediately after `#INSTRUMENTAL`.',
		languages: ['ja'],
		sourceIds: ['MXM-JA-Q'],
		handling: 'source-conflict',
		ruleIds: ['mxm.structure.instrumental'],
		limit:
			'Directly conflicts with `MX-S12` requiring that blank. Do not silently select an automatic spacing policy.'
	},
	{
		id: 'MX-JA06',
		topic: 'FAQ 8',
		statement:
			'Lists Latin line starts, proper nouns/acronyms and parenthetical beginnings among capitalization cases; rejects arbitrary all-caps/all-lowercase/title-case presentation.',
		languages: ['ja'],
		sourceIds: ['MXM-JA-Q'],
		handling: 'source-conflict',
		ruleIds: [
			'mxm.format.parenthetical-case',
			'mxm.format.line-initial',
			'mxm.format.expressive-case'
		],
		limit:
			'Parenthetical wording differs from main grammatical-only guidance; exact mixed-script/parenthetical scope needs resolution.'
	},
	{
		id: 'MX-JA07',
		topic: 'FAQ 10',
		statement: "Children's lyric kanji/kana choices depend on intended age.",
		languages: ['ja'],
		sourceIds: ['MXM-JA-Q'],
		handling: 'review',
		ruleIds: [],
		limit: 'Audience metadata/human judgment; no universal all-kana conversion.'
	},
	{
		id: 'MX-JA08',
		topic: 'FAQ 12',
		statement:
			'Avoid excessive Japanese corner quotes in dialogue; line breaks/halfwidth spaces/parentheses can support long spoken content.',
		languages: ['ja'],
		sourceIds: ['MXM-JA-Q'],
		handling: 'review',
		ruleIds: [],
		limit: 'General comma-plus-quotes treatment is not a universal Japanese conversion.'
	},
	{
		id: 'MX-JA09',
		topic: 'FAQ 14',
		statement:
			'Use fullwidth question/exclamation marks after fullwidth preceding characters, ASCII forms after halfwidth characters.',
		languages: ['ja'],
		sourceIds: ['MXM-JA-Q'],
		handling: 'check',
		ruleIds: ['mxm.punctuation.japanese-width'],
		limit:
			'Define and review width classification for mixed scripts and punctuation; no NFKC normalization of the whole draft.'
	},
	{
		id: 'MX-JA10',
		topic: 'Insights, translations',
		statement:
			'Where strict sentence alignment fails, meaning may be redistributed over its existing two or three lines while total line count stays fixed.',
		languages: ['ja'],
		sourceIds: ['MXM-JA-I', 'MXM-JA-Q'],
		handling: 'metadata',
		ruleIds: [],
		limit:
			'Qualifies the main translation instruction. Preserve translation alignment; linguistic translation remains outside the transformer.'
	},
	{
		id: 'MX-W01',
		topic: '[Romanization guidance][MXM-ROM]',
		statement:
			'Native-script lyrics and romanized forms in the Translation surface are distinct. Editing automatic romanizations is restricted to high-rank Curators. The current article gives no usable complete per-language romanization list.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-ROM'],
		handling: 'metadata',
		ruleIds: [],
		limit:
			'Preserve content kind and script. Do not claim that Arabic/Korean automatic romanization is available from this page title.'
	},
	{
		id: 'MX-W02',
		topic: '[Studio][MXM-STUDIO], interface',
		statement:
			'Lyrics, Sync, Tag and Translate are separate tabs; Tag contains structure and performer work. Some contributions can be locked; Credits has a different Pro scope.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-STUDIO'],
		handling: 'metadata',
		ruleIds: [],
		limit:
			'Confirms separate metadata workflow, not clipboard/interchange support or access for every user.'
	},
	{
		id: 'MX-W03',
		topic: '[Translation help][MXM-TRANSLATE]',
		statement:
			'Translation must be personally authored, not copied or machine-translated, with context and original untranslatable terms preserved.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-TRANSLATE'],
		handling: 'workflow',
		ruleIds: [],
		limit: 'Document scope; the deterministic format engine does not translate lyrics.'
	},
	{
		id: 'MX-W04',
		topic: '[API metadata][MXM-METADATA], instrumental flag',
		statement:
			'Music-only tracks have a track-level instrumental flag. English FAQ also describes marking a whole track instrumental after full listening.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-METADATA'],
		handling: 'metadata',
		ruleIds: [],
		limit:
			'Whole-track status is documented; exact community submission controls/text payload remain unverified. Do not emit interior-marker syntax as the entire track.'
	},
	{
		id: 'MX-W05',
		topic: '[Bulk submission][MXM-BULK]',
		statement:
			'Publisher/label partner workflows support CSV/JSONL/DDEX and dedicated synced-lyric delivery; text preserves breaks/paragraphs. The inspected JSONL schema has no structure/performer-range fields.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-BULK'],
		handling: 'metadata',
		ruleIds: [],
		limit:
			'Official import formats exist, but they do not establish an available ordinary-community import for our retained metadata.'
	},
	{
		id: 'MX-C01',
		topic: '[English Extended Guidelines][MXM-EN-EXT]',
		statement:
			'Community-built, explicitly nonbinding, dated January 28, 2025. Adds punctuation/name/time exceptions, date-ordinal spelling, regional English, sung letters, melisma and separator advice.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-EN-EXT'],
		handling: 'advisory',
		ruleIds: [],
		limit:
			'Do not elevate every recommendation to official MXM policy. Date ordinals can conflict with a broad reading of the main numeric-date rule; semantic/audio evidence still matters.'
	},
	{
		id: 'MX-C02',
		topic: '[Line-break teaching guide][MXM-LINES]',
		statement:
			'Linked contributor teaching guide; no visible date. Recommends musical/meaningful boundaries and states a 70-character limit.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-LINES'],
		handling: 'advisory',
		ruleIds: [],
		limit:
			"This is weaker general-language evidence than the official Spanish FAQ's explicit limit. Unicode count and stanza/tag cardinality remain unspecified."
	},
	{
		id: 'MX-C03',
		topic: '[German extended guide][MXM-DE-EXT]',
		statement:
			'Dated July 7, 2026; explicitly says some advice differs from official requirements. Prefers `whoa`, colon before direct speech, standalone hyphen for full censoring, round-number exceptions, sung-`Uhr` time rules, and further punctuation/voice conventions.',
		languages: ['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'],
		sourceIds: ['MXM-DE-EXT'],
		handling: 'advisory',
		ruleIds: [],
		limit:
			"`whoa` conflicts with Genius's `woah`; comma→colon conflicts with main MXM. Preserve advisory standing and context. Omission of an apostrophized alternative from its table does not prohibit one allowed by official German Insights."
	}
];

export function guidelinesForLanguage(language: string): readonly ProfileGuideline[] {
	const base = profileLanguage(language);
	return profileGuidelines.filter((entry) => entry.languages.includes(base));
}

/** Dedicated language policies have not been established by the inspected sources. */
export const languagePolicyGaps = {
	ar: 'No reviewed Arabic-specific Musixmatch source establishes numeric morphology, digit-set conversion, dialect normalization, or orthographic exceptions.',
	ko: 'No reviewed Korean-specific Musixmatch source establishes number readings, spacing, elisions, or romanization exceptions.'
} as const;
