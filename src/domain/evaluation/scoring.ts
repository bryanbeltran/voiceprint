import { featureValue, metricsForTexts } from "../corpus/analyzer";
import { normalizeText } from "../profile/schema";
import { compileProfile } from "../compiler/adapters";
import type { AdapterTarget, FeatureDrift, FeatureRegressionResult, FeatureStatus, HeldOutEvaluation, ProfileScore, RegressionResult, RegisterName, VoiceprintProfile } from "../types";

const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he", "i", "if", "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "was", "we", "were", "with", "you"]);

function words(value: unknown): string[] {
  return normalizeText(value, 100_000).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu) || [];
}

function paragraphs(value: unknown): string[] {
  return normalizeText(value, 100_000).split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? numerator / denominator : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function statusFor(value: number, min: number, max: number): FeatureStatus {
  if (value < min) return "low";
  if (value > max) return "high";
  return "within";
}

function featureScore(feature: FeatureDrift): number {
  if (feature.status === "within") return 1;
  if (feature.status === "insufficient") return .65;
  const distance = feature.status === "low" ? feature.targetMin - feature.actual : feature.actual - feature.targetMax;
  const width = Math.max(.1, feature.targetMax - feature.targetMin);
  return Math.max(0, 1 - distance / (width * 2 + .1));
}

function featureRecommendation(feature: Pick<FeatureDrift, "status" | "label" | "targetMin" | "targetMax" | "unit">): string {
  if (feature.status === "within") return `Keep ${feature.label.toLowerCase()} within the observed range.`;
  if (feature.status === "insufficient") return `Collect more approved samples before changing ${feature.label.toLowerCase()}.`;
  const target = feature.status === "low" ? `at least ${feature.targetMin}` : `no more than ${feature.targetMax}`;
  return `Aim for ${target} ${feature.unit} for ${feature.label.toLowerCase()}.`;
}

const FEATURE_GOLDEN_FIXTURES: Array<{ name: string; text: string; expected: Record<string, number> }> = [
  {
    name: "direct two-sentence note",
    text: "I write. You read.",
    expected: {
      "sentence-p50": 2,
      "paragraph-p50": 4,
      "sentences-per-paragraph": 2,
      "average-word-length": 3.25,
      "lexical-diversity": 1,
      "function-words": .5,
      "first-person": .25,
      "direct-address": .25
    }
  },
  {
    name: "qualified question",
    text: "Perhaps we can pause, and ask: why now?",
    expected: {
      "sentence-p50": 8,
      "paragraph-p50": 8,
      "sentences-per-paragraph": 1,
      "lexical-diversity": 1,
      "function-words": .25,
      hedging: .125,
      questions: 1,
      commas: .125,
      colons: .125
    }
  }
];

export function runFeatureRegressionFixtures(tolerance = .0001): FeatureRegressionResult[] {
  return FEATURE_GOLDEN_FIXTURES.flatMap((fixture) => {
    const metrics = metricsForTexts([fixture.text]);
    return Object.entries(fixture.expected).map(([feature, expected]) => {
      const actual = featureValue(metrics, feature);
      return { name: fixture.name, feature, expected, actual, tolerance, passed: Math.abs(actual - expected) <= tolerance };
    });
  });
}

export function scoreTextAgainstProfile(text: string, profile: VoiceprintProfile, register: RegisterName = "default"): ProfileScore {
  const normalized = normalizeText(text, 20_000);
  const lower = normalized.toLowerCase();
  const tokenList = words(normalized);
  const paragraphList = paragraphs(normalized);
  const metrics = metricsForTexts([normalized]);
  const habits = profile.preferences?.habits || { contractions: true, shortParagraphs: true, plainLanguage: true, emDash: false };
  const checks: ProfileScore["checks"] = [];
  const add = (label: string, score: number, detail: string): void => {
    checks.push({ label, score: Math.max(0, Math.min(1, score)), detail });
  };
  const contractionCount = (lower.match(/\b(?:i['’]m|i['’]ll|i['’]ve|don['’]t|can['’]t|won['’]t|it['’]s|we['’]re|they['’]re|you['’]re|isn['’]t|aren['’]t)\b/g) || []).length;
  add("Contractions", habits.contractions ? Math.min(1, contractionCount / 2) : contractionCount === 0 ? 1 : .4, habits.contractions ? "Natural contractions are present." : "The profile prefers full forms.");
  const averageParagraph = ratio(tokenList.length, paragraphList.length);
  add("Paragraph rhythm", habits.shortParagraphs ? (averageParagraph <= 80 ? 1 : Math.max(0, 1 - (averageParagraph - 80) / 160)) : .75, `${round(averageParagraph)} words per paragraph.`);
  const avoidTerms = normalizeText(profile.preferences?.avoid).toLowerCase().split(/[,;]+/).map((term) => term.trim()).filter((term) => term.length > 3 && !STOP_WORDS.has(term));
  const matchedAvoid = avoidTerms.filter((term) => lower.includes(term));
  add("Avoidance", matchedAvoid.length ? Math.max(0, 1 - matchedAvoid.length * .25) : 1, matchedAvoid.length ? `Potentially generic terms found: ${matchedAvoid.join(", ")}.` : "No configured avoid phrases detected.");
  add("Point of view", lower.includes("you") || lower.includes("we") || lower.includes("i") ? 1 : .65, "Checks for a visible human point of view.");

  const registerBands = profile.review.analysis?.registers?.[register]?.featureBands || [];
  const defaultBands = profile.review.analysis?.registers?.default?.featureBands || [];
  const bands = registerBands.length ? registerBands : defaultBands;
  const features: FeatureDrift[] = bands.map((band) => {
    const actual = round(featureValue(metrics, band.id));
    const status = band.coverage < .34 ? "insufficient" : statusFor(actual, band.targetMin, band.targetMax);
    const recommendation = featureRecommendation({ label: band.label, status, targetMin: band.targetMin, targetMax: band.targetMax, unit: band.unit });
    return { id: band.id, label: band.label, actual, targetMin: band.targetMin, targetMax: band.targetMax, unit: band.unit, status, detail: status === "within" ? "Within the observed profile band." : status === "insufficient" ? "Not enough reference samples for a confident comparison." : `${status === "low" ? "Below" : "Above"} the observed profile band.`, recommendation };
  });
  features.forEach((feature) => add(feature.label, featureScore(feature), feature.detail));
  const expectedRegister = profile.registers?.[register]?.label || register;
  const overall = round(ratio(checks.reduce((sum, check) => sum + check.score, 0), checks.length) * 100, 0);
  const recommendations = features.filter((feature) => feature.status !== "within").map((feature) => feature.recommendation);
  if (matchedAvoid.length) recommendations.unshift(`Review or replace configured avoid phrases: ${matchedAvoid.join(", ")}.`);
  return { overall, register: expectedRegister, wordCount: tokenList.length, checks, features, driftCount: features.filter((feature) => feature.status === "low" || feature.status === "high").length, matchedAvoid, recommendations };
}

export function evaluateHeldOutSamples(profile: VoiceprintProfile, samples: Array<{ id: string; label?: string; text: string }>, register: RegisterName = "default"): HeldOutEvaluation {
  const reports = samples.map((sample) => ({ sampleId: sample.id, label: sample.label || sample.id, score: scoreTextAgainstProfile(sample.text, profile, register) }));
  const averageScore = round(ratio(reports.reduce((sum, report) => sum + report.score.overall, 0), reports.length), 0);
  return { register, sampleCount: reports.length, passed: reports.length > 0 && averageScore >= 70, averageScore, reports };
}

export function runRegressionFixtures(profile: VoiceprintProfile): RegressionResult[] {
  const fixtures: Array<{ name: string; target: AdapterTarget; mustContain: string[] }> = [
    { name: "universal output", target: "universal", mustContain: ["Voice principles", "Writing habits"] },
    { name: "Codex adapter", target: "codex", mustContain: ["name:", "Use this skill"] },
    { name: "Claude adapter", target: "claude", mustContain: ["writing voice"] },
    { name: "ChatGPT adapter", target: "chatgpt", mustContain: ["Custom instructions"] },
    { name: "Cursor adapter", target: "cursor", mustContain: ["Voiceprint writing instructions"] },
    { name: "Gemini adapter", target: "gemini", mustContain: ["Gemini"] },
    { name: "Agent Skills adapter", target: "agent-skill", mustContain: ["name:", "description:"] }
  ];
  return fixtures.map((fixture) => {
    const output = compileProfile(profile, fixture.target);
    const missing = fixture.mustContain.filter((needle) => !output.includes(needle));
    return { ...fixture, passed: missing.length === 0, missing };
  });
}
