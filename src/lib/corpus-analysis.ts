import { analyzeCorpus } from "../domain/corpus/analyzer";
import type { CorpusAnalysis, CorpusSampleInput } from "../domain/types";

const WORKER_THRESHOLD = 40_000;

export function analyzeCorpusAsync(samples: CorpusSampleInput[]): Promise<CorpusAnalysis> {
  const size = samples.reduce((total, sample) => total + sample.text.length, 0);
  if (typeof Worker === "undefined" || size < WORKER_THRESHOLD) return Promise.resolve(analyzeCorpus(samples));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/corpus.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<CorpusAnalysis>): void => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (error): void => {
      worker.terminate();
      try {
        resolve(analyzeCorpus(samples));
      } catch {
        reject(error);
      }
    };
    worker.postMessage(samples);
  });
}
