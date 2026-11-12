# Musixmatch and Genius: guideline evidence and conversion decisions

Research date: September 16, 2026. **Read this before implementing platform conversions.**
This is the policy evidence behind the [engine plan](platform-conversion-plan.md),
[implementation specification](platform-conversion-implementation.md), and
[UI specification](platform-conversion-ui.md).

The earlier plan contained an initial difference table, not this inventory. This document
separates what a source says, what LyricLint currently implements, and what a converter may
conclude. A deterministic implementation cannot settle missing or contradictory policy.

## Evidence and scope

- Musixmatch's supplied [main guideline page][MXM-MAIN] was fetched again on September 16.
  Its HTML is identical to the September 15 research snapshot. The inventory below covers its
  introduction and all six contribution areas, including requirements that cannot be automated.
- Official language-specific Help Center articles are additional sources, not merely examples
  of the English page. Explicit language qualifications must be represented in policy data.
- Genius comparisons use the repository's existing reviewed paraphrases and source records in
  [guidance entries](../src/lib/guidance/entries.ts), [sources](../src/lib/rules/data/sources.ts),
  and [rules documentation](rules.md). They inherit those review dates and authority tiers.
  Genius pages were **not freshly reverified** in this research.
- These are research notes, not newly approved production catalog entries. Adding those entries
  follows [the guidance review process](guidelines.md), including reviewed interpretations and
  invented valid/invalid/ambiguous examples. No production rule is changed by this document.
- A source's silence is **unknown**, not permission and not prohibition. An existing linter
  heuristic is not proof of a platform requirement.

Planning IDs below are stable references for decisions and fixtures; they are not yet registered
production rule/source IDs. All requirements are paraphrased. Examples written for decisions
are invented; no real-song examples from the source pages are copied here.

### How to read the tables

The MXM column states the main page's rule, before language-specific qualifications. The Genius
column states the reviewed comparison or explicitly says evidence is missing. The last column
is **our proposed engineering consequence**, not additional platform policy:

- **Convert:** a possible mechanical representation operation, only when its stated facts are
  known and lossless mapping is possible.
- **Check:** a deterministic finding is possible; a fix may still require a user decision.
- **Retain:** preserve source information outside target lyric text.
- **Review:** wording, identity, meaning, recording evidence, or source interpretation is needed.
- **Workflow:** a contribution requirement or native-platform action, not a text rewrite.

“Same broad rule” does not mean that every exception, severity, or existing implementation can
be shared. Conversion eligibility and a user-requested diagnostic fix remain separate decisions.

## 1. Differences that already affect the design

| Area | Evidence-based difference | Decision |
| --- | --- | --- |
| Section/performer labels | Genius represents them in headers and style markup. MXM excludes labels from lyric text and has separate tagging workflows. | Retain structure/voices as metadata; never change every header into a hashtag lyric line. |
| Numbers | Genius generally spells quantities; MXM main page uses digits above ten. Time and language exceptions matter. | No blanket word/digit substitution; use explicit numeric roles and language policies. |
| O'clock times | Reviewed Genius guidance uses digits; MXM main page spells the number. | A real direction-dependent operation, after time interpretation is known. |
| Censored audio | Genius uses a four-star mask; MXM represents the heard cutoff with a hyphen. | A Genius mask cannot recover the missing audible prefix; require supplied evidence. |
| Sound effects | Genius permits marked production-sound descriptions; MXM excludes them. | Omit only identified non-vocal descriptions, retain them for the return trip. |
| Parenthetical vocals | Genius guidance capitalizes ad-lib openings; MXM main page follows grammatical context. | No automatic lowercasing of every parenthesis. Read the Japanese qualification below. |
| Hook | MXM distinguishes Hook. Genius's deprecation is English-scoped and other communities differ. | Preserve the source meaning; do not use a universal Hook→Chorus alias. |
| Section length | MXM main page imposes ten lines; Genius immediate-repeat grouping can exceed that. | Detect the issue, but do not invent a musical break or assume stanza and tag boundaries are identical. |
| Direct speech | MXM main page specifies a comma; Spanish guidance specifies a colon. | Language is a policy input, not only a spelling dictionary choice. |
| Punctuation | French guidance restricts marks that the MXM general page allows; Japanese specifies width-sensitive marks. | Profile-wide English punctuation rules are insufficient. |
| Instrumental spacing | MXM main page requires a blank after the marker; Japanese FAQ says it is not needed. | Record a source conflict; no unreviewed automatic winner. |

## 2. Main Musixmatch page, clause by clause

All MXM locators in this section refer to [Lyrics Guidelines][MXM-MAIN]. The page has no reliable
unique fragment for each claim, so subsection names below are the source locators; do not invent
deep links to nonexistent anchors.

### Introduction and transcription

| ID / source locator | Musixmatch requirement | Genius comparison | Engine consequence |
| --- | --- | --- | --- |
| `MX-SCOPE-01` · Introduction | Contribution rules apply across community, artist, representative, publisher and distributor accounts; tools/submission paths differ. | No claim of equivalent Genius account workflows in reviewed material. | Workflow: distinguish guideline support from having a native submission integration. |
| `MX-T01` · Transcribe A | Listen to the whole recording and produce the transcription yourself; do not copy another source's transcription. | Broad agreement with [G-ADD-SONGS]; Genius also records an artist/team-material exception subject to checking. MXM main page does not state that exception. | Workflow: conversion cannot certify authorship, listening or provenance. |
| `MX-T02` · Transcribe A | Include the complete vocal material, including producer tags, backing vocals and live performer/audience interjections. | [G-ADLIBS], [G-SECTIONS] also cover ad-libs/sample voices; [G-STREAMING] chooses the streaming-release version. | Review: retain vocals; switching cannot choose the recording or prove completeness. |
| `MX-T03` · Transcribe A | Write every actual repetition; do not substitute a multiplier for repeated lyrics. | Same broad convention in [G-REPEATS]. | Check: shared placeholder finding is possible. Expansion requires known scope, count and wording. |
| `MX-T04` · Transcribe A | Preserve audible expletives; represent an actual censored cutoff with a hyphen rather than asterisks. | [G-CENSORED] uses exactly four asterisks for an audio-censored word, even when some letters are audible. | Review: mask→prefix is information loss in reverse; a hyphen alone does not establish censoring. |
| `MX-T05` · Transcribe B | Exclude section and artist labels from the transcription text. | [G-SECTIONS] requires section headers and specified performer legends/styles. [G-NON-ENGLISH] allows an extra title header on non-English pages. | Convert/retain recognized syntax as metadata; ambiguous brackets stay visible. |
| `MX-T06` · Transcribe B | Exclude production-sound effects and descriptions. | [G-SFX] permits asterisk-delimited effects and distinguishes vocalized sounds from produced ones. | Convert/retain only when the item is known to be a description, not sung text or a censor mask. |
| `MX-T07` · Transcribe C | Include significant filler/vocalization, with moderation rather than exhaustive prolonged vowel strings. | [G-ADLIBS] asks for every ad-lib, but excludes echo/delay repeats; [G-YODELING] has specific syllable/fallback conventions. | Review: stylistic significance and echo origin require listening. Never delete repeated vowels automatically. |
| `MX-T08` · Transcribe D | Generally use original scripts; consult the linked romanization guidance for details. | [G-ROMANIZED] puts romanizations on separate pages. Header language is a different issue. | Retain original script; no automatic transliteration. See official supplemental sources below. |
| `MX-T09` · Transcribe note | Potential hate speech, slurs/dehumanization, incitement, discriminatory conspiracy claims and extremist material require accuracy review with other contributors, including a Specialist; without agreement, leave the task; an internal ticket path is provided. | No corresponding workflow established in the inspected Genius catalog. | Workflow: document MXM's contribution process, without generating censorship rewrites, asserting verification, or contacting anybody automatically. |

### Formatting

| ID / source locator | Musixmatch requirement | Genius comparison | Engine consequence |
| --- | --- | --- | --- |
| `MX-F01` · Format A | Divide lyrics according to musical structure; a formatted section has at most ten lines. | [G-LINES] follows musical phrases; [G-REPEATS]/[G-SECTIONS] group immediately repeated parts under one header. No reviewed general Genius ten-line ceiling. | Check/review: count actual lyric lines, not soft wraps; splitting requires an appropriate boundary. |
| `MX-F02` · Format B | Capitalize line beginnings and proper nouns. | Broad agreement with [G-CAPS], which also contains detailed conventional/name exceptions. | Check only cased scripts and reviewed contexts; proper-name inference is not automatic proof. |
| `MX-F03` · Format B | Capitalize the following start after a question/exclamation. | Conventional capitalization is reviewed in [G-CAPS]; exact sentence recognition remains contextual. | Check/review sentence starts under the language policy. |
| `MX-F04` · Format B | Do not use arbitrary title capitals or uppercase to depict shouting. | Broad agreement with [G-CAPS]. | Check/review; preserve acronyms and established name casing. |
| `MX-F05` · Format B | Parenthetical backing vocals take capitals when grammar calls for them. | [G-ADLIBS]/[G-CAPS] capitalize parenthetical ad-lib openings. | Review contextual changes; do not globally lowercase parenthetical beginnings. |
| `MX-F06` · Format C | Ordinary numbers above ten use digits; ten and below use words. | [G-NUMBERS] generally spells numbers as pronounced, including forms such as hundreds. | Convert only recognized quantities under a reviewed language-specific numeric policy. |
| `MX-F07` · Format C | Phone numbers, dates and decades use numerical forms. | [G-NUMBERS] also exempts phones/years and other named cases. Genius decades attribution is inconsistent in current docs; see evidence issues. | Preserve identifier strings/leading zeros; classify dates separately from counts. |
| `MX-F08` · Format C | Exact times use digits, but an o'clock time spells its number. | [G-NUMBERS] explicitly keeps the number before o'clock as digits. | Convert only an established time expression; retain its source form. |
| `MX-F09` · Format D | No terminal comma or non-acronym period. | Current Genius-mode removal rule is Apple-derived advice; the Genius catalog itself contains contradictory attribution. | Check with MXM provenance and an acronym-aware predicate; resolve language-specific punctuation qualifications. |
| `MX-F10` · Format D | Question and exclamation marks are permitted with restraint. | [G-QE-MARKS] requires question marks for questions and reserves exclamations for excitement. | Check/review; French restrictions below prevent universal reuse. |
| `MX-F11` · Format D | End hyphens/ellipses indicate interruption or fade-out. | [G-DASHES] distinguishes dropped-word em dashes from stutter/scat hyphens. | Review the semantic kind before transforming punctuation; no global dash replacement. |
| `MX-F12` · Format E | Use the supplied standardized slang forms, with meaning-sensitive distinctions. | [G-SPELLING] has a larger reviewed table and contextual/English-variant exceptions. | Share only evidenced overlaps; a Genius dictionary is not an MXM dictionary. |
| `MX-F13` · Format F | Introduce direct speech with a comma, enclose it in quotation marks and capitalize its beginning. | [G-QUOTES] supports quotation usage; [G-TYPEWRITER] explicitly prefers straight glyphs. | Review speech recognition. Curly glyphs in MXM examples do not by themselves mandate curly quotes. Spanish has a specific colon instruction. |

The concrete forms supplied under `MX-F12`, shown here with neutral straight apostrophes rather
than making a typography claim, are: `ballin'`, `'cause` for because, `cuz` for cousin, `'em`,
`gon'` or `gonna`, `I'ma`, `outta`, `'til`, `yo` as greeting and `yo'` as possessive. Initial
capitals in the source's list are not permission to capitalize every occurrence. This finite
list does not establish policy for every form in LyricLint's current Genius spelling table.

### Sync

| ID / source locator | Musixmatch requirement | Genius comparison | Engine consequence |
| --- | --- | --- | --- |
| `MX-Y01` · Sync note | Correct transcription errors while syncing; saving endorses the contribution as a whole. | No equivalent sync requirement in the reviewed Genius source registry. | Workflow: successful formatting/timing checks cannot certify the whole contribution. |
| `MX-Y02` · Sync A | Align each line with the onset of its first sung character, without an artificial breathing lead-in. | Existing LyricLint anchors/sync are product behavior, not a sourced Genius convention. | Preserve authored timing; do not shift every timestamp or claim audio alignment from text. |
| `MX-Y03` · Sync B | Review each line and refine its timing; the native tools provide per-line adjustments and restart. | No equivalent native Genius workflow established here. | Workflow: our existing controls may support editing, but copied text does not transfer sync automatically. |
| `MX-Y04` · Sync C | Listen to full lines and work carefully; the source illustrates that syncing should take at least the recording's duration. | No corresponding Genius speed/timing rule established. | Human/audio review, not a deterministic elapsed-time validator or a delay imposed by the editor. |

### Structure tags

The tag definitions are musical descriptions, not sufficient text-only classifiers.

| ID / source locator | Musixmatch tag meaning | Genius comparison | Engine consequence |
| --- | --- | --- | --- |
| `MX-S01` · Tag Structure A, Intro | A distinct opening passage, at the beginning. | [G-SECTIONS] and language packs recognize Intro. | Convert a known type; do not infer it merely because a paragraph is first. |
| `MX-S02` · Tag Structure A, Verse | Narrative passage whose music commonly returns with changed words. | Genius recognizes Verse with language-specific vocabulary. | Preserve known structure; differing text alone does not prove a Verse. |
| `MX-S03` · Tag Structure A, Pre-Chorus | A connecting passage preparing a chorus, commonly after a verse. | Genius recognizes Pre-Chorus. | Convert known type; do not invent it from position. |
| `MX-S04` · Tag Structure A, Chorus | A prominent memorable passage, often repeating unchanged. | Genius recognizes Chorus, but several translated labels overlap other concepts. | Matching repeated text does not alone establish the type. |
| `MX-S05` · Tag Structure A, Hook | A catchy, often more repetitive and less melodic/lyrical passage, distinguished from Chorus. | [G-SECTION-HOOK] deprecates Hook for English only; German retains it in a different alias system. | Preserve distinction; explicit target decision when correspondence is not established. |
| `MX-S06` · Tag Structure A, Bridge | A contrasting passage, commonly later in the song and between chorus repetitions. | Genius recognizes Bridge. | The source's approximate position is descriptive, not a percentage-based detector. |
| `MX-S07` · Tag Structure A, Outro | A concluding passage at the end, possibly distinguished by music despite repeated words. | Genius recognizes Outro. | Type is not derivable from repeated wording or final position alone. |
| `MX-S08` · Tag Structure A/D | Do not force every available type into a song; genre/tradition can change interpretation. | Genius has additional section concepts and language-dependent inventories. | Seven described tags do not justify lossy collapse of all other source concepts. |
| `MX-S09` · Tag Structure B | Listen to the full recording and assign a structure tag to each section. | Genius places headers above song parts. | Metadata workflow; no implication that tag labels are copied lyric text. |
| `MX-S10` · Tag Structure C | For an interior stretch exceeding 15 consecutive seconds without lyrics, type and sync an `#INSTRUMENTAL` lyric line. | [G-INSTRUMENTAL] describes a whole instrumental track's `[Instrumental]` field, not this duration test. | Require known interval boundaries and no qualifying lyrical content; vocalization/joik classification requires review. Two lyric-start anchors do not establish duration. |
| `MX-S11` · Tag Structure C | Put that marker between separately tagged sections, never inside one or at the song's beginning/end. | No equivalent threshold/placement rule established by the reviewed Genius whole-track source. | Check known placement; do not convert an entire instrumental song to this marker. |
| `MX-S12` · Tag Structure C | Put a blank line after the instrumental marker. | No general Genius equivalent. Japanese MXM FAQ directly contradicts this instruction. | Source conflict for Japanese; no automatic shared spacing rule. |
| `MX-S13` · Tag Structure D | Seek community help for uncertain structure instead of forcing a type. | Localized Genius communities also settle header vocabulary. | Review with an explicit unknown/unresolved state; no automatic outreach. |

### Performer tags

| ID / source locator | Musixmatch requirement | Genius comparison | Engine consequence |
| --- | --- | --- | --- |
| `MX-P01` · Tag Performers heading | The described feature is desktop-only. | Different Genius editing workflow. | This limits native handoff claims, not LyricLint's ability to retain local metadata on a phone. |
| `MX-P02` · Tag Performers A | Finish required structure tags and other contribution work before performer tagging. | Genius legends and styles are part of lyric markup. | Metadata workflow; explicit sections are a prerequisite for native section tagging. |
| `MX-P03` · Tag Performers B | Listen to each complete section before assigning its performers. | [G-SECTIONS] identifies voices by their actual contribution. | Review identity; roster presence is not proof of who sang. |
| `MX-P04` · Tag Performers B | A single performer can be assigned to an entire section. | Genius has section-wide unstyled/default voice and legends. | Convert known section assignment into metadata. |
| `MX-P05` · Tag Performers B | For multiple performers, select their particular lyric ranges and tag each. | Genius uses four text styles and unison groups; crowded arrangements can be explained by annotation. | Retain full range/group identity; no evidence for a four-style MXM limit. |
| `MX-P06` · Tag Performers C | Tag individual people rather than bands, using their commonly known stage names. | [G-SECTIONS] has release-credit, character, sample and AI conventions, not an established identical restriction. | Do not expand a band into guessed members, rename people, or infer identities. |
| `MX-P07` · Tag Performers D | Fanchant category covers crowd/uncredited-ensemble vocals; the prose names K-pop, while its linked example is outside K-pop. | No identical Genius category mapping established. | Preserve category as explicit fact; genre scope needs clarification before a restrictive rule. |
| `MX-P08` · Tag Performers D | Voice-over category covers primary lyrics from an uncredited, unrecognized human voice. | Genius unknown/sample voices do not prove this precise role. | Review vocal role; unknown identity alone does not select this category. |
| `MX-P09` · Tag Performers D | Backing-vocalist category covers backing vocals without a credited/recognized performer. | Genius styles identify voices but do not inherently classify lead/backing role. | Review role separately from performer identity. |
| `MX-P10` · Tag Performers D | Robotic-vocal category covers voices edited beyond recognition as human. | Genius has separate AI/consent/virtual-artist conventions. | No automatic AI↔robotic equivalence. |
| `MX-P11` · Tag Performers E | Ask the community about difficult cases. | No need to invent an equivalent native Genius action. | Workflow only; no external messages from the engine. |

### Translation

| ID / source locator | Musixmatch requirement | Genius comparison | Engine consequence |
| --- | --- | --- | --- |
| `MX-L01` · Translate heading | The described translation feature is desktop-only. | Genius translations use separate pages. | Native workflow limitation; local preservation is a separate capability. |
| `MX-L02` · Translate A | Translate the existing formatted lines individually; do not combine several source lines into one translation line. | [G-TRANSLATIONS] establishes separate pages; detailed alignment rules are not reviewed in this repository. | Preserve known alignment metadata; no automatic translation. Japanese has a meaning-distribution qualification. |
| `MX-L03` · Translate A | Prefer verified, locked source lyrics to reduce later translation loss. | No corresponding verified-lock translation workflow established. | Recommendation, not a text-validation error or a claim LyricLint can verify the lock. |
| `MX-L04` · Translate B | Transcription and formatting rules also apply to translations. | Genius translations have their own guide beyond the inspected separate-page source. | Track translation status explicitly; do not infer it from script/header vocabulary. |
| `MX-L05` · Translate C | Preserve the source line's tone. | Not enough reviewed Genius evidence for a detailed comparison. | Human linguistic review. |
| `MX-L06` · Translate D | Retain words/names that cannot sensibly be translated. | Not enough reviewed Genius evidence for a detailed comparison. | No automatic proper-name translation or normalization. |
| `MX-L07` · Translate E | Convey the intended message idiomatically instead of mechanically translating each word. | Not enough reviewed Genius evidence for a detailed comparison. | Outside deterministic format conversion. |

## 3. Official supplemental and language-specific guidance

The source register and language findings below extend the main-page inventory. An explicit
language instruction is scoped to that language. A genuine contradictory pair is marked for
resolution rather than silently resolved by whichever source was fetched most recently.

### Source inventory

All sources in this table were read on September 16. Dates are the articles' own modification
dates, not new human policy approvals. Exact retrieval fingerprints are recorded in the
[source manifest](platform-guidelines-sources.json).

| Planning source key | Official source | Modified | Scope |
| --- | --- | --- | --- |
| `MXM-EN-I` | [English Insights][MXM-EN-I] | 2025-05-23 | Brands, regional/contextual lexicons; links supplemental guides |
| `MXM-EN-Q` | [English FAQ][MXM-EN-Q] | 2026-08-18 | Unknown lyrics, backing vocals, abbreviations, sync, remixes/live content |
| `MXM-NO-I` | [Norwegian Insights][MXM-NO-I] | 2025-06-16 | Dialect, casing, translations, compounds, Sámi/joik |
| `MXM-DE-I` | [German Insights][MXM-DE-I] | 2026-08-31 | English words in German, elision table, producer tags, dialect |
| `MXM-ES-I` | [Spanish Insights][MXM-ES-I] | 2025-05-23 | Punctuation, contractions, speech, primary/secondary vocals |
| `MXM-ES-Q` | [Spanish FAQ][MXM-ES-Q] | 2025-05-23 | Acronyms, accents, names, numbers, line/stanza limits |
| `MXM-FR-I` | [French Insights][MXM-FR-I] | 2025-05-23 | Punctuation, elision, imperatives, verlan, times |
| `MXM-FR-Q` | [French FAQ][MXM-FR-Q] | 2025-05-23 | `y a`, decades, fixed-expression numbers, backing vocals |
| `MXM-JA-I` | [Japanese Insights][MXM-JA-I] | 2025-05-23 | Script/readings, structure correspondences, translation |
| `MXM-JA-Q` | [Japanese FAQ][MXM-JA-Q] | 2025-05-23 | Fourteen numbered formatting/script/vocalization questions |
| `MXM-ROM` | [Romanization and supported languages][MXM-ROM] | 2025-07-24 | Native scripts, romanized translation surface, restricted editing |
| `MXM-STUDIO` | [The Studio for starters][MXM-STUDIO] | 2026-04-30 | Separate lyric, sync, tag, and translation workflows |
| `MXM-TRANSLATE` | [How to translate][MXM-TRANSLATE] | 2025-05-28 | Self-authored translation, no machine translation, structure/context |

The inspected [Insights collection][MXM-INSIGHTS] has 16 articles, the
[language FAQ collection][MXM-FAQ] has six, and the
[romanization Insights collection][MXM-ROM-INSIGHTS] has two (Urdu and Tamil). None lists an
Arabic or Korean writing-policy article. Targeted official Help Center searches also did not
locate one. This is a **source gap**, not proof that those languages have no exceptions.
The site's localization-language list concerns interface translation and cannot fill that gap.

### English

| ID / locator | Additional MXM evidence | Genius comparison / decision |
| --- | --- | --- |
| `MX-EN01` · FAQ, unclear lyrics | Seek help/research instead of leaving blanks or question-mark replacement tokens for undeciphered words. | Direct conflict with Genius `[?]` for English. Keep the uncertainty visible as unresolved work; neither delete the token nor invent a word. |
| `MX-EN02` · FAQ, abbreviations | Ask for confirmation of unlisted abbreviated forms. | A deterministic engine can report missing coverage, not invent an approved spelling or contact a contributor. |
| `MX-EN03` · FAQ, backing vocals | Secondary vocals use parentheses and generally lowercase beginnings unless grammar or sentence-ending punctuation calls for capitals. | Confirms a specific difference from Genius's ad-lib initial-capital convention. This is not permission to lowercase proper nouns or English `I`. |
| `MX-EN04` · FAQ, sync/remixes/live | Align the first sound without a lead-in; include live speech and remix vocals unless effects make them genuinely indecipherable; listen to the entire track before marking it instrumental. | Authoritative workflow qualification, not proof that current anchors are accurate or that a long opening means an instrumental track. |
| `MX-EN05` · Insights, Brand Love | Supplies brand spellings and context-dependent short names. | Curated identity evidence; do not expand every nickname or treat brand recognition as certain. |
| `MX-EN06` · Insights, regional/slang tables | Supplies British, Nigerian, Patois and contemporary slang with meanings and allowed variants. | These are separate lexical inventories; translating dialect into standard English is not a correction. A token's meaning still matters. |

The lexical tables need row-by-row policy extraction and invented fixtures before becoming
conversion data. Their accompanying real-song/illustrative text is not test material to copy.
Neither the Genius spelling table nor Harper's dictionary substitutes for this review.

### Norwegian

| ID / Insights locator | Additional MXM evidence | Genius comparison / decision |
| --- | --- | --- |
| `MX-NO01` · Dialektbruk | Preserve the dialect actually sung instead of standardizing an original transcription to Bokmål/Nynorsk. | Existing Genius-mode dictionary checks are narrow language curation; never use them to erase sung Norwegian dialect in MXM. Artist origin is suggested human research, not an automatic dialect classifier. |
| `MX-NO02` · Stor forbokstav | Use normal Norwegian proper-name/acronym case and the company's/product's actual casing. | Does not expressly revoke the main line-initial rule. Preserve names such as mixed-case brands; do not blanket-case tokens. |
| `MX-NO03` · Translation / compounds | Prefer Bokmål for translations into Norwegian; compound translations normally join, with hyphens for certain long/readability cases. | The Bokmål preference is translation-specific, not authorization to normalize original dialect lyrics. Compound analysis needs language context. |
| `MX-NO04` · Samisk og joiking | Sámi is a separate language whose writing must be retained; knowledgeable transcription is needed. Lyricless joik is described as instrumental. | Do not map Sámi into Norwegian or remove vocables by heuristic. The joik reference to `#INSTRUMENTAL` needs reconciliation with the main interior-only marker rule and track-level instrumental workflow. |

### German

| ID / Insights locator | Additional MXM evidence | Genius comparison / decision |
| --- | --- | --- |
| `MX-DE01` · English-word casing | English nouns embedded in German use noun capitals; English clauses retain English grammar; borrowed verbs/adjectives remain lowercase; specified adjective+noun combinations capitalize both. | Token-level “English-looking word” detection cannot choose the rule. Existing Genius title-case diagnostics are not a German grammar engine. |
| `MX-DE02` · Apostrophes | A curated elision table depends on actual sung pronunciation and explicitly allows alternatives in several entries, including apostrophized/non-apostrophized forms. | Encode allowed sets and scope, not a single canonical rewrite. Absence from a supplemental table cannot prohibit an official allowed form. |
| `MX-DE03` · Producer tags | Audible producer tags are lyrics; a recognition list is supplied. | Broad agreement on preserving vocals. A list of known tags never authorizes insertion of an unheard tag. |
| `MX-DE04` · Dialects | Dialect-shortened words can be independent words without elision apostrophes; contractions of separate words use apostrophes. | Do not “repair” every shortened German dialect token as omitted Standard German letters. |

The official Insights article links a more extensive German guide. Its additional prescriptions
have separate standing, documented below; they are not silently promoted to official policy.

### Spanish

| ID / locator | Additional MXM evidence | Genius comparison / decision |
| --- | --- | --- |
| `MX-ES01` · Insights, punctuation | Terminal punctuation is limited to necessary question/exclamation marks and closing parentheses/quotes. Hyphens mark incomplete words; ellipses mark incomplete sentences, not ordinary performance pauses. | Review interruption/phrase context; do not strip closing syntax or infer ellipses from pauses. |
| `MX-ES02` · Insights, elision/contractions | A shortened single word generally omits the apostrophe unless it distinguishes another real word; merged-word contractions use an apostrophe; established colloquial abbreviations can be exceptions. | Genius's general omission-apostrophe guidance cannot be applied as an unconditional Spanish MXM rule. |
| `MX-ES03` · Insights, spelling | Normal accents remain; an apostrophe does not replace an accent. Retain original `s`/`z` if aspiration/substitution is audible, omitting only when entirely absent. | Accent checks can be scoped; phonetic presence requires listening. |
| `MX-ES04` · Insights, direct speech | Actual direct speech uses colon + space + opening quote + capital. Omit the colon if it would end a line. Quotation may span lines. Indirect speech has no colon/quotes; hypothetical quoted words keep quotes but receive no colon or automatic initial capital. | Explicit conflict with `MX-F13`'s comma. Review and encode the Spanish exception; do not apply a global quote-prefix transform. |
| `MX-ES05` · Insights, vocal roles | Lead normally opens the line and determines sync; sequential secondary lyrics are plain, overlapping/background lyrics parenthesized. Unison/harmony is written once; echoes/reverb/nonhuman effects are excluded. In live performances, a lead's audience-directed aside takes parentheses unless alone on its line. Audience vocals are plain when carrying lyrics or standing alone, otherwise follow background treatment. | Role/overlap/effect classification needs audio or supplied facts. Performer identity alone does not decide role; text similarity does not prove an echo or simultaneous unison. |
| `MX-ES06` · Insights, backing placement | Put secondary text midline only where a lead pause accommodates it, otherwise favor line end. Avoid initial parentheses; remove them when they enclose an entire line. No punctuation immediately before an opening parenthesis. | Structural edits can change timing and vocal attachment; require role/placement evidence. No unconditional “move all parentheses” conversion. |
| `MX-ES07` · Insights, parenthetical case | Normally lowercase openings, with grammatical/name and sentence-ending-punctuation exceptions. | Confirmed conflict with Genius's capital-initial ad-lib convention; grammar remains a precondition. |
| `MX-ES08` · FAQ, acronyms/laughter | Acronyms use uppercase without separating dots/spaces; laughter units use commas. | Do not infer acronym or laughter role from arbitrary letters. |
| `MX-ES09` · FAQ, numbers | Context can justify words above ten; the source illustrates a large quantity without a complete exception predicate. | The generic >10 conversion is not unconditional. Review fixed/contextual expressions and large values. |
| `MX-ES10` · FAQ, names/case | Preserve artist/band spelling/case; detailed grammar distinguishes names, religion, geography, celestial objects, titles, dates and ordinary nouns. Mentioned artist, song and album names may be quoted. | No generic proper-name normalization. Direct speech is not the only permitted quotation role. The current Genius Spanish dictionary rules cover only a small subset. |
| `MX-ES11` · FAQ, spelling/accents | Contains contextual homophone distinctions and explicit accent conventions, including unaccented `solo` and specified demonstratives/short verb forms. | Record source-specific lexical cases; not a general accent-removal operation. Meaning-dependent pairs remain review. |
| `MX-ES12` · FAQ, line breaks | At most 70 characters per lyric line and ten lines per stanza. | Adds a limit missing from the main plan. Unicode counting unit and stanza/tag relationship are unspecified; review the count definition before enforcement and never auto-split at character 70. |

### French

| ID / locator | Additional MXM evidence | Genius comparison / decision |
| --- | --- | --- |
| `MX-FR01` · Insights, punctuation | Commas follow grammatical lists/appositions/vocatives, not every audible pause; coordination has specific exceptions. | Grammar/audio timing are different inputs; no pause-based comma insertion. |
| `MX-FR02` · Insights, forbidden marks | Exclamation marks, colons and semicolons are prohibited, with an exception for punctuation belonging to a sung song title. | Conflicts with general MXM allowance and Genius's excitement-based exclamation convention. Scope the reviewed French rule and name exception explicitly. |
| `MX-FR03` · Insights, questions | Required question marks have no preceding space, for grammatical questions or clearly questioning delivery. | Specific typography rule, not a blanket import of ordinary French publishing spacing. Delivery still needs judgment. |
| `MX-FR04` · Insights, elision | Mark beginning/end elisions with apostrophes; retain standard spelling for internal elisions. | Do not share an unconstrained Genius/English apostrophe inserter. |
| `MX-FR05` · Insights, imperatives/verlan | Join imperatives and pronouns with hyphens; verlan retains underlying spelling and hyphenates rearranged syllables. | Needs grammatical/lexical interpretation; no arbitrary syllable splitting. |
| `MX-FR06` · Insights, times | The prose spells sub-ten or “precise” times, but its examples also use numeric times with minutes. Exactly ten is not specified. | Internally ambiguous source: retain wording and block automatic boundary decisions until clarified. |
| `MX-FR07` · FAQ, elision/decades | `y a` has no apostrophe; French decade expressions and embedded English decade expressions have different constructions. | Explicit language scope, including mixed-language spans; no global decade-apostrophe rewrite. |
| `MX-FR08` · FAQ, numbers | Above-ten quantities normally use digits, but fixed expressions stay in words. | Numeric interpretation must exclude fixed expressions; no blanket >10 conversion. |
| `MX-FR09` · FAQ, backing vocals | Avoid disruptive midphrase backing/echo placement; significant backing material can appear at line end or separately. | Does not provide a reliable text-only echo-deletion predicate. Preserve until role/placement is established. |

### Japanese

| ID / locator | Additional MXM evidence | Genius comparison / decision |
| --- | --- | --- |
| `MX-JA01` · Insights script sections; FAQ 3–5 | Use original Japanese script even when release metadata is romanized; do not add furigana/readings, including unusual readings. Artist-selected kanji matter; use Japanese glyph forms rather than Chinese variants. | Header-English policy on Genius is unrelated. Distinguish pronunciation glosses from actual backing vocals before any removal; no global Han-character normalization. |
| `MX-JA02` · Insights structure; FAQ 6 | Structure belongs in tagging. Explicit A-melody/pre-chorus/chorus labels have stated mappings; B-melody, solo and C-melody labels each allow more than one target. Intro/outro refer to sung sections, not pure instrumental edges. | Some explicit source labels support mapping; ambiguous labels require choice. Preserve source labels and musical identity. |
| `MX-JA03` · FAQ 1, 9 | Halfwidth spacing/commas can aid phrasing and readability; line breaks follow meaning and singability. | No automatic spacing at every script boundary or split at a fixed character count. |
| `MX-JA04` · FAQ 2, 11, 13 | Vocalization spelling and Katakana/Latin choice depend on pronunciation, ordinary usage and official lyrics; repeated vocables can use hyphens/spaces/line breaks by phrasing. | No universal romanization/interjection replacement or separator. |
| `MX-JA05` · FAQ 7 | Separate blocks with blank lines, but says a blank is not needed immediately after `#INSTRUMENTAL`. | Directly conflicts with `MX-S12` requiring that blank. Do not silently select an automatic spacing policy. |
| `MX-JA06` · FAQ 8 | Lists Latin line starts, proper nouns/acronyms and parenthetical beginnings among capitalization cases; rejects arbitrary all-caps/all-lowercase/title-case presentation. | Parenthetical wording differs from main grammatical-only guidance; exact mixed-script/parenthetical scope needs resolution. |
| `MX-JA07` · FAQ 10 | Children's lyric kanji/kana choices depend on intended age. | Audience metadata/human judgment; no universal all-kana conversion. |
| `MX-JA08` · FAQ 12 | Avoid excessive Japanese corner quotes in dialogue; line breaks/halfwidth spaces/parentheses can support long spoken content. | General comma-plus-quotes treatment is not a universal Japanese conversion. |
| `MX-JA09` · FAQ 14 | Use fullwidth question/exclamation marks after fullwidth preceding characters, ASCII forms after halfwidth characters. | Define and review width classification for mixed scripts and punctuation; no NFKC normalization of the whole draft. |
| `MX-JA10` · Insights, translations | Where strict sentence alignment fails, meaning may be redistributed over its existing two or three lines while total line count stays fixed. | Qualifies the main translation instruction. Preserve translation alignment; linguistic translation remains outside the transformer. |

The explicit section correspondences in `MX-JA02` include `Aメロ`→Verse,
`プレコーラス`→Pre-Chorus, and `サビ`→Chorus. `Bメロ`→Verse/Pre-Chorus,
`ソロ`→Bridge/Verse, and `Cメロ`→Verse/Bridge are **alternatives**, not ordered fallback lists.
The article's typical Bridge frequency does not authorize a one-Bridge numerical validation rule.

### Arabic and Korean

The main requirements remain evidence where linguistically applicable, and [MXM-ROM] supports
native-script preservation. No inspected official language article establishes Arabic-specific
numeric morphology, digit-set conversion or dialect normalization, nor Korean-specific number
readings, spacing, elisions or romanization exceptions. The app's interface-language list proves
none of those rules. Keep the first-release requirement for both languages; resolving applicable
policy and morphology coverage remains release work, not a reason to claim generic checks are
complete support.

### Other official workflow evidence

| ID / source | Additional finding | Decision |
| --- | --- | --- |
| `MX-W01` · [Romanization guidance][MXM-ROM] | Native-script lyrics and romanized forms in the Translation surface are distinct. Editing automatic romanizations is restricted to high-rank Curators. The current article gives no usable complete per-language romanization list. | Preserve content kind and script. Do not claim that Arabic/Korean automatic romanization is available from this page title. |
| `MX-W02` · [Studio][MXM-STUDIO], interface | Lyrics, Sync, Tag and Translate are separate tabs; Tag contains structure and performer work. Some contributions can be locked; Credits has a different Pro scope. | Confirms separate metadata workflow, not clipboard/interchange support or access for every user. |
| `MX-W03` · [Translation help][MXM-TRANSLATE] | Translation must be personally authored, not copied or machine-translated, with context and original untranslatable terms preserved. | Document scope; the deterministic format engine does not translate lyrics. |
| `MX-W04` · [API metadata][MXM-METADATA], instrumental flag | Music-only tracks have a track-level instrumental flag. English FAQ also describes marking a whole track instrumental after full listening. | Whole-track status is documented; exact community submission controls/text payload remain unverified. Do not emit interior-marker syntax as the entire track. |
| `MX-W05` · [Bulk submission][MXM-BULK] | Publisher/label partner workflows support CSV/JSONL/DDEX and dedicated synced-lyric delivery; text preserves breaks/paragraphs. The inspected JSONL schema has no structure/performer-range fields. | Official import formats exist, but they do not establish an available ordinary-community import for our retained metadata. |

### Linked community supplements: separate authority

Official links make these relevant reading; they do not erase each document's own qualifications.
Their claims need a deliberate adoption decision before becoming platform-enforced checks.

| ID / source | Standing and meaningful additional claims | Adoption limit |
| --- | --- | --- |
| `MX-C01` · [English Extended Guidelines][MXM-EN-EXT] | Community-built, explicitly nonbinding, dated January 28, 2025. Adds punctuation/name/time exceptions, date-ordinal spelling, regional English, sung letters, melisma and separator advice. | Do not elevate every recommendation to official MXM policy. Date ordinals can conflict with a broad reading of the main numeric-date rule; semantic/audio evidence still matters. |
| `MX-C02` · [Line-break teaching guide][MXM-LINES] | Linked contributor teaching guide; no visible date. Recommends musical/meaningful boundaries and states a 70-character limit. | This is weaker general-language evidence than the official Spanish FAQ's explicit limit. Unicode count and stanza/tag cardinality remain unspecified. |
| `MX-C03` · [German extended guide][MXM-DE-EXT] | Dated July 7, 2026; explicitly says some advice differs from official requirements. Prefers `whoa`, colon before direct speech, standalone hyphen for full censoring, round-number exceptions, sung-`Uhr` time rules, and further punctuation/voice conventions. | `whoa` conflicts with Genius's `woah`; comma→colon conflicts with main MXM. Preserve advisory standing and context. Omission of an apostrophized alternative from its table does not prohibit one allowed by official German Insights. |

The English supplement also explicitly leaves some nonsense-syllable separators without an
official unique form. That is evidence against inventing a universal hyphenation rule.

## 4. Genius-specific facts the MXM page does not settle

| Reviewed Genius fact | MXM evidence limit | Required decision |
| --- | --- | --- |
| [G-NUMBERS] keeps digits in proper names/model numbers, years, phones, certain conventional forms/police slang, qualified K-shortened counts and times. | Main page explicitly names only some corresponding exceptions; language pages add their own scope. | Do not copy the entire Genius exemption list as MXM policy. Preserve names/identifiers until the relevant rule is supported. |
| [G-UNKNOWN] specifies `[?]` for undeciphered words. | Main page is silent; official English FAQ rejects replacement blanks/question-mark tokens (`MX-EN01`). Other languages need their own scope review. | English has an explicit conflict. No invented MXM placeholder, deletion, or fabricated word. |
| [G-YODELING] permits `[Yodeling]`/`[Scatting]` when syllables cannot be confidently transcribed. | Main page has vocalization guidance but no equivalent fallback. | These are uncertain vocal content, not automatically removable non-vocal descriptions. |
| [G-ADLIBS] excludes echo/delay repeats; [G-DASHES] permits omitting artificial stutters. | Main page does not independently settle those production distinctions. | Do not delete/expand suspected echoes or stutters from text patterns. |
| [G-QUOTES] and [G-TYPEWRITER] cover quotation usage and straight marks; [G-SYMBOLS] has name/decorative-symbol exceptions. | Main-page examples do not establish every glyph/name/symbol policy. | Look up language-specific instructions; do not infer a global typography transform. |
| [G-SECTIONS] contains sample, actor/character, consent-dependent AI and virtual-performer naming conventions. | MXM's individual-name and miscellaneous-role rules do not define all equivalences. | Keep original identity/provenance; ask for a specific role/identity where required. |
| [G-SECTION-NUMBERING] numbers distinct verses and uses Part labels for segue-separated songs. | Main page does not define numbering or equivalents for all Genius section kinds. | Retain ordinals and source concepts independently of target tags. |
| [G-ROMANIZED]/[G-TRANSLATIONS] specify separate pages. | MXM uses platform translation/romanization surfaces instead. | Original/translation/romanization status is explicit metadata; mode switching never translates. |

## 5. All eight languages: Genius evidence and matching limits

These Genius sources establish header vocabulary. They do not, by themselves, establish a
complete number grammar, lyric-script policy, or Musixmatch conversion specification.

| Language | Reviewed Genius source | Known mapping risk |
| --- | --- | --- |
| `en` | [G-LANG-EN]; Hook deprecation [G-SECTION-HOOK] | Genius has Refrain, Post-Chorus, Breakdown, Interlude, Part, Skit, Build, Drop and other concepts beyond MXM's described tags. |
| `no` | [G-LANG-NO] | `Refreng` occurs under both Chorus and Refrain in the current pack. First-match lookup is not evidence of an MXM type. |
| `ar` | [G-LANG-AR] | Preserve Arabic source labels; missing Post-Chorus/Interlude equivalents are decisions, not permission to relabel. |
| `de` | [G-LANG-DE] | German `Part` can mean Verse, while `Teil` means Part; `Hook` is internally grouped with Chorus, unlike MXM's explicit distinction. |
| `es` | [G-LANG-ES] | `Coro`/`Estribillo` correspond to Chorus; `Refrán` to Refrain. Do not match across languages by spelling resemblance. |
| `fr` | [G-LANG-FR] | `Refrain` corresponds to Chorus; `Riff` to Refrain. Several instrumental/vocalization concepts lack a proven MXM counterpart. |
| `ja` | [G-LANG-JA] | Genius uses English section headers for Japanese lyrics; that never authorizes romanizing the lyric text. |
| `ko` | [G-LANG-KO] | Original-song headers are English; translations may use Hangul. Current pack accepts both without representing page type, so it cannot infer original vs translation. |

The general [G-LANG-HEADERS] page is an inventory with community standing; the individual
language annotations carry their recorded staff/editorial authority. Preserve that distinction.

## 6. Existing Genius evidence and implementation issues

These were found by comparing the existing catalog, source notes and actual rules. They are
recorded here rather than silently “fixed” as part of a planning task.

| ID | Evidence issue | Consequence before sharing policy |
| --- | --- | --- |
| `E-G01` | `guidance.punctuation.unmarked-question` attributes a blanket terminal comma/period ban to Genius; `docs/rules.md` Policy explicitly says the verified Genius source does not state it. `punctuation-line-ending.ts` treats removal as Apple-derived preview advice. | Reconcile the primary-source interpretation and catalog wording. Do not present the ban as settled Genius/MXM agreement. |
| `E-G02` | `guidance.numbers.digit-exemptions` describes decades as a documented digit form; the decade rule's recorded standing is LyricLint derivation rather than an explicit verified Genius decade policy. | Resolve attribution. MXM explicitly mentioning decades does not retroactively supply Genius evidence. |
| `E-G03` | `numbers-spell-out.ts` recognizes only English ASCII standalone 0–10 and does not exclude `6 o'clock`, despite the reviewed Genius times entry. Some regex exclusions are heuristics, not independently reviewed platform exemptions. | Fix the contextual mismatch in the relevant implementation batch and add source-grounded cases; do not reuse this as a full number converter. |
| `E-G04` | Current terminal-period removal has no MXM acronym exception. | Share a factual predicate only after reviewing its exception behavior; a copied rule would be wrong. |
| `E-G05` | Existing ad-lib detection uses a bounded inventory; censor detection targets mixed letters/stars; header aliases can collapse distinct concepts. | Current tests prove those narrow behaviors, not full conversion coverage. |
| `E-G06` | Blank-line spacing, text hygiene, texting-shorthand expansion, dictionary/academy spelling checks and some numeric punctuation include LyricLint interpretations. | Keep their product/external standing; do not register all current Genius-mode checks as Genius or MXM requirements. |

## 7. Decisions and evidence still required

### Proposed source-resolution policy

Use explicit language scope, source standing and reviewed interpretation together. A named
language exception may narrow a general rule, but a publication date alone never chooses a
winner. Direct conflicts must have a recorded resolution or explicit unresolved behavior before
the operation ships. Neither silently preferring the main page nor silently preferring every
language page is sufficient. Community advice stays advisory unless its adoption is separately
justified and labeled. These are proposed LyricLint governance decisions, not an MXM-published
precedence hierarchy.

| Decision | Evidence | Required outcome / proposed interim behavior |
| --- | --- | --- |
| `D01` · Japanese instrumental spacing | `MX-S12` vs `MX-JA05` | Clarify the source conflict or review a scoped policy decision. Until then preserve authored layout and expose the conflict; do not insert/remove the blank automatically. |
| `D02` · Language-specific direct speech | `MX-F13`, `MX-ES04`, `MX-FR02`, `MX-JA08`, advisory `MX-C03` | Model direct speech by language and type of quotation. Spanish colon is explicit official evidence; French/Japanese cannot inherit a generic comma rule. German supplement has lower standing. |
| `D03` · French times | `MX-F08` vs `MX-FR06` and its internally unclear examples | Resolve exactly ten and the meaning of the “precise” exception before conversion. Preserve text and require review for ambiguous cases. |
| `D04` · Parenthetical case | `MX-F05`, `MX-EN03`, `MX-ES07`, `MX-JA06`, [G-ADLIBS] | Separate ad-lib/backing/reading-gloss roles and language. Review the Japanese wording; no all-language lowercase or capital-initial operation. |
| `D05` · Numeric meaning/exception coverage | `MX-F06`–`08`, `MX-ES09`, `MX-FR08`, community supplements, [G-NUMBERS] | Build per-language/domain cases for quantities, fixed expressions, names, dates/times, identifiers and pronunciation. Exact values alone do not establish their role. No floating-point rounding of identifiers/large integers. |
| `D06` · Layout versus musical tags | `MX-F01`, `MX-ES12`, `MX-S09`, [G-REPEATS] | Determine whether one tagged musical section may contain several formatted stanzas. Keep line breaks/layout independent of confirmed tag identity until known; no automatic ten-line chopping. |
| `D07` · Character counting | `MX-ES12`, advisory `MX-C02` | Establish code points vs graphemes vs UTF-16 and the scope of a 70-character rule. Never turn a teaching guide into an unreviewed all-language limit. |
| `D08` · Whole-track instrumental/joik | `MX-W04`, `MX-NO04`, `MX-S10`–`12`, [G-INSTRUMENTAL] | Keep track-level instrumental status separate from an interior marker/interval. Verify community command and serialization; preserve lyricless-joik ambiguity rather than deleting vocables. |
| `D09` · Unknown and uncertain vocal content | `MX-EN01`, [G-UNKNOWN], [G-YODELING], MXM vocalization clauses | English's prohibition is known; no replacement text can be inferred. Define unresolved-target UI and obtain remaining language/fallback policy evidence. |
| `D10` · Native tag/timing handoff | `MX-W02`, `MX-W05` | Scope first release to local editing/retention and exact text copy unless an actually available native transfer is verified. Do not claim tags/times travel through plain text. |
| `D11` · Performer role/category mapping | `MX-P06`–`10`, [G-SECTIONS] | Keep individual identity, lead/backing/unknown role, band membership and AI/robotic classification separate. Clarify fanchant genre scope. No invented identity or automatic category equivalence. |
| `D12` · Original/translation/romanization | `MX-W01`, `MX-L02`–`04`, `MX-JA10`, `MX-NO03`, [G-LANG-KO] | Add an explicit content-kind fact, including unknown when legacy data does not establish it. Language/script/header text alone cannot determine the applicable rule. |
| `D13` · Arabic and Korean | Missing dedicated sources in inspected collections/search | Obtain/review applicable language evidence and numeric/orthographic cases. Neither English fallback nor generic-only support satisfies the user's complete-release scope. |
| `D14` · Existing Genius contradictions | `E-G01`–`03` | Reconcile evidence/case coverage before those primitives are reused; preserve existing public rule IDs where meanings remain stable. |
| `D15` · Supplemental dictionaries/advice | `MX-EN05`–`06`, `MX-DE02`, `MX-C01`–`03` | Extract relevant table rows with meaning/allowed variants, authority and invented fixtures. Do not treat every listed spelling as an unconditional automatic replacement. |

### Concrete comparison fixtures to author

These are invented cases. Expected behavior is intentionally scoped; an unresolved case is not
an instruction to choose an arbitrary textual output.

| Fixture | Evidence and expected decision |
| --- | --- |
| Confirmed English quantity: `We counted twenty lanterns` | MXM numeric representation can be planned as `We counted 20 lanterns`; an unchanged return restores the authored Genius form. Contrast a proper name containing Twenty, which is not automatically a quantity. |
| Confirmed time: `We left at 8 o'clock` | MXM main rule proposes `eight o'clock`; Genius keeps digits. French time rules cannot inherit this English fixture. |
| `I heard the **** fall` | Genius mask lacks the audible prefix required to choose an MXM cutoff. Preserve and require evidence; never invent letters. |
| Known production note: `*door closes*` | Retain as a Genius-only detail and omit from MXM lyrics. Contrast a performer actually singing those words. |
| Known English backing phrase: `We wandered (Far away)` | Review grammatical case before proposing lowercase; contrast `(I stayed)` and a proper name. Japanese's rule remains separately scoped. |
| Spanish direct speech: `Ella dijo, "Vuelve temprano"` | Once confirmed as actual speech, the Spanish official rule proposes a colon; contrast indirect speech and a quote beginning on the next line. |
| French: `Reviens demain!` | Review under the explicit French exclamation restriction; contrast a punctuation-bearing song title and the general MXM rule. |
| Japanese lyric ending `帰ろう?` | Under reviewed width classification, use the Japanese fullwidth mark; contrast an ASCII-ended embedded phrase. Preserve all other characters. |
| Japanese `#INSTRUMENTAL` followed by one blank line | Main and Japanese sources disagree. Preserve authored spacing until the scoped interpretation is reviewed. |
| Two immediately repeated six-line choruses | Genius one-header grouping has twelve lines; MXM stanza limit requires a layout decision. Do not invent a tag boundary or drop repeats. |
| Genius `[?]` in an English line | MXM English does not accept it as finished transcription. Retain visible uncertainty and a decision; never delete/guess it to make lint clean. |
| Dialectal Norwegian wording | Preserve the sung dialect; a translation-to-Bokmål preference cannot normalize this original transcription. |
| Norwegian `Refreng` / German `Hook` / Japanese `Bメロ` | Preserve the source label and offer only evidenced alternatives; never select the first internal alias as musical truth. |
| Line with combining characters/emoji near 70 characters | The Spanish counting metric needs a reviewed definition; a JS string-length comparison is not established platform policy. |

Every implemented operation additionally needs reversed, excluded, ambiguous, edited-round-trip
and all-applicable-language cases. Existing safe-fix labels are not evidence that these operations
are already implemented or justified on switching.

### What is complete, and what is not

Completed here: source research for the supplied page, all its contribution areas, discovered
official language articles for six release languages, relevant romanization/workflow sources,
linked supplement standing, Genius comparisons, and explicit conflict/missing-evidence records.

Still required before production policy is complete: reviewed resolutions, Arabic/Korean source
coverage, lexical-table extraction, precise numeric/Unicode context rules, native handoff details
where offered, and independently authored fixtures. No source conflict is concealed as an
implementation detail or a silently disabled check.

## 8. Provenance and source links

Main source: [Musixmatch Lyrics Guidelines][MXM-MAIN], retrieved September 16, 2026.
HTML SHA-256: `d40e95310953b4eb5f91c8093d65862e53e4cb86d29a09ba9ed3d6a2983b0def`.
The same HTML fingerprint was obtained on September 15. This is a retrieval fingerprint, not
a publication date or evidence of human approval. Full source HTML/lyrics are not copied into
the repository; this document stores our paraphrases, locators and evidence references.

Genius comparison baseline: repository commit
`3ce663628340637ed674517add3fe7343b81468e`; use each existing source record's own verification
date/authority rather than relabeling all of them September 16. The planning source keys below
resolve to those exact primary pages, while the local reviewed interpretation remains in
`guidance/entries.ts` and `docs/rules.md`.
The [source manifest](platform-guidelines-sources.json) records the other fetched payloads.
Help Center HTML can include dynamic page data, so a changed payload hash triggers a content
comparison; it does not by itself prove that the guideline changed.

[MXM-MAIN]: https://community.musixmatch.com/guidelines?lng=en
[MXM-EN-I]: https://support.musixmatch.com/en/articles/216161-english-insights
[MXM-EN-Q]: https://support.musixmatch.com/en/articles/215653-english-faq
[MXM-NO-I]: https://support.musixmatch.com/en/articles/219259-norwegian-insights
[MXM-DE-I]: https://support.musixmatch.com/en/articles/219239-german-insights
[MXM-ES-I]: https://support.musixmatch.com/en/articles/218397-spanish-insights
[MXM-ES-Q]: https://support.musixmatch.com/en/articles/215661-spanish-faq
[MXM-FR-I]: https://support.musixmatch.com/en/articles/218850-french-insights
[MXM-FR-Q]: https://support.musixmatch.com/en/articles/215665-french-faq
[MXM-JA-I]: https://support.musixmatch.com/en/articles/219237-japanese-insights
[MXM-JA-Q]: https://support.musixmatch.com/en/articles/215671-japanese-faq
[MXM-ROM]: https://support.musixmatch.com/en/articles/215401-romanization-and-supported-languages
[MXM-STUDIO]: https://support.musixmatch.com/en/articles/219731-the-studio-for-starters
[MXM-TRANSLATE]: https://support.musixmatch.com/en/articles/220242-take-your-favorite-lyrics-worldwide-how-to-translate
[MXM-INSIGHTS]: https://support.musixmatch.com/en/collections/571786-writing-guidelines-insights-per-language
[MXM-FAQ]: https://support.musixmatch.com/en/collections/571709-writing-guidelines-faq-per-language
[MXM-ROM-INSIGHTS]: https://support.musixmatch.com/en/collections/576646-romanization-insights-per-language
[MXM-METADATA]: https://docs.musixmatch.com/musixmatch-metadata
[MXM-BULK]: https://docs.musixmatch.com/enterprises/lyrics-bulk-submission
[MXM-EN-EXT]: https://docs.google.com/document/d/1njyoifp2cyG-IQu0495eX1Mo0Hp2qy-vl4IeHX0DSCw/preview
[MXM-LINES]: https://docs.google.com/document/d/1ikqb3f--GK_yFGifnEhQ1Crnpntn2V0wJxj5el2vqiE/preview
[MXM-DE-EXT]: https://docs.google.com/document/d/1T-rAxki41XiVLjIijV0jvzSxsyXZnf1snmEObj7229M/preview
[G-ADD-SONGS]: https://genius.com/Genius-how-to-add-songs-to-genius-annotated
[G-SECTIONS]: https://genius.com/9250687
[G-SECTION-HOOK]: https://genius.com/34151858
[G-SECTION-NUMBERING]: https://genius.com/16107272
[G-NUMBERS]: https://genius.com/15591905
[G-CAPS]: https://genius.com/15545679
[G-QE-MARKS]: https://genius.com/15593987
[G-TYPEWRITER]: https://genius.com/11293005
[G-QUOTES]: https://genius.com/15594059
[G-SYMBOLS]: https://genius.com/30242624
[G-DASHES]: https://genius.com/15594027
[G-ADLIBS]: https://genius.com/9257397
[G-REPEATS]: https://genius.com/9290098
[G-LINES]: https://genius.com/9257393
[G-SFX]: https://genius.com/14949930
[G-CENSORED]: https://genius.com/15237597
[G-UNKNOWN]: https://genius.com/9303373
[G-SPELLING]: https://genius.com/9298624
[G-YODELING]: https://genius.com/16912129
[G-INSTRUMENTAL]: https://genius.com/16427849
[G-NON-ENGLISH]: https://genius.com/11893156
[G-ROMANIZED]: https://genius.com/14835335
[G-TRANSLATIONS]: https://genius.com/14949891
[G-STREAMING]: https://genius.com/14949792
[G-LANG-HEADERS]: https://genius.com/Genius-song-headers-in-different-languages-annotated
[G-LANG-EN]: https://genius.com/12744609
[G-LANG-NO]: https://genius.com/13453292
[G-LANG-AR]: https://genius.com/12745769
[G-LANG-DE]: https://genius.com/12745292
[G-LANG-ES]: https://genius.com/12744618
[G-LANG-FR]: https://genius.com/12745216
[G-LANG-JA]: https://genius.com/13322994
[G-LANG-KO]: https://genius.com/20378931
