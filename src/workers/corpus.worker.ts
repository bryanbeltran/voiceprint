import { analyzeCorpus } from "../domain/corpus/analyzer";
import type { CorpusAnalysis, CorpusSampleInput } from "../domain/types";

self.onmessage = (event: MessageEvent<CorpusSampleInput[]>): void => {
  const result: CorpusAnalysis = analyzeCorpus(event.data || []);
  self.postMessage(result);
};
