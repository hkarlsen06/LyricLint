import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { Diagnostic } from '$lib/core/types.js';
import { performerRecords } from '$lib/rules/rule-test-utils.js';
import { resolveVoiceGroupRanges } from '$lib/ui/state/wiring.js';
import type { EditorDisplayContext } from './contracts.js';
import { createLyricEditor } from './create-editor.js';
import { lintDecorationField } from './extensions/lint-decorations.js';
import { markupDimField } from './extensions/markup-dim.js';
import { performerDecorationField } from './extensions/performer-decorations.js';
import { sectionGhostField } from './extensions/section-ghosts.js';

const text = '[Verse: Avery, <i>Blair</i>]\nA <i>song</i>\n\nChorus\nAnother line';
const cleanups: (() => void)[] = [];

function mount() {
	const host = document.createElement('div');
	document.body.append(host);
	const parsed = parseDocument(text);
	const performers = performerRecords(['Avery', 'Blair']);
	const proseHeader: Diagnostic = {
		ruleId: 'section.header-prose',
		from: text.indexOf('Chorus'),
		to: text.indexOf('Chorus') + 'Chorus'.length,
		severity: 'warning',
		message: 'Use a section header.',
		explanation: 'Bracket the section name.',
		sourceIds: []
	};
	const context: EditorDisplayContext = {
		language: 'en',
		ruleSetVersion: 'context-test',
		parsed,
		performers,
		voiceGroups: resolveVoiceGroupRanges(parsed, performers),
		diagnostics: { revision: 0, items: [proseHeader] }
	};
	const instance = createLyricEditor(host, {
		initialText: text,
		context,
		callbacks: {
			onSnapshot: vi.fn(),
			onAssignRequest: vi.fn(),
			onSectionHeaderRequest: vi.fn(),
			onDiagnosticActivate: vi.fn(),
			onAnnouncement: vi.fn()
		}
	});
	cleanups.push(() => {
		instance.destroy();
		host.remove();
	});
	return { instance, context };
}

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

describe('editor context updates', () => {
	it('keeps performer and syntax decoration when an ignored finding reveals a section helper', () => {
		const { instance, context } = mount();
		const previous = instance.view.state;
		expect(previous.field(sectionGhostField).size).toBe(0);
		instance.updateContext({ ...context, diagnostics: { revision: 0, items: [] } });
		const current = instance.view.state;

		expect(current.field(performerDecorationField)).toBe(previous.field(performerDecorationField));
		expect(current.field(markupDimField)).toBe(previous.field(markupDimField));
		expect(current.field(lintDecorationField).diagnostics).toEqual([]);
		expect(current.field(sectionGhostField).size).toBe(1);
		expect(current.doc.toString()).toBe(text);
	});

	it('updates performer colors without rebuilding syntax or diagnostic decoration', () => {
		const { instance, context } = mount();
		const previous = instance.view.state;
		instance.updateContext({
			...context,
			performers: context.performers.map((performer) => ({ ...performer, colorId: 'teal' }))
		});
		const current = instance.view.state;

		expect(current.field(performerDecorationField)).not.toBe(
			previous.field(performerDecorationField)
		);
		expect(current.field(markupDimField)).toBe(previous.field(markupDimField));
		expect(current.field(lintDecorationField)).toBe(previous.field(lintDecorationField));
	});

	it('restores cleared displays after text changes back before context is refreshed', () => {
		const { instance, context } = mount();
		const original = instance.view.state;
		instance.view.dispatch({ changes: { from: text.length, insert: '!' } });
		instance.view.dispatch({ changes: { from: text.length, to: text.length + 1 } });
		expect(instance.view.state.field(markupDimField).size).toBe(0);
		expect(instance.view.state.field(performerDecorationField).decorations.size).toBe(0);

		// Reuse the exact same parse and performer payload: equal text does not
		// mean the cleared display already reflects it.
		instance.updateContext({ ...context, diagnostics: { revision: 2, items: [] } });
		const current = instance.view.state;
		expect(current.field(markupDimField).size).toBe(original.field(markupDimField).size);
		expect(current.field(performerDecorationField).decorations.size).toBe(
			original.field(performerDecorationField).decorations.size
		);
		expect(current.doc.toString()).toBe(text);
	});
});
