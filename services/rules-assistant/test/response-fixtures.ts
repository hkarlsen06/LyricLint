import type OpenAI from 'openai';
import { MODEL } from '../src/config';

export function outputMessage(text: string): OpenAI.Responses.ResponseOutputMessage {
	return {
		type: 'message',
		id: 'msg-1',
		status: 'completed',
		role: 'assistant',
		content: [{ type: 'output_text', text, annotations: [] }]
	};
}

export function providerResponse(
	output: OpenAI.Responses.ResponseOutputItem[],
	status: 'completed' | 'incomplete' | 'failed' = 'completed'
): OpenAI.Responses.Response & { status: 'completed' | 'incomplete' | 'failed' } {
	return {
		access_programs: null,
		output_text: '',
		instructions: null,
		metadata: null,
		parallel_tool_calls: true,
		temperature: null,
		tool_choice: 'auto',
		tools: [],
		top_p: null,
		id: 'resp-1',
		object: 'response',
		created_at: 1,
		model: MODEL.id,
		status,
		output,
		usage: {
			input_tokens: 20,
			input_tokens_details: { cached_tokens: 5, cache_write_tokens: 2 },
			output_tokens: 10,
			output_tokens_details: { reasoning_tokens: 3 },
			total_tokens: 30
		},
		incomplete_details: status === 'incomplete' ? { reason: 'max_output_tokens' } : null,
		error:
			status === 'failed' ? { code: 'server_error', message: 'Fictional provider failure.' } : null
	};
}

/** Real wire events consumed by the official SDK, never a mocked SDK method. */
export function responseEvents(response: ReturnType<typeof providerResponse>) {
	const events: OpenAI.Responses.ResponseStreamEvent[] = [
		{
			type: 'response.created',
			sequence_number: 0,
			response: { ...response, status: 'in_progress', output: [], usage: undefined }
		}
	];
	for (const [output_index, item] of response.output.entries()) {
		events.push({
			type: 'response.output_item.added',
			sequence_number: 0,
			output_index,
			item: item.type === 'message' ? { ...item, status: 'in_progress', content: [] } : item
		});
		if (item.type === 'message') {
			for (const [content_index, part] of item.content.entries()) {
				events.push({
					type: 'response.content_part.added',
					sequence_number: 0,
					output_index,
					item_id: item.id,
					content_index,
					part: part.type === 'output_text' ? { ...part, text: '' } : part
				});
				if (part.type === 'output_text') {
					for (const delta of [part.text.slice(0, 10), part.text.slice(10)]) {
						events.push({
							type: 'response.output_text.delta',
							sequence_number: 0,
							output_index,
							item_id: item.id,
							content_index,
							delta,
							logprobs: []
						});
					}
				}
				events.push({
					type: 'response.content_part.done',
					sequence_number: 0,
					output_index,
					item_id: item.id,
					content_index,
					part
				});
			}
		}
		events.push({ type: 'response.output_item.done', sequence_number: 0, output_index, item });
	}
	events.push({ type: `response.${response.status}`, sequence_number: 0, response });
	return events.map((event, sequence_number) => ({ ...event, sequence_number }));
}

export function eventStream(events: OpenAI.Responses.ResponseStreamEvent[]): Response {
	return new Response(
		events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
		{
			headers: { 'content-type': 'text/event-stream' }
		}
	);
}
