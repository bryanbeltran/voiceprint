import { applyCorpusAnalysis as applyCorpusAnalysisToProfile } from "./apply";
import { createEvidence, normalizeCorpusMetrics, normalizeText } from "../profile/schema";
import { REGISTER_NAMES, type CorpusAnalysis, type CorpusMetrics, type CorpusSampleInput, type CorpusSampleSummary, type FeatureBand, type RegisterAnalysis, type RegisterName, type SourcePermission, type VoiceprintProfile } from "../types";

export const ANALYSIS_VERSION = "local-heuristics-2";

const FUNCTION_WORDS = new Set("a an and are as at be by for from had has have he her him his i if in into is it its me my of on or our she that the their them they this to us was we were what when which who will with you your".split(" "));
const HEDGING_WORDS = new Set("perhaps maybe might may could would likely possibly generally often usually tend seems seem think believe somewhat fairly probably arguably approximately appear appears suggest suggests".split(" "));
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+)?previous\s+instructions?/i,
  /system\s*message\s*:/i,
  /assistant\s*message\s*:/i,
  /developer\s*message\s*:/i,
  /<\/?(?:script|system|tool)[^>]*>/i,
  /```(?:system|assistant|developer)/i
];

interface NormalizedSample {
  id: string;
  label: string;
  text: string;
  register: RegisterName;
  permission: SourcePermission;
  consentGranted: boolean;
  rightsNote: string;
  redacted: boolean;
  heldOut: boolean;
}

interface SpanText {
  text: string;
  start: number;
  end: number;
}

function words(value: unknown): string[] {
  return normalizeText(value, 100_000).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu) || [];
}

function spans(value: unknown, separator: RegExp): SpanText[] {
  const text = normalizeText(value, 100_000);
  const result: SpanText[] = [];
  let cursor = 0;
  for (const part of text.split(separator)) {
    const start = text.indexOf(part, cursor);
    const actualStart = start < 0 ? cursor : start;
    const trimmed = part.trim();
    const trimOffset = part.indexOf(trimmed);
    if (trimmed) result.push({ text: trimmed, start: actualStart + Math.max(0, trimOffset), end: actualStart + Math.max(0, trimOffset) + trimmed.length });
    cursor = actualStart + part.length;
  }
  return result;
}

function sentences(value: unknown): SpanText[] {
  return spans(value, /(?<=[.!?])\s+/);
}

function paragraphs(value: unknown): SpanText[] {
  return spans(value, /\n\s*\n/);
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? numerator / denominator : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(values: number[], point: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * point;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return round(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower));
}

function redactText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted-email]")
    .replace(/(?:\+?\d[\d ().-]{7,}\d)/g, "[redacted-phone]")
    .replace(/\b(?:sk|pk|api|token|secret)[_-][A-Za-z0-9_-]{8,}\b/gi, "[redacted-secret]");
}

export function redactCorpusText(value: string): string {
  return redactText(normalizeText(value, 20_000));
}

function normalizeSamples(samples: CorpusSampleInput[]): NormalizedSample[] {
  return samples.map((sample, index) => {
    const original = normalizeText(sample?.text ?? sample, 20_000);
    const shouldRedact = sample?.redact !== false;
    return {
      id: normalizeText(sample?.id, 100) || `sample-${index + 1}`,
      label: normalizeText(sample?.label, 160) || normalizeText(sample?.id, 100) || `Sample ${index + 1}`,
      text: shouldRedact ? redactText(original) : original,
      register: REGISTER_NAMES.includes(sample?.register as RegisterName) ? sample.register as RegisterName : "default",
      permission: ["owned", "licensed", "authorized", "unknown"].includes(sample?.permission || "") ? sample.permission as SourcePermission : "owned",
      consentGranted: sample?.consentGranted !== false,
      rightsNote: normalizeText(sample?.rightsNote, 500),
      redacted: shouldRedact && redactText(original) !== original,
      heldOut: sample?.heldOut === true
    };
  }).filter((sample) => sample.text.length > 0);
}

function openerCounts(sentenceList: SpanText[]): Array<{ token: string; count: number; rate: number }> {
  const counts = new Map<string, number>();
  sentenceList.forEach((sentence) => {
    const token = words(sentence.text)[0]?.toLowerCase();
    if (token) counts.set(token, (counts.get(token) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([token, count]) => ({ token, count, rate: round(ratio(count, sentenceList.length), 4) }));
}

function repeatedPhrases(tokenList: string[]): Array<{ phrase: string; count: number }> {
  const counts = new Map<string, number>();
  for (let index = 0; index < tokenList.length - 1; index += 1) {
    const phrase = `${tokenList[index].toLowerCase()} ${tokenList[index + 1].toLowerCase()}`;
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([phrase, count]) => ({ phrase, count }));
}

export function metricsForTexts(texts: string[], fidelityScore = 0): CorpusMetrics {
  const corpus = texts.join("\n\n");
  const tokenList = words(corpus);
  const sentenceList = sentences(corpus);
  const paragraphList = paragraphs(corpus);
  const lower = corpus.toLowerCase();
  const sentenceLengths = sentenceList.map((sentence) => words(sentence.text).length).filter(Boolean);
  const paragraphLengths = paragraphList.map((paragraph) => words(paragraph.text).length).filter(Boolean);
  const contractionCount = (lower.match(/\b(?:i['’]m|i['’]ll|i['’]ve|don['’]t|can['’]t|won['’]t|it['’]s|we['’]re|they['’]re|you['’]re|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|couldn['’]t|shouldn['’]t|wouldn['’]t)\b/g) || []).length;
  const emDashCount = (corpus.match(/[—–]/g) || []).length;
  const questionCount = (corpus.match(/\?/g) || []).length;
  const exclamationCount = (corpus.match(/!/g) || []).length;
  const firstPersonCount = (lower.match(/\b(?:i|we|my|our|me|us)\b/g) || []).length;
  const directAddressCount = (lower.match(/\b(?:you|your|yours)\b/g) || []).length;
  const functionWordCount = tokenList.filter((word) => FUNCTION_WORDS.has(word.toLowerCase())).length;
  const hedgingCount = tokenList.filter((word) => HEDGING_WORDS.has(word.toLowerCase())).length;
  const lowercaseStartCount = sentenceList.filter((sentence) => /^[a-z]/.test(sentence.text)).length;
  const markdownCount = (corpus.match(/(?:^|\n)\s*(?:[-*+]\s|#{1,6}\s)|\*\*|`/gm) || []).length;
  const uniqueWords = new Set(tokenList.map((word) => word.toLowerCase())).size;
  const repeatedOpeners = openerCounts(sentenceList).filter((entry) => entry.count > 1).reduce((total, entry) => total + entry.count, 0);
  return normalizeCorpusMetrics({
    sampleCount: texts.length,
    wordCount: tokenList.length,
    sentenceCount: sentenceList.length,
    paragraphCount: paragraphList.length,
    averageSentenceWords: ratio(tokenList.length, sentenceList.length),
    averageParagraphWords: ratio(tokenList.length, paragraphList.length),
    averageWordLength: ratio(tokenList.reduce((total, word) => total + word.length, 0), tokenList.length),
    uniqueWordRatio: ratio(uniqueWords, tokenList.length),
    contractionRate: ratio(contractionCount, tokenList.length),
    emDashCount,
    questionCount,
    exclamationCount,
    firstPersonRate: ratio(firstPersonCount, tokenList.length),
    directAddressRate: ratio(directAddressCount, tokenList.length),
    functionWordRate: ratio(functionWordCount, tokenList.length),
    hedgingRate: ratio(hedgingCount, tokenList.length),
    lowercaseStartRate: ratio(lowercaseStartCount, sentenceList.length),
    markdownRate: ratio(markdownCount, tokenList.length),
    repeatedOpeningRate: ratio(repeatedOpeners, sentenceList.length),
    sentenceWordPercentiles: { p25: percentile(sentenceLengths, .25), p50: percentile(sentenceLengths, .5), p75: percentile(sentenceLengths, .75), p90: percentile(sentenceLengths, .9) },
    paragraphWordPercentiles: { p25: percentile(paragraphLengths, .25), p50: percentile(paragraphLengths, .5), p75: percentile(paragraphLengths, .75), p90: percentile(paragraphLengths, .9) },
    openers: openerCounts(sentenceList),
    repeatedPhrases: repeatedPhrases(tokenList),
    fidelityScore
  });
}

function featureDefinitions(metrics: CorpusMetrics): Array<[string, string, number, string]> {
  return [
    ["sentence-p50", "Median sentence length", metrics.sentenceWordPercentiles.p50, "words"],
    ["sentence-p90", "Long sentence ceiling", metrics.sentenceWordPercentiles.p90, "words"],
    ["paragraph-p50", "Median paragraph length", metrics.paragraphWordPercentiles.p50, "words"],
    ["lexical-diversity", "Lexical diversity", metrics.uniqueWordRatio, "ratio"],
    ["function-words", "Function-word rate", metrics.functionWordRate, "ratio"],
    ["hedging", "Hedging rate", metrics.hedgingRate, "ratio"],
    ["contractions", "Contraction rate", metrics.contractionRate, "ratio"],
    ["lowercase-openings", "Lowercase sentence starts", metrics.lowercaseStartRate, "ratio"],
    ["markdown", "Markdown density", metrics.markdownRate, "per word"],
    ["repeated-openings", "Repeated opening rate", metrics.repeatedOpeningRate, "ratio"]
  ];
}

export function featureValue(metrics: CorpusMetrics, id: string): number {
  return featureDefinitions(metrics).find(([featureId]) => featureId === id)?.[2] || 0;
}

export { featureDefinitions };

function buildBands(register: RegisterName, registerSamples: NormalizedSample[], metrics: CorpusMetrics): FeatureBand[] {
  const valuesByFeature = new Map<string, number[]>();
  registerSamples.forEach((sample) => {
    const sampleMetrics = metricsForTexts([sample.text]);
    featureDefinitions(sampleMetrics).forEach(([id, , value]) => valuesByFeature.set(id, [...(valuesByFeature.get(id) || []), value]));
  });
  const coverage = Math.min(1, registerSamples.length / 3);
  return featureDefinitions(metrics).map(([id, label, value, unit]) => {
    const values = valuesByFeature.get(id) || [];
    const min = values.length ? Math.min(...values) : value;
    const max = values.length ? Math.max(...values) : value;
    const margin = values.length > 1 ? Math.max(unit === "ratio" ? .02 : .5, (max - min) * .2) : Math.max(unit === "ratio" ? .05 : 1, Math.abs(value) * .15);
    const targetMin = Math.max(0, round(min - margin));
    const targetMax = round(max + margin);
    return {
      id,
      label,
      value: round(value),
      unit,
      targetMin,
      targetMax,
      coverage,
      confidence: registerSamples.length >= 5 ? "high" : registerSamples.length >= 2 ? "medium" : "low",
      status: values.length ? "within" : "insufficient",
      detail: `${registerSamples.length} ${register === "default" ? "general" : register} sample${registerSamples.length === 1 ? "" : "s"}; target ${targetMin}–${targetMax} ${unit}.`
    };
  });
}

function registerAnalysis(register: RegisterName, registerSamples: NormalizedSample[]): RegisterAnalysis {
  const metrics = metricsForTexts(registerSamples.map((sample) => sample.text));
  return { register, sampleIds: registerSamples.map((sample) => sample.id), sampleCount: registerSamples.length, featureBands: buildBands(register, registerSamples, metrics), metrics };
}

function firstSupportingSpan(sample: NormalizedSample): { excerpt: string; start: number; end: number } {
  const span = sentences(sample.text)[0] || { text: sample.text.slice(0, 280), start: 0, end: Math.min(sample.text.length, 280) };
  return { excerpt: normalizeText(span.text, 800), start: span.start, end: span.end };
}

function sampleSummary(sample: NormalizedSample): CorpusSampleSummary {
  return {
    id: sample.id,
    label: sample.label,
    register: sample.register,
    permission: sample.permission,
    consentGranted: sample.consentGranted,
    rightsNote: sample.rightsNote,
    redacted: sample.redacted,
    heldOut: sample.heldOut,
    wordCount: words(sample.text).length,
    characterCount: sample.text.length
  };
}

export function analyzeCorpus(samples: CorpusSampleInput[] = []): CorpusAnalysis {
  const normalizedSamples = normalizeSamples(samples);
  const rejected = normalizedSamples.filter((sample) => !sample.consentGranted);
  const usable = normalizedSamples.filter((sample) => sample.consentGranted && !sample.heldOut);
  const corpus = usable.map((sample) => sample.text).join("\n\n");
  const contaminationMatches = INJECTION_PATTERNS.flatMap((pattern) => normalizedSamples
    .filter((sample) => pattern.test(sample.text))
    .map((sample) => ({ sampleId: sample.id, pattern: pattern.source })));
  const repeatedLineCount = usable.reduce((count, sample) => {
    const lines = sample.text.split(/\n/).map((line) => line.trim().toLowerCase()).filter(Boolean);
    return count + lines.length - new Set(lines).size;
  }, 0);
  const fidelityScore = Math.max(0, Math.min(1, 0.3 + Math.min(usable.length, 5) * .1 + Math.min(words(corpus).length / 1_500, .3) - (contaminationMatches.length ? .35 : 0) - Math.min(repeatedLineCount / 20, .15) - rejected.length * .15));
  const metrics = metricsForTexts(usable.map((sample) => sample.text), round(fidelityScore));
  const issues: CorpusAnalysis["issues"] = [];
  if (rejected.length) issues.push({ id: "permission-required", severity: "error", message: `${rejected.length} sample${rejected.length === 1 ? " lacks" : "s lack"} consent and was excluded from analysis.` });
  if (usable.length < 2) issues.push({ id: "few-samples", severity: "warning", message: "Add at least two consented samples from different moments for stronger source fidelity." });
  if (metrics.wordCount < 120) issues.push({ id: "short-corpus", severity: "warning", message: "The corpus is short; inferred rules and feature bands remain lower confidence." });
  if (repeatedLineCount > 0) issues.push({ id: "repeated-lines", severity: "warning", message: "Repeated lines were detected; duplicates are excluded from confidence scoring." });
  if (contaminationMatches.length) issues.push({ id: "instruction-like-text", severity: "error", message: "Instruction-like text was detected. Review or remove it before treating the corpus as writing evidence." });
  if (normalizedSamples.some((sample) => sample.permission === "unknown")) issues.push({ id: "unknown-rights", severity: "warning", message: "One or more samples have unknown source rights. Confirm permission before sharing the profile." });
  if (!usable.length) issues.push({ id: "no-usable-samples", severity: "error", message: "No consented reference samples are available for profile analysis." });

  const evidence: CorpusAnalysis["evidence"] = [];
  const registerGroups = REGISTER_NAMES.reduce<Record<RegisterName, NormalizedSample[]>>((result, register) => {
    result[register] = usable.filter((sample) => sample.register === register);
    return result;
  }, {} as Record<RegisterName, NormalizedSample[]>);
  const registerAnalyses = REGISTER_NAMES.reduce<Record<RegisterName, RegisterAnalysis>>((result, register) => {
    result[register] = registerAnalysis(register, registerGroups[register]);
    return result;
  }, {} as Record<RegisterName, RegisterAnalysis>);
  const activeRegister = registerGroups.default.length ? "default" : (usable[0]?.register || "default");
  const activeSamples = registerGroups[activeRegister].length ? registerGroups[activeRegister] : usable;
  const activeMetrics = registerAnalyses[activeRegister].metrics;
  const addRule = (condition: boolean, claim: string, matchingSamples: NormalizedSample[], confidence: "low" | "medium" | "high" = "medium"): void => {
    if (!condition || !matchingSamples.length) return;
    const support = firstSupportingSpan(matchingSamples[0]);
    evidence.push(createEvidence({
      sourceType: "corpus",
      sourceRef: matchingSamples.map((sample) => sample.label).join(", "),
      sourceId: matchingSamples[0].id,
      sampleIds: matchingSamples.map((sample) => sample.id),
      span: { start: support.start, end: support.end },
      coverage: ratio(matchingSamples.length, activeSamples.length),
      scope: activeRegister === "default" ? "global" : "register",
      permission: matchingSamples[0].permission,
      rightsNote: matchingSamples[0].rightsNote,
      register: activeRegister,
      claim,
      excerpt: support.excerpt,
      confidence
    }));
  };
  addRule(activeMetrics.contractionRate > 0, "Use contractions when they sound natural.", activeSamples.filter((sample) => metricsForTexts([sample.text]).contractionRate > 0), activeMetrics.contractionRate > .01 ? "high" : "medium");
  addRule(activeMetrics.averageParagraphWords > 0 && activeMetrics.averageParagraphWords <= 70, "Keep paragraphs focused and relatively short.", activeSamples.filter((sample) => metricsForTexts([sample.text]).averageParagraphWords <= 70), activeMetrics.averageParagraphWords <= 45 ? "high" : "medium");
  addRule(activeMetrics.uniqueWordRatio < .65, "Prefer specific, familiar language over unnecessary abstraction.", activeSamples, "low");
  addRule(activeMetrics.questionCount > 0, "Use occasional questions when they help the reader think or orient themselves.", activeSamples.filter((sample) => sample.text.includes("?")), "medium");
  addRule(activeMetrics.directAddressRate > .01, "Address the reader directly when the context calls for it.", activeSamples.filter((sample) => metricsForTexts([sample.text]).directAddressRate > .01), activeMetrics.directAddressRate > .03 ? "high" : "medium");
  addRule(activeMetrics.firstPersonRate > .01, "Use a grounded first-person point of view where it adds accountability or warmth.", activeSamples.filter((sample) => metricsForTexts([sample.text]).firstPersonRate > .01), activeMetrics.firstPersonRate > .03 ? "high" : "medium");
  addRule(activeMetrics.lowercaseStartRate > .1, "Preserve lowercase openings when they are part of the writer's natural rhythm.", activeSamples.filter((sample) => metricsForTexts([sample.text]).lowercaseStartRate > .1), "medium");

  return {
    analysisVersion: ANALYSIS_VERSION,
    samples: normalizedSamples.map(sampleSummary),
    metrics,
    registers: registerAnalyses,
    heldOutSampleIds: normalizedSamples.filter((sample) => sample.heldOut).map((sample) => sample.id),
    issues,
    contaminationMatches,
    evidence
  };
}

export function applyCorpusAnalysis(profile: VoiceprintProfile, analysis: CorpusAnalysis, options: { now?: string } = {}): VoiceprintProfile {
  return applyCorpusAnalysisToProfile(profile, analysis, options);
}

export { INJECTION_PATTERNS };
