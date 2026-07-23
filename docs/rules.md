# Genius guideline source and rule catalog

## Policy

LyricLint does not claim that a rule is authoritative merely because it appears on a Genius page.

A production lint rule requires:

- An exact Genius URL or annotation ID.
- A locally stored source title and rule paraphrase.
- A last-verified date.
- Human review of the interpretation.
- Tests covering valid, invalid, and ambiguous examples.

Community annotations can change. Rule data is versioned, reviewed, and bundled with the application. Live scraping is not part of the editing path.

## Source registry

### Reviewed sources

| ID | Source | Scope | Status |
| --- | --- | --- | --- |
| `G-ADD-SONGS` | [How to Add Songs to Genius](https://genius.com/Genius-how-to-add-songs-to-genius-annotated) | Index of lyric accuracy and formatting guidance | Reviewed as an index on 2026-07-24 |
| `G-SPELLING` | [Use standardized spellings, annotation 9298624](https://genius.com/9298624) | Preferred spellings and contextual exceptions | Accepted annotation, reviewed 2026-07-24 |
| `G-SECTIONS` | [Use song part headers, annotation 9250687](https://genius.com/9250687) | Headers, performer names, four formatting slots, joint performers | Accepted annotation, reviewed 2026-07-24 |
| `G-LANG-HEADERS` | [Song Headers in Different Languages](https://genius.com/Genius-song-headers-in-different-languages-annotated) | Language-specific header annotations | Page and inventory reviewed 2026-07-24; individual languages require separate review |
| `G-LANG-PURPOSE` | [Multilingual guide purpose, annotation 12709276](https://genius.com/12709276) | Purpose and use of localized header guidance | Reviewed 2026-07-24 |
| `G-LANG-EN` | [English headers, annotation 12744609](https://genius.com/12744609) | Standard English header vocabulary | Reviewed 2026-07-24 |
| `G-LANG-NO` | [Norwegian headers, annotation 13453292](https://genius.com/13453292) | Norwegian header vocabulary | Reviewed 2026-07-24 |
| `G-NUMBERS` | [Number spelling, annotation 15591905](https://genius.com/15591905) | Spell out numbers with documented exceptions | Reviewed 2026-07-24 |
| `G-QE-MARKS` | [Question and exclamation marks, annotation 15593987](https://genius.com/15593987) | Punctuation for questions and exclamations | Reviewed 2026-07-24 |
| `G-DASHES` | [Hyphens and em dashes, annotation 15594027](https://genius.com/15594027) | Dropped words and em dash punctuation | Reviewed 2026-07-24 |
| `G-CAPS` | [Conventional capitalization, annotation 15545679](https://genius.com/15545679) | Capitalize lyric-line starts with contextual exceptions | Reviewed 2026-07-24 |
| `G-UNKNOWN` | [Unknown lyric marker, annotation 9303373](https://genius.com/9303373) | Use `[?]` for an incomprehensible lyric | Reviewed 2026-07-24 |
| `G-CONTRACTIONS` | [Contraction apostrophes, annotation 9290803](https://genius.com/9290803) | Apostrophes in contractions | Reviewed 2026-07-24 |
| `G-TYPEWRITER` | [Typewriter quotes, annotation 11293005](https://genius.com/11293005) | Straight apostrophes and quotation marks | Reviewed 2026-07-24 |
| `G-ADLIBS` | [Ad-libs, annotation 9257397](https://genius.com/9257397) | Parentheses and initial capitalization for ad-libs | Reviewed 2026-07-24 |
| `G-REPEATS` | [Repeated sections, annotation 9290098](https://genius.com/9290098) | Type repeated lyrics instead of placeholders | Reviewed 2026-07-24 |
| `G-LINES` | [Individual lyric lines, annotation 9257393](https://genius.com/9257393) | Split prose-like lyric transcription into lines | Reviewed 2026-07-24 |
| `G-SFX` | [Sound effects, annotation 14949930](https://genius.com/14949930) | Surround sound effects with asterisks, not braces | Reviewed 2026-07-24 |
| `G-CENSORED` | [Censored words, annotation 15237597](https://genius.com/15237597) | Use four asterisks for a censored word | Reviewed 2026-07-24 |

The reviewed Genius annotation for performer formatting is accepted but not marked verified by Genius. LyricLint should describe it as a Genius community guideline source.

### Located sources awaiting body review

| ID | URL | Candidate scope |
| --- | --- | --- |
| `G-QUOTES` | [Annotation 15594059](https://genius.com/15594059) | Quotation marks |
| `G-SYMBOLS` | [Annotation 30242624](https://genius.com/30242624) | Symbols and special characters |
| `G-AS-SPOKEN` | [Annotation 12332255](https://genius.com/12332255) | Transcribe what the artist says |
| `G-NON-ENGLISH` | [Annotation 11893156](https://genius.com/11893156) | Non-English song header |
| `G-INSTRUMENTAL` | [Annotation 16427849](https://genius.com/16427849) | Instrumental songs |

Rules depending only on sources in this table remain disabled until their annotation bodies are reviewed.

## MVP rule catalog

| Rule ID | Default severity | Detection | Fixability | Source |
| --- | --- | --- | --- | --- |
| `syntax.unbalanced-brackets` | Error | Uneven square brackets in section markup | Safe when the missing delimiter is unambiguous | `G-SECTIONS` plus parser contract |
| `syntax.unsupported-voice-markup` | Error | Performer differentiation uses tags other than supported `<i>` and `<b>` combinations | Preview only | `G-SECTIONS` |
| `section.header-missing` | Warning | A blank-line section contains lyrics but no section header | Insert chosen localized header | `G-SECTIONS` |
| `section.header-language` | Warning | A recognized header conflicts with the selected lyric-language catalog | Replace after user confirmation | `G-SECTIONS`, reviewed language source |
| `performer.header-required` | Warning | A multi-vocalist section has inline differentiation but no performer legend | Preview header insertion | `G-SECTIONS` |
| `performer.style-order` | Warning | Header voice groups do not use plain, italic, bold, bold-italic slot order | Preview only | `G-SECTIONS` |
| `performer.inline-mismatch` | Warning | Inline style refers to no resolvable header voice group | No automatic fix | `G-SECTIONS` |
| `performer.too-many-groups` | Warning | More than four distinct style groups occur, exceeding the documented four-slot format | Explain the source's context and options only | `G-SECTIONS` |
| `performer.line-label-forbidden` | Warning | Names or symbols in brackets are used to label individual lyric lines | No automatic fix | `G-SECTIONS` |
| `spelling.standardized` | Suggestion | A reviewed non-preferred spelling occurs in a context where the preferred spelling is sufficiently certain | Safe only for context-free entries | `G-SPELLING` |
| `spelling.language-variant` | Manual review | British and American variants appear inconsistent with chosen performer language | No automatic fix | `G-SPELLING` |
| `quotes.typewriter` | Warning | Curly apostrophes or quotation marks occur in lyric text | Safe character replacement outside unsupported markup | `G-TYPEWRITER` |
| `contraction.apostrophe` | Warning | A likely contraction is missing its apostrophe | Contextual fix preview | `G-CONTRACTIONS` |
| `unknown.marker` | Warning | An unknown lyric uses `(?)` or another recognized nonstandard marker instead of `[?]` | Safe only for exact known markers | `G-UNKNOWN` |
| `repeat.placeholder` | Warning | Text such as `[Chorus x2]` or `repeat chorus` substitutes for repeated lyrics | Explain only | `G-REPEATS` |
| `sound-effect.asterisks` | Warning | A likely sound effect uses braces or an unsupported wrapper | Preview replacement | `G-SFX` |
| `censored.mask` | Warning | A censored word uses a mask other than exactly four asterisks | Preview replacement | `G-CENSORED` |
| `adlib.parentheses` | Suggestion | A likely ad-lib lacks parentheses or starts lowercase | Contextual fix preview | `G-ADLIBS` |
| `capitalization.line-start` | Suggestion | A lyric line starts lowercase without a known contextual reason | Contextual fix preview | `G-CAPS` |
| `punctuation.question` | Suggestion | A clearly interrogative line has no question mark | Explain or preview | `G-QE-MARKS` |
| `punctuation.dropped-word-dash` | Warning | A dropped word uses an incorrect dash form or an em dash followed by a comma | Preview replacement | `G-DASHES` |
| `line.prose-density` | Suggestion | A very long prose-like line may contain several lyric lines | Explain only; no fixed character limit | `G-LINES` |
| `numbers.spell-out` | Suggestion | A numeric form conflicts with a reviewed case and no documented exception applies | Contextual fix preview | `G-NUMBERS` |

`syntax.unbalanced-brackets` is partly a product-safety rule. The source establishes the bracketed header form, while the parser establishes syntactic validity. Its explanation must not imply that Genius explicitly documents every malformed bracket case.

## Standardized spelling data

The spelling source is not a global search-and-replace table. Contextual exceptions must be modeled explicitly.

| Preferred | Non-preferred or alternate | Context |
| --- | --- | --- |
| `I'ma` | `I'mma`, `Ima`, `Imma` | General |
| `'cause` | `cause`, `cos`, `cuz` | `cuz` is allowed for cousin |
| `okay` | `ok`, `O.K.` | General |
| `'til` | `til` | American English; British English uses `till` |
| `tryna` | `trynna` | General |
| `ayy` | `aye`, `ay` | General |
| `ho` | `hoe` | `hoe` remains valid for the tool |
| `though` | `tho` | General |
| `ya` | `yah` | `ya` means you/your; `yah` means yeah/yes |
| `y'all` | `ya’ll` | Typewriter apostrophe |
| `skrrt` | `skrt` | General |
| `Perc'`, `Perky` | `Perk`, `Percy` | Only when referring to Percocet |
| `bougie` | `boujee`, `boujie` | General |
| `shawty`, `shorty` | None | Follow pronunciation |
| `lil'` | `lil`, `li'l` | General |
| `woah` | `whoa` | General |
| `dog` | `dawg` | General |
| `chopper` | `choppa` | General |
| `oughta` | `oughtta` | General |
| `naive` | `naïve` | Genius preference |
| `cliché` | `cliche` | Genius preference |
| `alright`, `all right` | None | Both accepted |
| `a.k.a.`, `a.k.a.s` | `AKA`, `AKAs`, `A.K.A`, `A.K.A.s` | Use `A.K.A.` at line start |
| `GOAT`, `GOATs` | Dotted variants | General |
| `VIP`, `VIPs` | Dotted variants | General |
| `ASAP` | `A.S.A.P.` | Use `A$AP` for A$AP names |
| `cream` | `CREAM`, `C.R.E.A.M.` | Money; use `C.R.E.A.M.` for the Wu-Tang Clan song |
| `HAM` | `H.A.M.` | General |

Context-free replacements still require word boundaries, case handling, and tests around punctuation and literal HTML.

## Language header data

The multilingual source currently contains more than sixty annotated languages. Each language annotation is its own review unit.

Initial reviewed subset:

| Semantic part | English | Norwegian |
| --- | --- | --- |
| Intro | Intro | Intro |
| Verse | Verse | Vers |
| Chorus | Chorus | Chorus or Refreng |
| Refrain | Refrain | Refreng |
| Pre-Chorus | Pre-Chorus | Pre-Chorus |
| Post-Chorus | Post-Chorus | Post-Chorus |
| Bridge | Bridge | Bro |
| Interlude | Interlude | Mellomspill |
| Instrumental | Instrumental | Instrumental |
| Outro | Outro | Outro |

Do not assume every language translates every header. Some Genius language annotations explicitly prefer English headers or vary by genre. Preserve custom headers and explain recommendations rather than blocking export.

The general performer source uses the phrase "too many vocalists" without a universal number. It explicitly mentions more than four only for multiple vocal samples. LyricLint warns when a fifth group exceeds the four available style slots, but its copy must not misquote that as a universal five-performer Genius ban.

## Candidate rules after source review

These are not enabled until their exact source bodies and product behavior are reviewed:

- Quotation style
- Instrumental-page tag
- Detailed symbols and special characters
- Pronunciation-based transcription
- Non-English title-header requirements
- Translations and romanizations on separate pages

## Rule review checklist

Before enabling a rule:

1. Fetch or open the exact source.
2. Record the annotation ID and canonical URL.
3. Store a short paraphrase rather than a large copied passage.
4. Record retrieval date and content hash.
5. Identify exceptions and required context.
6. Decide whether the rule is mechanical, contextual, consistency-only, or manual review.
7. Add at least one valid, invalid, and ambiguous fixture.
8. Review every proposed automatic fix for text loss.
9. Confirm the diagnostic renders an accessible source link.
10. Increment the rule or rule-set version.
