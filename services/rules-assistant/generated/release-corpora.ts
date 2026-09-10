// The serialized release job replaces this local default with the live site's corpus.
import type { AssistantCorpus } from './rules-context';
import { corpus } from './rules-context-data';

export const compatibleCorpora: readonly AssistantCorpus[] = [];
export const legacyCorpusHash: string | undefined = corpus.contentHash;
