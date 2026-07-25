# Genius guideline source and rule catalog

## Policy

LyricLint does not claim that a rule is authoritative merely because it appears on a Genius page.

A production lint rule requires:

- An exact policy-source URL. Any behavior described as a Genius rule requires an exact Genius
  URL or annotation ID.
- A locally stored source title and rule paraphrase.
- A last-verified date.
- Human review of the interpretation.
- Tests covering valid, invalid, and ambiguous examples.

Community annotations can change. Rule data is versioned, reviewed, and bundled with the application. Live scraping is not part of the editing path.

The content-language mismatch check is a product-safety diagnostic rather than
a Genius policy claim. It uses a bundled statistical detector, runs locally,
and links to the detector implementation as tooling provenance.

The line-ending comma/period check is cross-platform guidance, not a direct Genius policy
claim. Apple Music for Artists explicitly disallows both marks at the end of a lyric line.
Genius's current verified guide does not state that blanket ban; its punctuation annotation
instead requires question marks for questions and reserves exclamation marks for excitement.
LyricLint records both sources and keeps removal preview-only.

The blank-line-before-header check is a LyricLint readability suggestion, not a direct Genius
policy claim. The reviewed Genius source establishes that headers sit above distinct song parts
but does not explicitly require an empty line before each header.

## Source registry

### Reviewed sources

| ID | Source | Scope | Status |
| --- | --- | --- | --- |
| `T-LANGUAGE-DETECT` | [LanguageDetect](https://github.com/FGRibreau/node-language-detect) | Local statistical language recognition | Version 2.0.0 reviewed 2026-07-24 |
| `L-EN-COMMON` | [Merriam-Webster: Commonly Misspelled Words](https://www.merriam-webster.com/grammar/commonly-misspelled-words) | Frequent English misspellings including `definately` and `tommorrow` | Reviewed 2026-07-25 |
| `L-EN-MORE` | [Merriam-Webster: More Commonly Misspelled Words](https://www.merriam-webster.com/grammar/more-commonly-misspelled-words/_not-seperate-seprate-seperet_) | Frequent English misspellings including `seperate` and `acheive` | Reviewed 2026-07-25 |
| `L-EN-TOP50` | [Cambridge: Top 50 spelling mistakes in English](https://dictionary.cambridge.org/grammar/british-grammar/spelling-top-50-spelling-mistakes-in-english) | High-frequency mistakes including `definately`, `freind`, `untill`, and `recieve` | Reviewed 2026-07-25 |
| `L-NO-COMMON` | [Språkrådet: Ord som mange lurer på](https://sprakradet.no/arkiv/ord-som-mange-lurer-pa/) | Frequently searched Bokmål spellings | Reviewed 2026-07-25 |
| `L-DE-COMMON` | [Duden: Häufige Fehler und Falschschreibweisen](https://www.duden.de/haeufige_fehler) | Common German misspellings | Reviewed 2026-07-25 |
| `L-ES-CONTRACTIONS` | [RAE: Ortografía](https://www.rae.es/diccionario-estudiante/docs/ortografia.pdf) | Spanish `al`/`del` contractions and proper-name exceptions | Reviewed 2026-07-25 |
| `L-ES-COMMON` | [RAE: La tecnología al servicio de la palabra](https://www.rae.es/sites/default/files/la_tecnologia_al_servicio_de_la_palabra.pdf) | Frequent word-division errors such as `sinembargo` and `porfavor` | Reviewed 2026-07-25 |
| `L-FR-COMMON` | [Dictionnaire de l’Académie française: ça](https://www.dictionnaire-academie.fr/article/A9C0002) | Demonstrative `ça` in common phrases | Reviewed 2026-07-25 |
| `L-FR-LEXICAL` | [Projet Voltaire: Questions d’orthographe lexicales](https://www.projet-voltaire.fr/regles-orthographe/categories/lexical/page/5/) | Frequent lexical errors including `acceuil` and `parmis` | Reviewed 2026-07-25 |
| `L-FR-DOUBLES` | [OQLF: Les erreurs fréquentes liées aux consonnes doubles](https://vitrinelinguistique.oqlf.gouv.qc.ca/24465/lorthographe/problemes-lies-aux-consonnes/les-erreurs-frequentes-liees-aux-consonnes-doubles) | Frequent single- and double-consonant spelling errors | Reviewed 2026-07-25 |
| `L-AR-COMMON` | [مجمع الملك سلمان: لغة الطفل العربي (٢)](https://library.ksaa.gov.sa/links/epubs/arabic_child_2.pdf) | Common phonetic Arabic spellings and their standard written forms | Reviewed 2026-07-25 |
| `L-JA-COMMON` | [文化庁: 現代仮名遣い 本文 第2](https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/gendaikana/honbun_dai2.html) | Conventional greetings and `ずつ` spelling | Reviewed 2026-07-25 |
| `L-KO-COMMON` | [국립국어원: 온라인가나다 맞춤법 문답](https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=216&pageIndex=1&qna_seq=317387) | Standard Korean spellings `됐` and `며칠` | Reviewed 2026-07-25 |
| `L-KO-WAENJI` | [국립국어원: ‘웬지’와 ‘왠지’](https://www.korean.go.kr/front/mcfaq/mcfaqView.do?mcfaq_seq=6103&mn_id=62&pageIndex=207) | Standard spelling `왠지` | Reviewed 2026-07-25 |
| `L-KO-ORAENMAN` | [국립국어원: ‘오랜만’과 ‘오랫만’](https://www.korean.go.kr/nkview/news/11/11_3.htm) | Standard spelling `오랜만` | Reviewed 2026-07-25 |
| `L-KO-SEOLLEM` | [국립국어원: 궁금증을 풀어 드립니다](https://www.korean.go.kr/nkview/nknews/200111/40_9.html) | Misused `설레이다` forms in popular songs | Reviewed 2026-07-25 |
| `L-KO-IRIRI` | [국립국어원: ‘일일이’와 ‘일일히’](https://www.korean.go.kr/front/mcfaq/mcfaqView.do?mcfaq_seq=6078&mn_id=62&pageIndex=207) | Standard spelling `일일이` | Reviewed 2026-07-25 |
| `G-ADD-SONGS` | [How to Add Songs to Genius](https://genius.com/Genius-how-to-add-songs-to-genius-annotated) | Index of lyric accuracy and formatting guidance | Reviewed 2026-07-24; reverified 2026-07-25 |
| `G-SPELLING` | [Use standardized spellings, annotation 9298624](https://genius.com/9298624) | Preferred spellings and contextual exceptions | Accepted annotation, reviewed 2026-07-24 |
| `G-SECTIONS` | [Use song part headers, annotation 9250687](https://genius.com/9250687) | Headers, performer names, four formatting slots, joint performers | Accepted annotation, reviewed 2026-07-24 |
| `G-SECTION-NUMBERING` | [Verse numbering, annotation 16107272](https://genius.com/16107272) | Only verses are enumerated; distinct verses ascend | Reviewed 2026-07-24 |
| `G-SECTION-HOOK` | [Deprecated Hook header, annotation 34151858](https://genius.com/34151858) | Replace Hook with Chorus or Refrain | Reviewed 2026-07-24 |
| `G-LANG-HEADERS` | [Song Headers in Different Languages](https://genius.com/Genius-song-headers-in-different-languages-annotated) | Language-specific header annotations | Page and inventory reviewed 2026-07-24; individual languages require separate review |
| `G-LANG-PURPOSE` | [Multilingual guide purpose, annotation 12709276](https://genius.com/12709276) | Purpose and use of localized header guidance | Reviewed 2026-07-24 |
| `G-LANG-EN` | [English headers, annotation 12744609](https://genius.com/12744609) | Standard English header vocabulary | Reviewed 2026-07-24 |
| `G-LANG-NO` | [Norwegian headers, annotation 13453292](https://genius.com/13453292) | Norwegian header vocabulary | Reviewed 2026-07-24 |
| `G-LANG-AR` | [Arabic headers, annotation 12745769](https://genius.com/12745769) | Localized Arabic header vocabulary | Reviewed 2026-07-24 |
| `G-LANG-DE` | [German headers, annotation 12745292](https://genius.com/12745292) | Genre-dependent German alternatives | Reviewed 2026-07-24 |
| `G-LANG-ES` | [Spanish headers, annotation 12744618](https://genius.com/12744618) | Localized Spanish header vocabulary | Reviewed 2026-07-24 |
| `G-LANG-FR` | [French headers, annotation 12745216](https://genius.com/12745216) | Localized French header vocabulary | Reviewed 2026-07-24 |
| `G-LANG-JA` | [Japanese header policy, annotation 13322994](https://genius.com/13322994) | English headers are required on Japanese song pages | Reviewed 2026-07-24 |
| `G-LANG-KO` | [Korean headers, annotation 20378931](https://genius.com/20378931) | English for original songs; Hangul permitted for translations | Reviewed 2026-07-24 |
| `G-NUMBERS` | [Number spelling, annotation 15591905](https://genius.com/15591905) | Spell out numbers with documented exceptions | Reviewed 2026-07-24 |
| `APPLE-LINE-PUNCTUATION` | [Apple Music lyric submission guidelines](https://artists.apple.com/support/1111-lyrics-guidelines) | No periods or commas at the end of lyric lines | Reviewed 2026-07-25 |
| `G-QE-MARKS` | [Question and exclamation marks, annotation 15593987](https://genius.com/15593987) | Punctuation for questions and exclamations | Reviewed 2026-07-24; reverified 2026-07-25 |
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
| `language.selection-mismatch` | Warning | Sufficient lyric text clearly matches a different language than the selected one | Explain only; local statistical estimate | `T-LANGUAGE-DETECT` |
| `section.header-missing` | Warning | A blank-line section contains lyrics but no section header | Insert chosen localized header | `G-SECTIONS` |
| `section.header-spacing` | Suggestion | A section header immediately follows preceding content without a blank line | Safely insert one matching line ending | `G-SECTIONS` as context; LyricLint readability preference |
| `section.header-language` | Warning | A recognized header conflicts with the selected lyric-language catalog | Replace after user confirmation | `G-SECTIONS`, reviewed language source |
| `section.localized-header-preference` | Suggestion | A valid header has a culturally preferred localized equivalent | Safely replace with the localized term | `G-LANG-PURPOSE`, reviewed language source |
| `section.header-unrecognized` | Manual review | A bracketed header is absent from every reviewed header catalog | Explain only; preserve the custom text | `G-SECTIONS`, reviewed language sources |
| `section.deprecated-hook` | Warning | A section uses the deprecated `[Hook]` name | Preview Chorus and Refrain replacements | `G-SECTION-HOOK` |
| `section.immediate-repeat-spacing` | Warning | An exact song part is immediately repeated behind a blank separator or duplicate header | Safely retain both lyric copies under one header with no blank separator | `G-SECTIONS`, `G-REPEATS` |
| `section.verse-numbering` | Suggestion | A non-verse is numbered, a lone verse is numbered, or explicit verse numbers conflict | Preview number removal or correction | `G-SECTION-NUMBERING` |
| `performer.header-required` | Warning | A multi-vocalist section has inline differentiation but no performer legend | Safely remove performer formatting | `G-SECTIONS` |
| `performer.style-order` | Warning | Header voice groups do not use plain, italic, bold, bold-italic slot order | Preview only | `G-SECTIONS` |
| `performer.inline-mismatch` | Warning | Inline style refers to no resolvable header voice group | Choose the section and styled performers | `G-SECTIONS` |
| `performer.parenthetical-boundary` | Warning | A parenthetical belongs entirely to one styled performer but one or both parentheses sit outside that formatting | Safely expand the existing performer formatting over the parentheses | `G-SECTIONS` |
| `performer.redundant-markup` | Suggestion | Adjacent same-performer wrappers use more formatting markers than necessary | Safely merge the adjacent wrappers | `G-SECTIONS` |
| `performer.unused-legend-slot` | Suggestion | A clean section header declares a performer style absent from its lyrics | Safely remove the unused legend slot | `G-SECTIONS` |
| `performer.too-many-groups` | Warning | More than four distinct style groups occur, exceeding the documented four-slot format | Explain the source's context and options only | `G-SECTIONS` |
| `performer.line-label-forbidden` | Warning | Names or symbols in brackets are used to label individual lyric lines | Preview removal of the inline label | `G-SECTIONS` |
| `spelling.standardized` | Suggestion | A reviewed non-preferred spelling occurs in a context where the preferred spelling is sufficiently certain | Safe for context-free entries; selected meaning-sensitive entries use preview | `G-SPELLING` |
| `spelling.language-variant` | Manual review | British and American variants appear inconsistent with chosen performer language | No automatic fix | `G-SPELLING` |
| `quotes.typewriter` | Warning | Curly apostrophes or quotation marks occur in lyric text | Safe character replacement outside unsupported markup | `G-TYPEWRITER` |
| `contraction.apostrophe` | Warning | A likely contraction is missing its apostrophe | Contextual fix preview | `G-CONTRACTIONS` |
| `grammar.english-pronoun-i` | Suggestion | The standalone first-person `i`, including common contractions, is lowercase | Preview capitalization because lowercase styling can be intentional | `G-CAPS` |
| `spelling.english-common` | Suggestion | A frequent misspelling such as `definately`, `tommorrow`, or `freind` occurs | Preview the standard English spelling | Reviewed Merriam-Webster and Cambridge sources |
| `spelling.norwegian-common` | Suggestion | A frequent spelling such as `desverre`, `nyskjerrig`, or `etterhvert` occurs | Preview the standard Bokmål spelling | `L-NO-COMMON` |
| `spelling.german-common` | Suggestion | A frequent spelling such as `garnicht`, `bischen`, or `rythmus` occurs | Preview the standard German spelling | `L-DE-COMMON` |
| `grammar.spanish-contractions` | Suggestion | Lowercase `a el` or `de el` appears where Spanish contracts it | Preview `al` or `del`; capitalized proper names remain untouched | `L-ES-CONTRACTIONS` |
| `spelling.spanish-common` | Suggestion | A frequent word-division error such as `sinembargo`, `alomejor`, or `porfavor` occurs | Preview the standard separated form | `L-ES-COMMON` |
| `spelling.french-common` | Suggestion | A frequent spelling such as `acceuil`, `parmis`, `mourrir`, or phrase-gated `sa va` occurs | Preview the standard French spelling | `L-FR-COMMON`, `L-FR-LEXICAL`, `L-FR-DOUBLES` |
| `spelling.arabic-common` | Suggestion | A reviewed phonetic spelling such as `لاكن`, `هاذا`, or `انشاء الله` occurs | Preview only because dialect spelling can be intentional in lyrics | `L-AR-COMMON` |
| `spelling.japanese-common` | Suggestion | A greeting uses phonetic `わ`, or `づつ` occurs instead of `ずつ` | Preview only because phonetic lyric styling can be intentional | `L-JA-COMMON` |
| `spelling.korean-common` | Suggestion | A frequent spelling such as `됬`, `웬지`, `오랫만`, or `설레임` occurs | Preview the standard Korean spelling | Reviewed National Institute of Korean Language sources |
| `unknown.marker` | Warning | An unknown lyric uses `(?)` or another recognized nonstandard marker instead of `[?]` | Safe only for exact known markers | `G-UNKNOWN` |
| `repeat.placeholder` | Warning | Text such as `[Chorus x2]` or `repeat chorus` substitutes for repeated lyrics | Explain only | `G-REPEATS` |
| `sound-effect.asterisks` | Warning | A likely sound effect uses braces or an unsupported wrapper | Preview replacement | `G-SFX` |
| `censored.mask` | Warning | A censored word uses a mask other than exactly four asterisks | Preview replacement | `G-CENSORED` |
| `adlib.parentheses` | Suggestion | A likely ad-lib lacks parentheses or starts lowercase | Contextual fix preview | `G-ADLIBS` |
| `capitalization.line-start` | Suggestion | A lyric line starts lowercase without a known contextual reason | Contextual fix preview | `G-CAPS` |
| `capitalization.title-case` | Suggestion | Several lyric lines appear to capitalize nearly every word | Explain only because names and intentional styling need review | `G-CAPS` |
| `punctuation.line-ending` | Warning | A lyric line ends in a comma or period, including before a closing quote or parenthesis | Preview removal; ellipses are excluded | `APPLE-LINE-PUNCTUATION`, `G-QE-MARKS` |
| `punctuation.question` | Suggestion | A clearly interrogative line has no question mark | Explain or preview | `G-QE-MARKS` |
| `punctuation.dropped-word-dash` | Warning | A dropped word uses an incorrect dash form or an em dash followed by a comma | Preview replacement | `G-DASHES` |
| `line.prose-density` | Suggestion | A very long prose-like line may contain several lyric lines | Explain only; no fixed character limit | `G-LINES` |
| `numbers.spell-out` | Suggestion | A numeric form conflicts with a reviewed case and no documented exception applies | Contextual fix preview | `G-NUMBERS` |

`syntax.unbalanced-brackets` is partly a product-safety rule. The source establishes the bracketed header form, while the parser establishes syntactic validity. Its explanation must not imply that Genius explicitly documents every malformed bracket case.

The language-specific grammar catalog is intentionally narrower than the language picker. The
first release covers only the eight reviewed language packs (`en`, `no`, `ar`, `de`, `es`, `fr`,
`ja`, and `ko`) and favors mechanical, source-backed forms over broad grammatical guesses.
Context-sensitive pairs such as Norwegian `og`/`å`, German `das`/`dass`, and general Japanese
particle choice remain out of scope until a parser can keep false positives acceptably low.

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

The linter also recognizes a curated set of unambiguous common misspellings of these reviewed
targets. These are stored separately from the source's explicit alternates so provenance stays
clear. Examples include `ey` → `ayy`, `yall` → `y'all`, `whoah` → `woah`, `bougy` → `bougie`,
`naieve` → `naive`, and missing punctuation in unambiguous initialisms such as `V.I.P` → `VIP`.
This is deliberately not an edit-distance spellchecker: nearby real words and intentional lyric
forms such as `hey`, `skirt`, `outta`, `boogie`, `Dogg`, and `shortie` remain untouched.

## Language header data

The multilingual source currently contains more than sixty annotated languages. Each language annotation is its own review unit.

Initial reviewed subset:

| Semantic part | English | Norwegian |
| --- | --- | --- |
| Intro | Intro | Intro |
| Verse | Verse | Vers |
| Chorus | Chorus | Refreng (preferred) or Chorus |
| Refrain | Refrain | Refreng |
| Pre-Chorus | Pre-Chorus | Pre-Chorus |
| Post-Chorus | Post-Chorus | Post-Chorus |
| Bridge | Bridge | Bro |
| Interlude | Interlude | Mellomspill |
| Instrumental | Instrumental | Instrumental |
| Outro | Outro | Outro |

Do not assume every language translates every header. Some Genius language annotations explicitly prefer English headers or vary by genre. Preserve custom headers, send unrecognized names to manual review, and explain recommendations rather than blocking export.

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
