import { applyCorpusAnalysis as applyCorpusAnalysisToProfile } from "./apply";
import { createEvidence, hashText, normalizeCorpusMetrics, normalizeText } from "../profile/schema";
import { REGISTER_NAMES, type CorpusAnalysis, type CorpusMetrics, type CorpusSampleInput, type CorpusSampleSummary, type EvidenceConfidence, type EvidenceConflict, type FeatureBand, type LanguageSummary, type RegisterAnalysis, type RegisterName, type SourcePermission, type VoiceprintProfile } from "../types";

export const ANALYSIS_VERSION = "local-heuristics-3";

const FUNCTION_WORDS = new Set("a an and are as at be by for from had has have he her him his i if in into is it its me my of on or our she that the their them they this to us was we were what when which who will with you your".split(" "));
const ENGLISH_PROBES = new Set("about after all also because before between but can could day do down each even first get give good how into just know like make more most much must new no not now only other our over people put same see should some such than then there these think time two use very want way well where while why work would yes yet".split(" "));
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
  sourcePath: string;
  format: CorpusSampleInput["format"];
  language: string;
  languageConfidence: number;
  proseScore: number;
  duplicateOf?: string;
  exclusionReason?: CorpusSampleSummary["exclusionReason"];
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

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
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

function detectLanguage(text: string): LanguageSummary {
  const tokenList = words(text);
  if (tokenList.length < 8) return { code: "und", label: "Undetermined", confidence: .25, abstained: true };
  const lower = tokenList.map((token) => token.toLowerCase());
  const englishHits = lower.filter((token) => FUNCTION_WORDS.has(token) || ENGLISH_PROBES.has(token)).length;
  // eslint-disable-next-line no-control-regex
  const nonLatin = (text.match(/[^\u0000-\u024f\s\p{P}\p{N}]/gu) || []).length;
  const nonLatinRatio = ratio(nonLatin, text.length);
  const confidence = clamp((englishHits / tokenList.length) * 2.4 - nonLatinRatio * 1.5);
  if (confidence >= .42) return { code: "en", label: "English", confidence: round(confidence, 3), abstained: false };
  return { code: "und", label: "Undetermined", confidence: round(confidence, 3), abstained: true };
}

function proseScore(text: string): number {
  const tokenCount = words(text).length;
  if (!tokenCount) return 0;
  const sentenceCount = sentences(text).length;
  const letters = (text.match(/[\p{L}]/gu) || []).length;
  const structuralNoise = (text.match(/[{}<>]{2,}|(?:https?:\/\/|www\.)\S+/gi) || []).length;
  return clamp(.45 * Math.min(1, tokenCount / 20) + .35 * Math.min(1, sentenceCount / 2) + .2 * ratio(letters, Math.max(1, text.length)) - structuralNoise * .12);
}

function canonicalText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function normalizeSamples(samples: CorpusSampleInput[]): NormalizedSample[] {
  const seen = new Map<string, string>();
  return samples.map((sample, index) => {
    const original = normalizeText(sample?.text ?? sample, 20_000);
    const shouldRedact = sample?.redact !== false;
    const text = shouldRedact ? redactText(original) : original;
    const id = normalizeText(sample?.id, 100) || `sample-${index + 1}`;
    const language = detectLanguage(text);
    const canonical = canonicalText(text);
    const duplicateOf = canonical && seen.get(hashText(canonical));
    if (canonical && !duplicateOf) seen.set(hashText(canonical), id);
    const sampleLanguage = language.abstained && words(text).length >= 8 && language.confidence < .12 ? "unsupported" : language.code;
    const sampleProseScore = proseScore(text);
    const exclusionReason: NormalizedSample["exclusionReason"] = !text
      ? "empty"
      : sample?.consentGranted === false
        ? "consent"
        : sample?.heldOut === true
          ? "held-out"
          : duplicateOf
            ? "duplicate"
            : sampleLanguage === "unsupported"
              ? "unsupported-language"
              : sampleProseScore < .15
                ? "non-prose"
                : undefined;
    return {
      id,
      label: normalizeText(sample?.label, 160) || normalizeText(sample?.id, 100) || `Sample ${index + 1}`,
      text,
      register: REGISTER_NAMES.includes(sample?.register as RegisterName) ? sample.register as RegisterName : "default",
      permission: ["owned", "licensed", "authorized", "unknown"].includes(sample?.permission || "") ? sample.permission as SourcePermission : "owned",
      consentGranted: sample?.consentGranted !== false,
      rightsNote: normalizeText(sample?.rightsNote, 500),
      redacted: shouldRedact && redactText(original) !== original,
      heldOut: sample?.heldOut === true,
      sourcePath: normalizeText(sample?.sourcePath, 500),
      format: sample?.format || "unknown",
      language: sampleLanguage,
      languageConfidence: language.confidence,
      proseScore: sampleProseScore,
      duplicateOf,
      exclusionReason
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
  const thirdPersonCount = (lower.match(/\b(?:he|she|they|them|their|his|her|its)\b/g) || []).length;
  const functionWordCount = tokenList.filter((word) => FUNCTION_WORDS.has(word.toLowerCase())).length;
  const hedgingCount = tokenList.filter((word) => HEDGING_WORDS.has(word.toLowerCase())).length;
  const lowercaseStartCount = sentenceList.filter((sentence) => /^[a-z]/.test(sentence.text)).length;
  const bulletCount = (corpus.match(/(?:^|\n)\s*(?:[-*+]\s|\d+[.)]\s)/gm) || []).length;
  const headingCount = (corpus.match(/(?:^|\n)\s*#{1,6}\s+/gm) || []).length;
  const markdownCount = (corpus.match(/(?:^|\n)\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s)|\*\*|`/gm) || []).length;
  const commaCount = (corpus.match(/,/g) || []).length;
  const semicolonCount = (corpus.match(/;/g) || []).length;
  const colonCount = (corpus.match(/:/g) || []).length;
  const parentheticalCount = (corpus.match(/[()]/g) || []).length;
  const uniqueWords = new Set(tokenList.map((word) => word.toLowerCase())).size;
  const repeatedOpeners = openerCounts(sentenceList).filter((entry) => entry.count > 1).reduce((total, entry) => total + entry.count, 0);
  const sentenceWordPercentiles = { p25: percentile(sentenceLengths, .25), p50: percentile(sentenceLengths, .5), p75: percentile(sentenceLengths, .75), p90: percentile(sentenceLengths, .9) };
  const paragraphWordPercentiles = { p25: percentile(paragraphLengths, .25), p50: percentile(paragraphLengths, .5), p75: percentile(paragraphLengths, .75), p90: percentile(paragraphLengths, .9) };
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
    thirdPersonRate: ratio(thirdPersonCount, tokenList.length),
    lowercaseStartRate: ratio(lowercaseStartCount, sentenceList.length),
    markdownRate: ratio(markdownCount, tokenList.length),
    repeatedOpeningRate: ratio(repeatedOpeners, sentenceList.length),
    questionRate: ratio(questionCount, sentenceList.length),
    exclamationRate: ratio(exclamationCount, sentenceList.length),
    emDashRate: ratio(emDashCount, tokenList.length),
    commaRate: ratio(commaCount, tokenList.length),
    semicolonRate: ratio(semicolonCount, tokenList.length),
    colonRate: ratio(colonCount, tokenList.length),
    parentheticalRate: ratio(parentheticalCount, tokenList.length),
    bulletRate: ratio(bulletCount, paragraphList.length),
    headingRate: ratio(headingCount, paragraphList.length),
    listRate: ratio(bulletCount, paragraphList.length),
    averageSentencesPerParagraph: ratio(sentenceList.length, paragraphList.length),
    sentenceLengthSpread: round(sentenceWordPercentiles.p90 - sentenceWordPercentiles.p25),
    paragraphLengthSpread: round(paragraphWordPercentiles.p90 - paragraphWordPercentiles.p25),
    sentenceWordPercentiles,
    paragraphWordPercentiles,
    openers: openerCounts(sentenceList),
    repeatedPhrases: repeatedPhrases(tokenList),
    fidelityScore
  });
}

function featureDefinitions(metrics: CorpusMetrics): Array<[string, string, number, string]> {
  return [
    ["sentence-p25", "Short sentence floor", metrics.sentenceWordPercentiles.p25, "words"],
    ["sentence-p50", "Median sentence length", metrics.sentenceWordPercentiles.p50, "words"],
    ["sentence-p75", "Upper sentence rhythm", metrics.sentenceWordPercentiles.p75, "words"],
    ["sentence-p90", "Long sentence ceiling", metrics.sentenceWordPercentiles.p90, "words"],
    ["sentence-spread", "Sentence rhythm spread", metrics.sentenceLengthSpread, "words"],
    ["paragraph-p25", "Short paragraph floor", metrics.paragraphWordPercentiles.p25, "words"],
    ["paragraph-p50", "Median paragraph length", metrics.paragraphWordPercentiles.p50, "words"],
    ["paragraph-p75", "Upper paragraph rhythm", metrics.paragraphWordPercentiles.p75, "words"],
    ["paragraph-p90", "Long paragraph ceiling", metrics.paragraphWordPercentiles.p90, "words"],
    ["paragraph-spread", "Paragraph rhythm spread", metrics.paragraphLengthSpread, "words"],
    ["sentences-per-paragraph", "Sentences per paragraph", metrics.averageSentencesPerParagraph, "ratio"],
    ["average-word-length", "Average word length", metrics.averageWordLength, "characters"],
    ["lexical-diversity", "Lexical diversity", metrics.uniqueWordRatio, "ratio"],
    ["function-words", "Function-word rate", metrics.functionWordRate, "ratio"],
    ["first-person", "First-person rate", metrics.firstPersonRate, "ratio"],
    ["direct-address", "Direct-address rate", metrics.directAddressRate, "ratio"],
    ["third-person", "Third-person rate", metrics.thirdPersonRate, "ratio"],
    ["hedging", "Hedging rate", metrics.hedgingRate, "ratio"],
    ["contractions", "Contraction rate", metrics.contractionRate, "ratio"],
    ["questions", "Question rate", metrics.questionRate, "ratio"],
    ["exclamations", "Exclamation rate", metrics.exclamationRate, "ratio"],
    ["em-dashes", "Em-dash rate", metrics.emDashRate, "ratio"],
    ["commas", "Comma rate", metrics.commaRate, "ratio"],
    ["semicolons", "Semicolon rate", metrics.semicolonRate, "ratio"],
    ["colons", "Colon rate", metrics.colonRate, "ratio"],
    ["parentheticals", "Parenthetical rate", metrics.parentheticalRate, "ratio"],
    ["lowercase-openings", "Lowercase sentence starts", metrics.lowercaseStartRate, "ratio"],
    ["markdown", "Markdown density", metrics.markdownRate, "per word"],
    ["bullets", "List-item rate", metrics.bulletRate, "ratio"],
    ["headings", "Heading rate", metrics.headingRate, "ratio"],
    ["lists", "List structure rate", metrics.listRate, "ratio"],
    ["repeated-openings", "Repeated opening rate", metrics.repeatedOpeningRate, "ratio"]
  ];
}

export function featureValue(metrics: CorpusMetrics, id: string): number {
  return featureDefinitions(metrics).find(([featureId]) => featureId === id)?.[2] || 0;
}

export { featureDefinitions };

function featureConfidence(sampleCount: number): EvidenceConfidence {
  return sampleCount >= 5 ? "high" : sampleCount >= 2 ? "medium" : "low";
}

function buildBands(register: RegisterName, registerSamples: NormalizedSample[], metrics: CorpusMetrics): FeatureBand[] {
  if (!registerSamples.length) return [];
  const valuesByFeature = new Map<string, number[]>();
  registerSamples.forEach((sample) => {
    const sampleMetrics = metricsForTexts([sample.text]);
    featureDefinitions(sampleMetrics).forEach(([id, , value]) => valuesByFeature.set(id, [...(valuesByFeature.get(id) || []), value]));
  });
  const coverage = Math.min(1, registerSamples.length / 5);
  return featureDefinitions(metrics).map(([id, label, value, unit]) => {
    const values = valuesByFeature.get(id) || [];
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = percentile(sorted, .25);
    const median = percentile(sorted, .5);
    const q3 = percentile(sorted, .75);
    const iqr = Math.max(0, q3 - q1);
    const rateLike = unit === "ratio" || unit === "per word";
    const margin = values.length > 1 ? Math.max(rateLike ? .02 : .5, iqr * .5) : Math.max(rateLike ? .05 : 1, Math.abs(median) * .15);
    const robustMin = q1 - Math.max(rateLike ? .04 : 1, iqr * 1.5);
    const robustMax = q3 + Math.max(rateLike ? .04 : 1, iqr * 1.5);
    const outlierCount = values.filter((sampleValue) => sampleValue < robustMin || sampleValue > robustMax).length;
    const targetMin = Math.max(0, round(q1 - margin));
    const targetMax = round(q3 + margin);
    const stability = round(clamp(1 - ratio(iqr, Math.max(.01, Math.abs(median) + margin))), 3);
    const uncertainty = round(Math.min(1, ratio(1, Math.sqrt(Math.max(1, values.length))) + ratio(outlierCount, Math.max(1, values.length)) * .5), 3);
    return {
      id,
      label,
      value: round(value),
      unit,
      targetMin,
      targetMax,
      coverage,
      confidence: featureConfidence(registerSamples.length),
      status: values.length ? "within" : "insufficient",
      detail: `${registerSamples.length} ${register === "default" ? "general" : register} sample${registerSamples.length === 1 ? "" : "s"}; robust target ${targetMin}–${targetMax} ${unit}; ${outlierCount} outlier${outlierCount === 1 ? "" : "s"}.`,
      sampleCount: values.length,
      outlierCount,
      stability,
      uncertainty
    };
  });
}

function registerAnalysis(register: RegisterName, registerSamples: NormalizedSample[]): RegisterAnalysis {
  const metrics = metricsForTexts(registerSamples.map((sample) => sample.text));
  return { register, sampleIds: registerSamples.map((sample) => sample.id), sampleCount: registerSamples.length, featureBands: buildBands(register, registerSamples, metrics), metrics };
}

function supportingSpan(sample: NormalizedSample, featureId: string): { excerpt: string; start: number; end: number } {
  const sentenceList = sentences(sample.text);
  const paragraphList = paragraphs(sample.text);
  const sentencePattern: Record<string, RegExp> = {
    contractions: /['’](?:m|re|ve|ll|d|s|t)\b/i,
    questions: /\?/,
    exclamations: /!/,
    "em-dashes": /[—–]/,
    commas: /,/,
    semicolons: /;/,
    colons: /:/,
    parentheticals: /[()]/,
    "first-person": /\b(?:i|we|my|our|me|us)\b/i,
    "direct-address": /\b(?:you|your|yours)\b/i,
    "third-person": /\b(?:he|she|they|them|their|his|her|its)\b/i,
    hedging: new RegExp(`\\b(?:${[...HEDGING_WORDS].join("|")})\\b`, "i"),
    "lowercase-openings": /^[a-z]/
  };
  let candidate = sentenceList.find((sentence) => sentencePattern[featureId]?.test(sentence.text));
  if (!candidate && featureId.startsWith("paragraph-")) candidate = [...paragraphList].sort((a, b) => a.text.length - b.text.length)[0];
  if (!candidate && featureId === "sentence-p25") candidate = [...sentenceList].sort((a, b) => a.text.length - b.text.length)[0];
  if (!candidate && featureId === "sentence-p90") candidate = [...sentenceList].sort((a, b) => b.text.length - a.text.length)[0];
  candidate ||= sentenceList[0] || paragraphList[0] || { text: sample.text.slice(0, 280), start: 0, end: Math.min(sample.text.length, 280) };
  return { excerpt: normalizeText(candidate.text, 800), start: candidate.start, end: candidate.end };
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
    characterCount: sample.text.length,
    sourcePath: sample.sourcePath,
    format: sample.format || "unknown",
    language: sample.language,
    languageConfidence: sample.languageConfidence,
    proseScore: round(sample.proseScore, 3),
    included: !sample.exclusionReason && sample.consentGranted && !sample.heldOut,
    exclusionReason: sample.exclusionReason,
    duplicateOf: sample.duplicateOf
  };
}

function summarizeLanguage(samples: NormalizedSample[]): LanguageSummary {
  const eligible = samples.filter((sample) => sample.consentGranted && !sample.heldOut && !sample.duplicateOf && sample.text);
  const english = eligible.filter((sample) => sample.language === "en").length;
  if (!eligible.length) return { code: "und", label: "Undetermined", confidence: 0, abstained: true };
  const confidence = round(ratio(english, eligible.length), 3);
  if (confidence >= .7) return { code: "en", label: "English", confidence, abstained: false };
  return { code: "und", label: "Mixed or undetermined", confidence: round(1 - Math.abs(.5 - confidence), 3), abstained: true };
}

function buildConflicts(registers: Record<RegisterName, RegisterAnalysis>, evidence: Array<{ id: string; featureId?: string; register: RegisterName }>): EvidenceConflict[] {
  const conflicts: EvidenceConflict[] = [];
  const populated = REGISTER_NAMES.filter((register) => registers[register].sampleCount >= 2);
  const featureIds = new Set(populated.flatMap((register) => registers[register].featureBands.map((band) => band.id)));
  [...featureIds].forEach((featureId) => {
    const bands = populated.map((register) => ({ register, band: registers[register].featureBands.find((candidate) => candidate.id === featureId) })).filter((entry): entry is { register: RegisterName; band: FeatureBand } => Boolean(entry.band));
    if (bands.length < 2) return;
    const centers = bands.map(({ band }) => (band.targetMin + band.targetMax) / 2);
    const spread = Math.max(...centers) - Math.min(...centers);
    const unit = bands[0].band.unit;
    const threshold = unit === "ratio" || unit === "per word" ? .12 : 3;
    if (spread <= threshold) return;
    const registersForConflict = bands.map(({ register }) => register);
    const evidenceIds = evidence.filter((item) => item.featureId === featureId && registersForConflict.includes(item.register)).map((item) => item.id);
    conflicts.push({
      id: `conflict-${hashText(`${featureId}|${registersForConflict.join("|")}`)}`,
      featureId,
      message: `${featureId} differs materially between ${registersForConflict.join(" and ")}; keep this rule register-specific instead of applying it globally.`,
      severity: "warning",
      evidenceIds,
      registers: registersForConflict
    });
  });
  return conflicts.slice(0, 12);
}

export function analyzeCorpus(samples: CorpusSampleInput[] = []): CorpusAnalysis {
  const normalizedSamples = normalizeSamples(samples);
  const rejected = normalizedSamples.filter((sample) => !sample.consentGranted);
  const duplicates = normalizedSamples.filter((sample) => Boolean(sample.duplicateOf));
  const unsupported = normalizedSamples.filter((sample) => sample.language === "unsupported");
  const usable = normalizedSamples.filter((sample) => sample.consentGranted && !sample.heldOut && !sample.duplicateOf && sample.language !== "unsupported" && !sample.exclusionReason);
  const corpus = usable.map((sample) => sample.text).join("\n\n");
  const contaminationMatches = INJECTION_PATTERNS.flatMap((pattern) => normalizedSamples
    .filter((sample) => pattern.test(sample.text))
    .map((sample) => ({ sampleId: sample.id, pattern: pattern.source })));
  const repeatedLineCount = usable.reduce((count, sample) => {
    const lines = sample.text.split(/\n/).map((line) => line.trim().toLowerCase()).filter(Boolean);
    return count + lines.length - new Set(lines).size;
  }, 0);
  const fidelityScore = Math.max(0, Math.min(1, 0.3 + Math.min(usable.length, 5) * .1 + Math.min(words(corpus).length / 1_500, .3) - (contaminationMatches.length ? .35 : 0) - Math.min(repeatedLineCount / 20, .15) - rejected.length * .15 - duplicates.length * .04));
  const metrics = metricsForTexts(usable.map((sample) => sample.text), round(fidelityScore));
  const language = summarizeLanguage(normalizedSamples);
  const issues: CorpusAnalysis["issues"] = [];
  if (rejected.length) issues.push({ id: "permission-required", severity: "error", message: `${rejected.length} sample${rejected.length === 1 ? " lacks" : "s lack"} consent and was excluded from analysis.` });
  if (duplicates.length) issues.push({ id: "duplicate-samples", severity: "warning", message: `${duplicates.length} duplicate sample${duplicates.length === 1 ? " was" : "s were"} excluded from confidence scoring.` });
  if (unsupported.length) issues.push({ id: "unsupported-language", severity: "warning", message: `${unsupported.length} sample${unsupported.length === 1 ? " uses" : "s use"} a language the local English heuristics cannot measure confidently.` });
  if (language.abstained && usable.length) issues.push({ id: "language-uncertain", severity: "warning", message: "Language detection abstained or found mixed language; measurements are directional and should be reviewed." });
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
  const addRule = (register: RegisterName, samplesForRegister: NormalizedSample[], featureId: string, condition: boolean, claim: string, matchingSamples: NormalizedSample[], confidence: EvidenceConfidence = "medium"): void => {
    if (!condition || !matchingSamples.length) return;
    const supports = matchingSamples.map((sample) => {
      const support = supportingSpan(sample, featureId);
      return { sampleId: sample.id, sourceId: sample.id, excerpt: support.excerpt, span: { start: support.start, end: support.end } };
    });
    const support = supports[0];
    evidence.push(createEvidence({
      sourceType: "corpus",
      sourceRef: matchingSamples.map((sample) => sample.label).join(", "),
      sourceId: matchingSamples[0].id,
      featureId,
      sampleIds: matchingSamples.map((sample) => sample.id),
      span: support.span,
      supports,
      coverage: ratio(matchingSamples.length, samplesForRegister.length),
      scope: register === "default" ? "global" : "register",
      permission: matchingSamples[0].permission,
      rightsNote: matchingSamples[0].rightsNote,
      register,
      claim,
      excerpt: support.excerpt,
      confidence
    }));
  };
  const populatedRegisters = REGISTER_NAMES.filter((register) => registerGroups[register].length > 0);
  populatedRegisters.forEach((register) => {
    const registerSamples = registerGroups[register];
    const registerMetrics = registerAnalyses[register].metrics;
    const sampleMetrics = (predicate: (metrics: CorpusMetrics) => boolean): NormalizedSample[] => registerSamples.filter((sample) => predicate(metricsForTexts([sample.text])));
    addRule(register, registerSamples, "contractions", registerMetrics.contractionRate > 0, "Use contractions when they sound natural.", sampleMetrics((sampleMetricsForText) => sampleMetricsForText.contractionRate > 0), registerMetrics.contractionRate > .01 ? "high" : "medium");
    addRule(register, registerSamples, "paragraph-p50", registerMetrics.averageParagraphWords > 0 && registerMetrics.averageParagraphWords <= 70, "Keep paragraphs focused and relatively short.", sampleMetrics((sampleMetricsForText) => sampleMetricsForText.averageParagraphWords > 0 && sampleMetricsForText.averageParagraphWords <= 70), registerMetrics.averageParagraphWords <= 45 ? "high" : "medium");
    addRule(register, registerSamples, "lexical-diversity", registerMetrics.uniqueWordRatio < .65, "Prefer specific, familiar language over unnecessary abstraction.", registerSamples, "low");
    addRule(register, registerSamples, "questions", registerMetrics.questionCount > 0, "Use occasional questions when they help the reader think or orient themselves.", sampleMetrics((sampleMetricsForText) => sampleMetricsForText.questionCount > 0));
    addRule(register, registerSamples, "exclamations", registerMetrics.exclamationCount > 0, "Use exclamation marks sparingly and only when the energy is intentional.", sampleMetrics((sampleMetricsForText) => sampleMetricsForText.exclamationCount > 0), "low");
    addRule(register, registerSamples, "direct-address", registerMetrics.directAddressRate > .01, "Address the reader directly when the context calls for it.", sampleMetrics((sampleMetricsForText) => sampleMetricsForText.directAddressRate > .01), registerMetrics.directAddressRate > .03 ? "high" : "medium");
    addRule(register, registerSamples, "first-person", registerMetrics.firstPersonRate > .01, "Use a grounded first-person point of view where it adds accountability or warmth.", sampleMetrics((sampleMetricsForText) => sampleMetricsForText.firstPersonRate > .01), registerMetrics.firstPersonRate > .03 ? "high" : "medium");
    addRule(register, registerSamples, "hedging", registerMetrics.hedgingRate > .01, "Use careful qualifiers when the evidence or context calls for them.", sampleMetrics((sampleMetricsForText) => sampleMetricsForText.hedgingRate > .01), "low");
    addRule(register, registerSamples, "lowercase-openings", registerMetrics.lowercaseStartRate > .1, "Preserve lowercase openings when they are part of the writer's natural rhythm.", sampleMetrics((sampleMetricsForText) => sampleMetricsForText.lowercaseStartRate > .1), "medium");
    addRule(register, registerSamples, "repeated-openings", registerMetrics.repeatedOpeningRate > .2, "Vary sentence openings unless repetition is doing useful structural work.", sampleMetrics((sampleMetricsForText) => sampleMetricsForText.repeatedOpeningRate > .2), "low");
  });
  const conflicts = buildConflicts(registerAnalyses, evidence);
  if (conflicts.length) issues.push({ id: "register-conflicts", severity: "warning", message: `${conflicts.length} register-specific measurement conflict${conflicts.length === 1 ? "" : "s"} need review.` });

  return {
    analysisVersion: ANALYSIS_VERSION,
    samples: normalizedSamples.map(sampleSummary),
    metrics,
    registers: registerAnalyses,
    heldOutSampleIds: normalizedSamples.filter((sample) => sample.heldOut).map((sample) => sample.id),
    issues,
    contaminationMatches,
    evidence,
    conflicts,
    language,
    dedupedSampleIds: duplicates.map((sample) => sample.id)
  };
}

export function applyCorpusAnalysis(profile: VoiceprintProfile, analysis: CorpusAnalysis, options: { now?: string } = {}): VoiceprintProfile {
  return applyCorpusAnalysisToProfile(profile, analysis, options);
}

export { INJECTION_PATTERNS };
