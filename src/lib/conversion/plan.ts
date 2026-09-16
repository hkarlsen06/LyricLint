import { mapSelection, renderProfile } from './projection.js';
import type { ConversionDocument, EngineResult, SwitchPlan, SwitchRequest } from './model.js';

/** Switching is a pure view selection. In particular it does not capture authored forms. */
export function planProfileSwitch(
	document: ConversionDocument,
	request: SwitchRequest
): EngineResult<SwitchPlan> {
	const source = renderProfile(document, request.from);
	if (!source.ok) return source;
	const target = request.from === request.to ? source : renderProfile(document, request.to);
	if (!target.ok) return target;
	const value: SwitchPlan = { document, projection: target.value };
	if (request.selection)
		value.selection = mapSelection(source.value, target.value, request.selection);
	return { ok: true, value };
}
