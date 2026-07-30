import { describe, expect, test } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import {
	buildRuleContext,
	computeDiagnostics,
	filterForEditorState
} from '$lib/ui/state/wiring.js';
import type { Diagnostic, EditorSnapshot } from '$lib/core/types.js';
import { currentRuleSet } from './index.js';

/**
 * What a transcriber sees while typing, measured rather than reasoned about.
 *
 * A rule runs against a whole parsed document on every keystroke, so a document
 * mid-composition is linted as if it were finished — and the cards that produces
 * are not merely early, they are wrong, and they retract themselves. This file
 * types a verse a character at a time and counts the ones that appear only to
 * vanish again.
 *
 * The lyric is invented for this test. It is written to walk through the shapes
 * that used to misfire: an unclosed header, a word that passes through a fuzzy
 * spelling target (`thought` through `thoug`), a question line, and a song that
 * has one verse until the second one is typed.
 */
const script = [
	'[Verse 1]',
	'i thought the long way home was okay',
	'Don’t look back, it’s late',
	'and the 3 streetlights blinked out',
	'Where are you going, my love?',
	'',
	'[Chorus]',
	'Hold on tight (yeah)',
	'Hold on tight'
].join('\n');

function keyOf(diagnostic: Diagnostic): string {
	return `${diagnostic.ruleId} :: ${diagnostic.message}`;
}

/** Lint one prefix as the workbench does while it is being typed into. */
function whileTyping(text: string): Set<string> {
	const parsed = parseDocument(text);
	const diagnostics = computeDiagnostics(
		parsed,
		buildRuleContext('en', [], currentRuleSet.version, 1)
	);
	const snapshot = {
		revision: 1,
		text,
		selection: { anchor: text.length, head: text.length },
		parsed,
		diagnostics,
		composing: false,
		canUndo: false,
		canRedo: false
	} satisfies EditorSnapshot;
	return new Set(filterForEditorState(snapshot, diagnostics, [], { settled: false }).map(keyOf));
}

/** The same document once the user has stopped and the caret has left. */
function settled(text: string): Set<string> {
	const parsed = parseDocument(text);
	const diagnostics = computeDiagnostics(
		parsed,
		buildRuleContext('en', [], currentRuleSet.version, 1)
	);
	const snapshot = {
		revision: 1,
		text,
		selection: { anchor: 0, head: 0 },
		parsed,
		diagnostics,
		composing: false,
		canUndo: false,
		canRedo: false
	} satisfies EditorSnapshot;
	return new Set(filterForEditorState(snapshot, diagnostics, [], { settled: true }).map(keyOf));
}

describe('typing churn', () => {
	// The number is a ceiling on noise, not a target. It was 16 doomed episodes
	// over this verse before `settlesOn` existed — `[` alone accounted for eight
	// keystrokes of `syntax.unbalanced-brackets` plus a fresh
	// `section.header-unrecognized` card per letter of the word "Verse".
	test('a card that appears while typing is one that survives', () => {
		const episodes = new Map<string, [number, number][]>();
		for (let index = 1; index <= script.length; index += 1) {
			for (const key of whileTyping(script.slice(0, index))) {
				const list = episodes.get(key) ?? [];
				const last = list.at(-1);
				if (last && last[1] === index - 1) last[1] = index;
				else list.push([index, index]);
				episodes.set(key, list);
			}
		}

		const final = settled(script);
		const doomed = [...episodes].flatMap(([key, list]) =>
			list
				.filter(([, end]) => !(final.has(key) && end === script.length))
				.map(([start, end]) => `${end - start + 1}ks ${key}`)
		);

		expect(doomed).toEqual([]);
	});

	test('a header being typed is not a broken header', () => {
		// The first keystroke of every session used to report two findings, and
		// letters two through five each replaced the card with a new one naming the
		// prefix so far: “V”, “Ve”, “Ver”.
		for (const prefix of ['[', '[V', '[Ve', '[Ver', '[Vers', '[Verse', '[Verse 1']) {
			expect([prefix, [...whileTyping(prefix)]]).toEqual([prefix, []]);
		}
		// Closed and left alone, it is a header like any other.
		expect([...settled('[Verse 1]\nA lyric line here')]).toContain(
			'section.verse-numbering :: Do not number a song with only one distinct verse.'
		);
	});

	test('a word is not corrected while it is still being typed', () => {
		// Each of these passes through a reviewed spelling target on the way to a
		// perfectly ordinary word. `fuzzy` matching makes it worse: `thoug` is one
		// edit from `though`, so the card offered to correct a word nobody typed.
		for (const word of ['thought', 'wonton', 'important', 'imagine', 'ursula', 'okay']) {
			for (let index = 1; index <= word.length; index += 1) {
				const text = `[Verse]\nThe ${word.slice(0, index)}`;
				expect([text, [...whileTyping(text)]]).toEqual([text, []]);
			}
		}
	});

	test('the shape of the song waits for the typing to stop', () => {
		const onlyVerseOne = '[Verse 1]\nA plain lyric line here';
		expect([...whileTyping(onlyVerseOne)]).toEqual([]);
		expect([...settled(onlyVerseOne)]).toContain(
			'section.verse-numbering :: Do not number a song with only one distinct verse.'
		);
		// And it is gone for good once the second verse exists, which is what the
		// transcriber was on their way to typing.
		expect([...settled(`${onlyVerseOne}\n\n[Verse 2]\nAnother plain lyric line`)]).toEqual([]);
	});

	// The point of the tier is that deferral is selective, and a `character`
	// finding is one whose *message* is settled too — not merely its existence.
	// `quotes.typewriter` fails that second half and is deliberately not in this
	// tier: `isApostrophe` reads the character after the mark, so `Don’` says
	// "closing curly single quote" and `Don’t` says "curly apostrophe" one
	// keystroke later. The script above types both through, so the main churn test
	// is what pins it.
	test('a character-tier finding draws under the caret', () => {
		const stray = '[Verse]\nHold on\u200b tight';
		expect([...whileTyping(stray)]).toContain(
			'text.invisible-characters :: This is a zero-width space, not the character it looks like.'
		);
	});

	// A caret is not a hand. Two real findings went undrawn while this tier waited
	// on caret position alone: the landing page's demo seeds a collapsed caret at
	// offset 0 and never moves it, and a transcriber who types the last line of a
	// song and stops leaves the caret there for good — which hid that line from
	// the panel and from the `Fix N automatically` batch, which plans over what is
	// visible.
	test('a caret at rest is not a line being written', () => {
		const text = '[Verse 1]\ni thought about it';
		const parsed = parseDocument(text);
		const diagnostics = computeDiagnostics(
			parsed,
			buildRuleContext('en', [], currentRuleSet.version, 1)
		);
		const atEnd = {
			revision: 1,
			text,
			selection: { anchor: text.length, head: text.length },
			parsed,
			diagnostics,
			composing: false,
			canUndo: false,
			canRedo: false
		} satisfies EditorSnapshot;
		const pronoun =
			'grammar.english-pronoun-i :: The English first-person pronoun “I” should be capitalized.';

		expect(
			filterForEditorState(atEnd, diagnostics, [], { settled: false }).map(keyOf)
		).not.toContain(pronoun);
		expect(filterForEditorState(atEnd, diagnostics, [], { settled: true }).map(keyOf)).toContain(
			pronoun
		);
	});

	// Whereas trailing whitespace is the `caret` tier and waits on the caret
	// alone: the transcription loop is listen, pause, type, so a pause in the
	// middle of a line is the commonest thing that happens here. Being told about
	// the space you are standing in is the churn wearing a different hat.
	test('a pause mid-line is not a finished line', () => {
		const text = '[Verse 1]\nHold on ';
		const parsed = parseDocument(text);
		const diagnostics = computeDiagnostics(
			parsed,
			buildRuleContext('en', [], currentRuleSet.version, 1)
		);
		const trailing = 'text.invisible-characters :: This line ends with invisible whitespace.';
		const at = (offset: number, settled: boolean) =>
			filterForEditorState(
				{
					revision: 1,
					text,
					selection: { anchor: offset, head: offset },
					parsed,
					diagnostics,
					composing: false,
					canUndo: false,
					canRedo: false
				} satisfies EditorSnapshot,
				diagnostics,
				[],
				{ settled }
			).map(keyOf);

		expect(at(text.length, false)).not.toContain(trailing);
		expect(at(text.length, true)).not.toContain(trailing);
		// Off the line, it is an ordinary finding again.
		expect(at(0, true)).toContain(trailing);
	});
});
