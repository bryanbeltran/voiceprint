import { clone, hashText, validateProfile } from "../profile/schema";
import type { CorpusAnalysis, CorpusSourceMetadata, VoiceprintProfile } from "../types";

function sourceMetadata(sample: CorpusAnalysis["samples"][number]): CorpusSourceMetadata {
  return {
    id: sample.id,
    label: sample.label,
    register: sample.register,
    permission: sample.permission,
    consentGranted: sample.consentGranted,
    rightsNote: sample.rightsNote,
    redacted: sample.redacted,
    wordCount: sample.wordCount,
    characterCount: sample.characterCount,
    heldOut: sample.heldOut,
    sourcePath: sample.sourcePath,
    format: sample.format,
    language: sample.language,
    languageConfidence: sample.languageConfidence,
    proseScore: sample.proseScore,
    included: sample.included,
    exclusionReason: sample.exclusionReason,
    duplicateOf: sample.duplicateOf
  };
}

export function applyCorpusAnalysis(profile: VoiceprintProfile, analysis: CorpusAnalysis, options: { now?: string } = {}): VoiceprintProfile {
  const next = clone(profile);
  const now = options.now || new Date().toISOString();
  next.updatedAt = now;
  next.provenance = {
    ...next.provenance,
    mode: "corpus",
    sampleCount: analysis.samples.length,
    retainedRawText: false,
    corpusHash: hashText(analysis.samples.map((sample) => `${sample.id}:${sample.wordCount}`).join("|")),
    analysisVersion: analysis.analysisVersion,
    sources: analysis.samples.map(sourceMetadata)
  };
  const existing = new Set(next.evidence.map((item) => item.id));
  next.evidence = next.evidence.concat(analysis.evidence.filter((item) => !existing.has(item.id)));
  next.review.pendingCount = next.evidence.filter((item) => item.status === "pending").length;
  next.review.conflicts = analysis.conflicts;
  next.review.analysis = {
    metrics: analysis.metrics,
    registers: analysis.registers,
    sources: analysis.samples.map(sourceMetadata),
    heldOutSampleIds: analysis.heldOutSampleIds,
    heldOutEvaluation: analysis.heldOutEvaluation || null,
    issues: analysis.issues,
    contaminationMatches: analysis.contaminationMatches,
    conflicts: analysis.conflicts,
    language: analysis.language,
    dedupedSampleIds: analysis.dedupedSampleIds
  };
  return validateProfile(next).value;
}
