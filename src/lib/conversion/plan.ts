import { mapSelection, renderProfile } from './projection.js';
import { CONVERTER_VERSION } from './model.js';
import type { ConversionDocument, EngineResult, SwitchPlan, SwitchRequest } from './model.js';

/** A deliberate switch adopts current representation rules without rewriting authored content. */
export function planProfileSwitch(
	document: ConversionDocument,
	request: SwitchRequest
): EngineResult<SwitchPlan> {
	const source = renderProfile(document, request.from);
	if (!source.ok) return source;
	const next =
		request.from !== request.to &&
		request.to === 'musixmatch' &&
		document.converterVersion !== CONVERTER_VERSION
			? { ...document, converterVersion: CONVERTER_VERSION }
			: document;
	const target = request.from === request.to ? source : renderProfile(next, request.to);
	if (!target.ok) return target;
	const value: SwitchPlan = { document: next, projection: target.value };
	if (request.selection)
		value.selection = mapSelection(source.value, target.value, request.selection);
	return { ok: true, value };
}
