import { clone, hashText, validateProfile } from "../profile/schema";
import type { CorpusAnalysis, VoiceprintProfile } from "../types";

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
    sources: analysis.samples.map((sample) => ({
      id: sample.id,
      label: sample.label,
      register: sample.register,
      permission: sample.permission,
      consentGranted: sample.consentGranted,
      rightsNote: sample.rightsNote,
      redacted: sample.redacted,
      wordCount: sample.wordCount,
      characterCount: sample.characterCount,
      heldOut: sample.heldOut
    }))
  };
  const existing = new Set(next.evidence.map((item) => item.id));
  next.evidence = next.evidence.concat(analysis.evidence.filter((item) => !existing.has(item.id)));
  next.review.pendingCount = next.evidence.filter((item) => item.status === "pending").length;
  next.review.analysis = {
    metrics: analysis.metrics,
    registers: analysis.registers,
    sources: analysis.samples.map((sample) => ({
      id: sample.id,
      label: sample.label,
      register: sample.register,
      permission: sample.permission,
      consentGranted: sample.consentGranted,
      rightsNote: sample.rightsNote,
      redacted: sample.redacted,
      wordCount: sample.wordCount,
      characterCount: sample.characterCount,
      heldOut: sample.heldOut
    })),
    heldOutSampleIds: analysis.heldOutSampleIds,
    heldOutEvaluation: analysis.heldOutEvaluation || null,
    issues: analysis.issues,
    contaminationMatches: analysis.contaminationMatches
  };
  return validateProfile(next).value;
}
