# Product

## Register

product

## Users

LyricLint is primarily for experienced Genius transcribers and editors who spend long sessions preparing or cleaning lyric transcriptions. They need a fast, keyboard-friendly workspace that preserves exact Genius markup, explains every warning, and prevents accidental loss.

Newer transcribers are a secondary audience. The interface should teach through clear diagnostics and source links without slowing expert users with mandatory onboarding.

## Product Purpose

LyricLint is a local-first lyric editor and linter for Genius conventions. Users paste or write a transcription, structure it with language-appropriate section headers, assign performers to selected passages, review sourced guideline warnings, and copy valid Genius markup.

Success means that users can:

- Recover their work after closing or crashing the tab.
- Identify objective formatting problems before submitting lyrics.
- Understand which Genius source supports every emitted warning.
- Apply performer differentiation without hand-writing fragile HTML.
- See who performs each passage without changing the exported markup.
- Continue editing when Genius or the network is unavailable, except where they have opted a draft into YouTube playback.

The initial product is a standalone paste, edit, lint, and copy tool with a transport for the audio being transcribed. That audio is a local file by default, which never leaves the user's disk; a YouTube video is offered as an alternative because that is where most transcribers' audio actually is, and it is opted into per draft. Direct Genius editing, cloud accounts, collaboration, and browser-extension integration are later possibilities.

## Brand Personality

Precise, energetic, trustworthy.

The product should feel like a focused editorial instrument: dense enough for experts, clear enough to learn by using, and confident without pretending that subjective transcription choices are objective errors.

## Anti-references

- Not a visual clone of Genius.
- Not an automated transcription product, and not a chat wrapper around the editor: linting is deterministic, reviewed rules running locally. The one AI surface is the optional rules assistant, which answers questions about the guidelines and offers general proofreading and convention help in its own modal, receives only the text typed into its own composer, and can never see a draft.
- Not a toy text area covered in decorative colors.
- Not a full IDE with irrelevant programming affordances.
- Not a warning-heavy validator that silently rewrites user work.
- Not dependent on live scraping. Not dependent on network availability for the core job either — the exceptions are chosen by the user, each on its own press: attaching audio from YouTube, Spotify, or Apple Music loads that provider's player, and asking the rules assistant a question sends that question (never the draft) to LyricLint's answering service.

## Design Principles

1. **The source stays visible.** Genius-compatible plain text and literal HTML markup remain the canonical document.
2. **Every warning earns trust.** A production rule must include an exact Genius source, a reviewed interpretation, and a last-verified date.
3. **Automation is reversible.** Structural and performer transformations are previewable where needed and always form one undoable edit.
4. **Expert speed, accessible operation.** Common actions are keyboard-first, while all controls and diagnostics remain discoverable and screen-reader reachable.
5. **Local work is durable, and draft linting is local.** Drafts autosave locally and the editor remains useful offline. What reaches a network is asked for and never assumed: online audio playback per session, and the rules assistant per question — which receives only what is typed into its own composer, never the document.
6. **Judgment is labeled as judgment.** Contextual conventions are suggestions or manual-review items, not false errors.

## Accessibility & Inclusion

Target WCAG 2.2 AA for the application shell and custom interactions.

- All editing, performer assignment, section insertion, lint navigation, ignore, restore, and copy actions must be keyboard operable.
- Performer identity must never rely on color alone.
- Diagnostics must be available both inline and in the right panel.
- Focus must remain visible and return predictably after anchored popovers close.
- Respect reduced motion and avoid decorative animation.
- Preserve Unicode, emoji, bidirectional text, combining marks, and IME composition.
- Test representative right-to-left and CJK documents.
- Announce important state changes through restrained live regions without narrating every keystroke.
