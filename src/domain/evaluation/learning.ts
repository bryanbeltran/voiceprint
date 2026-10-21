import { clone, createEvidence, hashText, normalizeText, validateProfile } from "../profile/schema";
import { featureDefinitions, featureValue, metricsForTexts } from "../corpus/analyzer";
import type { EditLearningResult, RegisterName, VoiceprintProfile } from "../types";

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function suggestionFor(featureId: string, before: number, after: number): string | null {
  const down = after < before;
  const direction = down ? "less" : "more";
  const suggestions: Record<string, string> = {
    "sentence-p25": `Prefer ${direction} short sentences in the ${down ? "edited" : "generated"} draft rhythm.`,
    "sentence-p50": `Aim for ${direction} mid-length sentences; the edit changed the writer's median sentence rhythm.`,
    "sentence-p75": `Use ${direction} long sentences when shaping the ${down ? "edited" : "generated"} register.`,
    "sentence-p90": `Keep the longest sentences ${down ? "shorter" : "longer"} when this register needs its natural cadence.`,
    "paragraph-p50": `Keep paragraphs ${down ? "shorter" : "longer"} in this register.`,
    "sentences-per-paragraph": `Use ${down ? "fewer" : "more"} sentences per paragraph when organizing this register.`,
    "average-word-length": `Prefer ${down ? "shorter" : "longer"} words when precision allows.`,
    "lexical-diversity": `Use ${down ? "more familiar repetition" : "more varied and specific vocabulary"} in this register.`,
    "first-person": `${down ? "Reduce" : "Protect"} first-person point of view when it changes accountability or warmth.`,
    "direct-address": `${down ? "Reduce" : "Protect"} direct address to the reader when it is natural.`,
    "hedging": `${down ? "Use fewer" : "Allow more"} careful qualifiers when the evidence calls for them.`,
    contractions: `${down ? "Use fewer contractions" : "Use natural contractions"} in this register.`,
    questions: `${down ? "Ask fewer" : "Allow occasional"} questions when they help the reader orient themselves.`,
    exclamations: `${down ? "Use fewer" : "Allow occasional"} exclamation marks and keep their energy intentional.`,
    "em-dashes": `${down ? "Use fewer" : "Allow occasional"} em dashes; choose punctuation deliberately.`,
    commas: `${down ? "Use fewer" : "Allow more"} commas to preserve this register's sentence rhythm.`,
    semicolons: `${down ? "Use fewer" : "Allow more"} semicolons when they add useful structure.`,
    colons: `${down ? "Use fewer" : "Allow more"} colons for introductions and explanations.`,
    parentheticals: `${down ? "Use fewer" : "Allow occasional"} parentheticals in this register.`,
    "lowercase-openings": `${down ? "Use fewer" : "Preserve occasional"} lowercase sentence openings when they are intentional.`,
    markdown: `${down ? "Use less" : "Use more"} Markdown structure in this register.`,
    bullets: `${down ? "Use fewer" : "Use more"} list items when structure helps the reader.`,
    headings: `${down ? "Use fewer" : "Use more"} headings when organizing the message.`,
    "repeated-openings": `${down ? "Vary" : "Allow"} repeated sentence openings when they create the desired rhythm.`
  };
  return suggestions[featureId] || null;
}

export function learnFromEdit(before: string, after: string, register: RegisterName = "default"): EditLearningResult {
  const beforeMetrics = metricsForTexts([normalizeText(before, 20_000)]);
  const afterMetrics = metricsForTexts([normalizeText(after, 20_000)]);
  const definitions = featureDefinitions(beforeMetrics);
  const changedFeatures: string[] = [];
  const suggestions: string[] = [];
  definitions.forEach(([featureId, , beforeValue, unit]) => {
    const afterValue = featureValue(afterMetrics, featureId);
    const tolerance = unit === "ratio" || unit === "per word" ? .04 : 1;
    if (Math.abs(afterValue - beforeValue) <= tolerance) return;
    changedFeatures.push(featureId);
    const suggestion = suggestionFor(featureId, beforeValue, afterValue);
    if (suggestion && !suggestions.includes(suggestion)) suggestions.push(suggestion);
  });
  const totalWords = beforeMetrics.wordCount + afterMetrics.wordCount;
  return {
    register,
    changedFeatures: changedFeatures.slice(0, 12),
    suggestions: suggestions.slice(0, 8),
    beforeWordCount: beforeMetrics.wordCount,
    afterWordCount: afterMetrics.wordCount,
    confidence: totalWords >= 240 ? "high" : totalWords >= 80 ? "medium" : "low"
  };
}

export function applyEditLearning(profile: VoiceprintProfile, result: EditLearningResult, options: { now?: string } = {}): VoiceprintProfile {
  if (!result.suggestions.length) return profile;
  const next = clone(profile);
  const now = options.now || new Date().toISOString();
  const existingClaims = new Set(next.evidence.map((item) => item.claim));
  result.suggestions.forEach((claim, index) => {
    if (existingClaims.has(claim)) return;
    const featureId = result.changedFeatures[index] || result.changedFeatures[0] || "edit-learning";
    const sourceId = `edit-${hashText(`${profile.profileId}|${result.register}|${claim}`)}`;
    const evidence = createEvidence({
      id: sourceId,
      sourceType: "edit",
      sourceRef: "approved edit pair",
      sourceId,
      featureId,
      sampleIds: [],
      supports: [],
      coverage: 1,
      scope: result.register === "default" ? "global" : "register",
      permission: "owned",
      register: result.register,
      claim,
      excerpt: "",
      confidence: result.confidence,
      status: "approved",
      createdAt: now
    });
    next.evidence.push(evidence);
    next.preferences.customRules.push({
      id: `rule-${hashText(`${sourceId}|${claim}`)}`,
      text: claim,
      register: result.register,
      sourceEvidenceId: sourceId
    });
  });
  next.review.pendingCount = next.evidence.filter((item) => item.status === "pending").length;
  next.review.lastReviewedAt = now;
  next.updatedAt = now;
  return validateProfile(next).value;
}

export function summarizeEditLearning(result: EditLearningResult): string {
  if (!result.suggestions.length) return "No stable style change was detected in this edit pair.";
  return `${result.suggestions.length} candidate preference${result.suggestions.length === 1 ? "" : "s"} detected across ${result.changedFeatures.length} measured feature${result.changedFeatures.length === 1 ? "" : "s"} (${result.confidence} confidence).`;
}

export { round as roundLearningValue };
