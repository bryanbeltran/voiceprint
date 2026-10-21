import {
  LEGACY_PROFILE_SCHEMA_VERSION,
  PREVIOUS_PROFILE_SCHEMA_VERSION,
  PROFILE_SCHEMA_VERSION,
  REGISTER_NAMES,
  type BuildProfileOptions,
  type EvidenceConfidence,
  type EvidenceDecisionPatch,
  type EvidenceSupport,
  type EvidenceScope,
  type EvidenceSourceType,
  type EvidenceStatus,
  type InterviewAnswers,
  type RegisterDefinition,
  type RegisterName,
  type CorpusMetrics,
  type FeatureBand,
  type LanguageSummary,
  type RegisterAnalysis,
  type SourcePermission,
  type ValidationResult,
  type VoiceprintEvidence,
  type VoiceprintProfile
} from "../types";

const nowIso = (): string => new Date().toISOString();

export function normalizeText(value: unknown, maxLength = 12_000): string {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, maxLength)
    .trim();
}

export function hashText(value: unknown): string {
  let hash = 2_166_136_261;
  for (const character of String(value ?? "")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "on" || value === "true" || value === 1 || value === "1") return true;
  if (value === "off" || value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function slugify(value: unknown, fallback = "my-voice"): string {
  return normalizeText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function firstSentence(value: unknown): string {
  const normalized = normalizeText(value, 280);
  return normalized.split(/(?<=[.!?])\s+/)[0] || normalized;
}

const EMPTY_PERCENTILES = { p25: 0, p50: 0, p75: 0, p90: 0 };

const EMPTY_LANGUAGE: LanguageSummary = {
  code: "und",
  label: "Undetermined",
  confidence: 0,
  abstained: true
};

export function normalizeCorpusMetrics(input: Partial<CorpusMetrics> = {}): CorpusMetrics {
  return {
    sampleCount: Number(input.sampleCount) || 0,
    wordCount: Number(input.wordCount) || 0,
    sentenceCount: Number(input.sentenceCount) || 0,
    paragraphCount: Number(input.paragraphCount) || 0,
    averageSentenceWords: Number(input.averageSentenceWords) || 0,
    averageParagraphWords: Number(input.averageParagraphWords) || 0,
    averageWordLength: Number(input.averageWordLength) || 0,
    uniqueWordRatio: Number(input.uniqueWordRatio) || 0,
    contractionRate: Number(input.contractionRate) || 0,
    emDashCount: Number(input.emDashCount) || 0,
    questionCount: Number(input.questionCount) || 0,
    exclamationCount: Number(input.exclamationCount) || 0,
    firstPersonRate: Number(input.firstPersonRate) || 0,
    directAddressRate: Number(input.directAddressRate) || 0,
    functionWordRate: Number(input.functionWordRate) || 0,
    hedgingRate: Number(input.hedgingRate) || 0,
    thirdPersonRate: Number(input.thirdPersonRate) || 0,
    lowercaseStartRate: Number(input.lowercaseStartRate) || 0,
    markdownRate: Number(input.markdownRate) || 0,
    repeatedOpeningRate: Number(input.repeatedOpeningRate) || 0,
    questionRate: Number(input.questionRate) || 0,
    exclamationRate: Number(input.exclamationRate) || 0,
    emDashRate: Number(input.emDashRate) || 0,
    commaRate: Number(input.commaRate) || 0,
    semicolonRate: Number(input.semicolonRate) || 0,
    colonRate: Number(input.colonRate) || 0,
    parentheticalRate: Number(input.parentheticalRate) || 0,
    bulletRate: Number(input.bulletRate) || 0,
    headingRate: Number(input.headingRate) || 0,
    listRate: Number(input.listRate) || 0,
    averageSentencesPerParagraph: Number(input.averageSentencesPerParagraph) || 0,
    sentenceLengthSpread: Number(input.sentenceLengthSpread) || 0,
    paragraphLengthSpread: Number(input.paragraphLengthSpread) || 0,
    sentenceWordPercentiles: { ...EMPTY_PERCENTILES, ...(input.sentenceWordPercentiles || {}) },
    paragraphWordPercentiles: { ...EMPTY_PERCENTILES, ...(input.paragraphWordPercentiles || {}) },
    openers: Array.isArray(input.openers) ? input.openers.slice(0, 20) : [],
    repeatedPhrases: Array.isArray(input.repeatedPhrases) ? input.repeatedPhrases.slice(0, 20) : [],
    fidelityScore: Number(input.fidelityScore) || 0
  };
}

function emptyRegisterAnalysis(register: RegisterName, metrics: Partial<CorpusMetrics> = {}): RegisterAnalysis {
  return { register, sampleIds: [], sampleCount: 0, featureBands: [], metrics: normalizeCorpusMetrics(metrics) };
}

function normalizeRegisterAnalyses(input: unknown, metrics: Partial<CorpusMetrics> = {}): Record<RegisterName, RegisterAnalysis> {
  const source = input && typeof input === "object" ? input as Partial<Record<RegisterName, Partial<RegisterAnalysis>>> : {};
  return REGISTER_NAMES.reduce<Record<RegisterName, RegisterAnalysis>>((result, register) => {
    const candidate = source[register];
    result[register] = {
      ...emptyRegisterAnalysis(register, metrics),
      ...(candidate || {}),
      register,
      sampleIds: Array.isArray(candidate?.sampleIds) ? candidate.sampleIds.map((id) => normalizeText(id, 120)) : [],
      sampleCount: Number(candidate?.sampleCount) || 0,
      metrics: normalizeCorpusMetrics(candidate?.metrics || metrics),
      featureBands: Array.isArray(candidate?.featureBands) ? candidate.featureBands.filter(Boolean).map((band) => normalizeFeatureBand(band as Partial<FeatureBand>)) : []
    };
    return result;
  }, {} as Record<RegisterName, RegisterAnalysis>);
}

function normalizeFeatureBand(input: Partial<FeatureBand> = {}): FeatureBand {
  const status: FeatureBand["status"] = ["within", "low", "high", "insufficient"].includes(input.status || "")
    ? input.status as FeatureBand["status"]
    : "insufficient";
  const confidence: EvidenceConfidence = ["low", "medium", "high"].includes(input.confidence || "")
    ? input.confidence as EvidenceConfidence
    : "low";
  return {
    id: normalizeText(input.id, 120),
    label: normalizeText(input.label, 160),
    value: Number(input.value) || 0,
    unit: normalizeText(input.unit, 40),
    targetMin: Number(input.targetMin) || 0,
    targetMax: Number(input.targetMax) || 0,
    coverage: Math.min(1, Math.max(0, Number(input.coverage) || 0)),
    confidence,
    status,
    detail: normalizeText(input.detail, 500),
    sampleCount: Math.max(0, Number(input.sampleCount) || 0),
    outlierCount: Math.max(0, Number(input.outlierCount) || 0),
    stability: Math.min(1, Math.max(0, Number(input.stability) || 0)),
    uncertainty: Math.max(0, Number(input.uncertainty) || 0)
  };
}

function defaultRegister(label = "Default"): RegisterDefinition {
  return {
    label,
    purpose: "General writing in the writer’s natural voice.",
    tone: "warm and human",
    rules: [],
    fallbackTo: "default"
  };
}

export function stableStringify(value: unknown, space = 2): string {
  const sortKeys = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortKeys);
    if (input && typeof input === "object") {
      return Object.keys(input as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((result, key) => {
          result[key] = sortKeys((input as Record<string, unknown>)[key]);
          return result;
        }, {});
    }
    return input;
  };
  return JSON.stringify(sortKeys(value), null, space);
}

export function createEvidence(input: Partial<VoiceprintEvidence> & { claim?: string } = {}): VoiceprintEvidence {
  const normalizedClaim = normalizeText(input.claim, 500);
  const normalizedExcerpt = normalizeText(input.excerpt, 800);
  const sourceType: EvidenceSourceType = ["interview", "corpus", "manual", "edit"].includes(input.sourceType ?? "")
    ? (input.sourceType as EvidenceSourceType)
    : "manual";
  const register: RegisterName = REGISTER_NAMES.includes(input.register as RegisterName)
    ? (input.register as RegisterName)
    : "default";
  const confidence: EvidenceConfidence = ["low", "medium", "high"].includes(input.confidence ?? "")
    ? (input.confidence as EvidenceConfidence)
    : "medium";
  const status: EvidenceStatus = ["pending", "approved", "rejected"].includes(input.status ?? "")
    ? (input.status as EvidenceStatus)
    : "pending";
  const sourceRef = normalizeText(input.sourceRef, 160);
  const sourceId = normalizeText(input.sourceId, 160) || sourceRef;
  const sampleIds = Array.isArray(input.sampleIds)
    ? input.sampleIds.map((id) => normalizeText(id, 120)).filter(Boolean)
    : (sourceId ? [sourceId] : []);
  const span = input.span && Number.isFinite(input.span.start) && Number.isFinite(input.span.end)
    ? { start: Math.max(0, Number(input.span.start)), end: Math.max(0, Number(input.span.end)) }
    : null;
  const supports: EvidenceSupport[] = Array.isArray(input.supports)
    ? input.supports.slice(0, 32).map((support) => ({
      sampleId: normalizeText(support.sampleId, 120),
      sourceId: normalizeText(support.sourceId, 160),
      excerpt: normalizeText(support.excerpt, 800),
      span: support.span && Number.isFinite(support.span.start) && Number.isFinite(support.span.end)
        ? { start: Math.max(0, Number(support.span.start)), end: Math.max(0, Number(support.span.end)) }
        : null
    })).filter((support) => support.sampleId || support.sourceId || support.excerpt)
    : [];
  const scope: EvidenceScope = input.scope === "global" ? "global" : "register";
  const permissionValues: SourcePermission[] = ["owned", "licensed", "authorized", "unknown"];
  const permission: SourcePermission = permissionValues.includes(input.permission as SourcePermission)
    ? input.permission as SourcePermission
    : "owned";
  const evidenceId = normalizeText(input.id, 120) ||
    `evidence-${hashText([sourceType, sourceRef, register, normalizedClaim, normalizedExcerpt].join("|"))}`;
  return {
    id: evidenceId,
    claim: normalizedClaim,
    excerpt: normalizedExcerpt,
    sourceType,
    sourceRef,
    sourceId,
    featureId: normalizeText(input.featureId, 120) || undefined,
    sampleIds,
    span,
    supports,
    coverage: Math.min(1, Math.max(0, Number(input.coverage) || 0)),
    scope,
    permission,
    rightsNote: normalizeText(input.rightsNote, 500),
    register,
    confidence,
    status,
    createdAt: input.createdAt || nowIso()
  };
}

function interviewEvidence(answers: InterviewAnswers, now: string): VoiceprintEvidence[] {
  const definitions: Array<[string, string, string]> = [
    ["tone", answers.tone, "The leading quality should be ${value}."],
    ["energy", answers.energyLabel, "The desired energy is ${value}."],
    ["formality", answers.formalityLabel, "The preferred formality is ${value}."],
    ["feel", answers.feel, "Readers should feel ${value}."],
    ["include", answers.include, "The writing should make room for ${value}."],
    ["never", answers.never, "The writing should avoid sounding ${value}."],
    ["sample", answers.sample, "The supplied writing sample is a source for later refinement."]
  ];
  return definitions
    .filter(([, value]) => normalizeText(value))
    .map(([sourceRef, value, template]) => createEvidence({
      sourceType: "interview",
      sourceRef,
      sourceId: `interview-${sourceRef}`,
      sampleIds: [],
      scope: "global",
      coverage: 1,
      permission: "owned",
      claim: template.replace("${value}", normalizeText(value, 240)),
      excerpt: sourceRef === "sample" ? firstSentence(value) : normalizeText(value, 240),
      confidence: sourceRef === "sample" ? "low" : "medium",
      createdAt: now
    }));
}

export function buildProfileFromInterview(
  answers: Partial<InterviewAnswers> = {},
  options: BuildProfileOptions = {}
): VoiceprintProfile {
  const now = options.now || nowIso();
  const normalized: InterviewAnswers = {
    fullName: normalizeText(answers.fullName, 120) || "Your name",
    role: normalizeText(answers.role, 180) || "Your role",
    audience: normalizeText(answers.audience, 220) || "the people you write for",
    sample: normalizeText(answers.sample, 12_000),
    tone: normalizeText(answers.tone, 80) || "warm and human",
    energyLabel: normalizeText(answers.energyLabel, 80) || "steady",
    formalityLabel: normalizeText(answers.formalityLabel, 80) || "relaxed",
    feel: normalizeText(answers.feel, 240) || "understood, not managed",
    never: normalizeText(answers.never, 240) || "generic, inflated, or overly polished",
    include: normalizeText(answers.include, 240) || "a clear point of view and concrete details",
    signOff: normalizeText(answers.signOff, 180),
    contractions: toBoolean(answers.contractions, true),
    shortParagraphs: toBoolean(answers.shortParagraphs, true),
    plainLanguage: toBoolean(answers.plainLanguage, true),
    emDash: toBoolean(answers.emDash, false)
  };
  const registers = REGISTER_NAMES.reduce<Record<RegisterName, RegisterDefinition>>((result, name) => {
    const label = name === "default" ? "Default" : `${name[0].toUpperCase()}${name.slice(1)}`;
    result[name] = { ...defaultRegister(label), ...(options.registers?.[name] || {}) };
    return result;
  }, {} as Record<RegisterName, RegisterDefinition>);
  const evidence = interviewEvidence(normalized, now);
  const profile: VoiceprintProfile = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profileId: options.profileId || `profile-${hashText(`${normalized.fullName}|${normalized.role}`)}`,
    version: 1,
    createdAt: now,
    updatedAt: now,
    subject: { name: normalized.fullName, role: normalized.role, audience: normalized.audience },
    style: { tone: normalized.tone, energy: normalized.energyLabel, formality: normalized.formalityLabel },
    preferences: {
      readerFeeling: normalized.feel,
      reachFor: normalized.include,
      avoid: normalized.never,
      signOff: normalized.signOff,
      habits: {
        contractions: normalized.contractions,
        shortParagraphs: normalized.shortParagraphs,
        plainLanguage: normalized.plainLanguage,
        emDash: normalized.emDash
      },
      customRules: []
    },
    registers,
    evidence,
    provenance: {
      mode: "interview",
      sampleCount: normalized.sample ? 1 : 0,
      retainedRawText: false,
      corpusHash: normalized.sample ? hashText(normalized.sample) : null,
      analysisVersion: "local-heuristics-3",
      sources: []
    },
    review: { pendingCount: evidence.length, lastReviewedAt: null, conflicts: [] }
  };
  return validateProfile(profile).value;
}

export function mergeProfileFromInterview(next: VoiceprintProfile, previous?: VoiceprintProfile): VoiceprintProfile {
  if (!previous) return next;
  const merged = clone(next);
  const priorEvidence = new Map(previous.evidence.map((item) => [item.id, item]));
  merged.profileId = previous.profileId;
  merged.version = previous.version || merged.version;
  merged.createdAt = previous.createdAt || merged.createdAt;
  merged.registers = previous.registers || merged.registers;
  merged.preferences.customRules = previous.preferences.customRules || [];
  merged.evidence = merged.evidence.map((item) => priorEvidence.has(item.id)
    ? { ...item, ...priorEvidence.get(item.id), claim: item.claim || priorEvidence.get(item.id)?.claim || "" }
    : item);
  const nextIds = new Set(merged.evidence.map((item) => item.id));
  merged.evidence.push(...previous.evidence.filter((item) => item.sourceType !== "interview" && !nextIds.has(item.id)));
  if (previous.provenance.mode === "corpus") merged.provenance = { ...previous.provenance };
  merged.review.pendingCount = merged.evidence.filter((item) => item.status === "pending").length;
  return validateProfile(merged).value;
}

export function applyEvidenceDecision(
  profile: VoiceprintProfile,
  evidenceId: string,
  patch: EvidenceDecisionPatch = {},
  options: { now?: string } = {}
): VoiceprintProfile {
  const next = clone(profile);
  const item = next.evidence.find((entry) => entry.id === evidenceId);
  if (!item) return next;
  const requestedStatus: EvidenceStatus = ["pending", "approved", "rejected"].includes(patch.status || "")
    ? (patch.status as EvidenceStatus)
    : item.status;
  const requiresExplicitOverride = item.sourceType === "corpus" && (item.coverage < .5 || item.confidence === "low");
  const status: EvidenceStatus = requestedStatus === "approved" && requiresExplicitOverride && !patch.force ? "pending" : requestedStatus;
  item.status = status;
  if (patch.claim !== undefined) item.claim = normalizeText(patch.claim, 500);
  if (patch.register && REGISTER_NAMES.includes(patch.register)) item.register = patch.register;
  if (patch.excerpt !== undefined) item.excerpt = normalizeText(patch.excerpt, 800);
  if (patch.scope) item.scope = patch.scope;
  if (patch.rightsNote !== undefined) item.rightsNote = normalizeText(patch.rightsNote, 500);
  const customRules = next.preferences.customRules.filter((rule) => rule.sourceEvidenceId !== evidenceId);
  if (status === "approved" && item.claim) {
    customRules.push({
      id: `rule-${hashText(`${evidenceId}|${item.claim}|${item.register}`)}`,
      text: item.claim,
      register: item.register,
      sourceEvidenceId: evidenceId
    });
  }
  next.preferences.customRules = customRules;
  next.review.pendingCount = next.evidence.filter((entry) => entry.status === "pending").length;
  next.review.lastReviewedAt = options.now || nowIso();
  next.updatedAt = options.now || nowIso();
  return validateProfile(next).value;
}

export function sanitizeForPersistence(
  profile: VoiceprintProfile,
  options: { persistApprovedEvidence?: boolean } = {}
): VoiceprintProfile {
  const next = clone(profile);
  next.provenance = { ...next.provenance, retainedRawText: false };
  delete (next.provenance as Partial<typeof next.provenance> & { rawSamples?: unknown }).rawSamples;
  next.evidence = next.evidence.map((item) => ({
    ...item,
    excerpt: options.persistApprovedEvidence && item.status === "approved" ? item.excerpt : "",
    supports: (item.supports || []).map((support) => ({
      ...support,
      excerpt: options.persistApprovedEvidence && item.status === "approved" ? support.excerpt : ""
    }))
  }));
  next.provenance.sources = (next.provenance.sources || []).map((source) => ({
    ...source,
    rightsNote: normalizeText(source.rightsNote, 500)
  }));
  return next;
}

export function migrateProfile(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const source = clone(input) as Partial<VoiceprintProfile> & Record<string, unknown>;
  const schemaVersion = (source as Record<string, unknown>).schemaVersion;
  if (schemaVersion !== LEGACY_PROFILE_SCHEMA_VERSION && schemaVersion !== PREVIOUS_PROFILE_SCHEMA_VERSION) return source;
  const oldAnalysis = source.review && typeof source.review === "object"
    ? (source.review as Partial<VoiceprintProfile["review"]>).analysis
    : undefined;
  const oldMetrics = oldAnalysis?.metrics || {};
  source.schemaVersion = PROFILE_SCHEMA_VERSION;
  source.provenance = {
    ...(source.provenance as VoiceprintProfile["provenance"]),
    analysisVersion: source.provenance?.analysisVersion || "local-heuristics-1",
    sources: source.provenance?.sources || []
  };
  if (Array.isArray(source.evidence)) source.evidence = source.evidence.map((item) => createEvidence(item as Partial<VoiceprintEvidence>));
  if (oldAnalysis) {
    source.review = {
      ...(source.review as VoiceprintProfile["review"]),
      analysis: {
        metrics: normalizeCorpusMetrics(oldMetrics),
        registers: oldAnalysis.registers || normalizeRegisterAnalyses(undefined, oldMetrics),
        sources: oldAnalysis.sources || source.provenance?.sources || [],
        heldOutSampleIds: [],
        issues: oldAnalysis.issues || [],
        contaminationMatches: oldAnalysis.contaminationMatches || [],
        conflicts: oldAnalysis.conflicts || [],
        language: oldAnalysis.language || EMPTY_LANGUAGE,
        dedupedSampleIds: oldAnalysis.dedupedSampleIds || []
      }
    };
  }
  source.schemaVersion = PROFILE_SCHEMA_VERSION;
  if (source.review && typeof source.review === "object") {
    const review = source.review as VoiceprintProfile["review"];
    review.conflicts = Array.isArray(review.conflicts) ? review.conflicts : [];
  }
  return source;
}

export function validateProfile(input: unknown): ValidationResult {
  const source = input && typeof input === "object" ? input : {};
  const value = clone(source) as Partial<VoiceprintProfile> & Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (value.schemaVersion !== PROFILE_SCHEMA_VERSION) errors.push(`Unsupported schema version: ${value.schemaVersion || "missing"}`);
  for (const key of ["profileId", "subject", "style", "preferences", "registers", "evidence", "provenance", "review"]) {
    if (value[key] === undefined || value[key] === null) errors.push(`Missing required field: ${key}`);
  }
  if (value.subject && !(value.subject as VoiceprintProfile["subject"]).name) warnings.push("Profile has no subject name.");
  if (value.evidence && !Array.isArray(value.evidence)) errors.push("evidence must be an array");
  if (Array.isArray(value.evidence)) value.evidence = value.evidence.filter(Boolean).map((item) => createEvidence(item as Partial<VoiceprintEvidence>));
  if (value.registers && typeof value.registers === "object") {
    for (const name of REGISTER_NAMES) {
      const registers = value.registers as Partial<Record<RegisterName, Partial<RegisterDefinition>>>;
      registers[name] = { ...defaultRegister(name), ...(registers[name] || {}) };
    }
  }
  if (value.provenance && typeof value.provenance === "object") {
    const provenance = value.provenance as VoiceprintProfile["provenance"];
    provenance.sources = Array.isArray(provenance.sources) ? provenance.sources.filter(Boolean).map((source) => ({
      ...source,
      sourcePath: normalizeText(source.sourcePath, 500) || undefined,
      format: source.format || "unknown",
      language: normalizeText(source.language, 20) || undefined,
      languageConfidence: Math.min(1, Math.max(0, Number(source.languageConfidence) || 0)),
      proseScore: Math.min(1, Math.max(0, Number(source.proseScore) || 0)),
      included: source.included !== false
    })) : [];
    provenance.analysisVersion = normalizeText(provenance.analysisVersion, 120) || "local-heuristics-3";
  }
  if (value.review && typeof value.review === "object" && value.review.analysis) {
    const analysis = value.review.analysis;
    analysis.metrics = normalizeCorpusMetrics(analysis.metrics);
    analysis.registers = normalizeRegisterAnalyses(analysis.registers, analysis.metrics);
    analysis.sources = Array.isArray(analysis.sources) ? analysis.sources : [];
    analysis.heldOutSampleIds = Array.isArray(analysis.heldOutSampleIds) ? analysis.heldOutSampleIds : [];
    if (analysis.heldOutEvaluation === undefined) analysis.heldOutEvaluation = null;
    analysis.conflicts = Array.isArray(analysis.conflicts) ? analysis.conflicts : [];
    analysis.language = analysis.language && typeof analysis.language === "object"
      ? {
        code: normalizeText(analysis.language.code, 20) || "und",
        label: normalizeText(analysis.language.label, 80) || "Undetermined",
        confidence: Math.min(1, Math.max(0, Number(analysis.language.confidence) || 0)),
        abstained: Boolean(analysis.language.abstained)
      }
      : EMPTY_LANGUAGE;
    analysis.dedupedSampleIds = Array.isArray(analysis.dedupedSampleIds) ? analysis.dedupedSampleIds : [];
  }
  if (value.preferences && typeof value.preferences === "object") {
    const preferences = value.preferences as VoiceprintProfile["preferences"];
    preferences.customRules = Array.isArray(preferences.customRules)
      ? preferences.customRules.filter((rule) => rule && normalizeText(rule.text)).map((rule) => ({
        ...rule,
        register: REGISTER_NAMES.includes(rule.register) ? rule.register : "default"
      }))
      : [];
    preferences.habits = {
      contractions: toBoolean(preferences.habits?.contractions, true),
      shortParagraphs: toBoolean(preferences.habits?.shortParagraphs, true),
      plainLanguage: toBoolean(preferences.habits?.plainLanguage, true),
      emDash: toBoolean(preferences.habits?.emDash, false)
    };
  }
  if (value.review && typeof value.review === "object") {
    value.review.conflicts = Array.isArray(value.review.conflicts) ? value.review.conflicts : [];
  }
  if (errors.length) return { valid: false, errors, warnings, value: value as VoiceprintProfile };
  return { valid: true, errors, warnings, value: value as VoiceprintProfile };
}

export function createProfileVersion(profile: VoiceprintProfile, options: { now?: string; note?: string } = {}): VoiceprintProfile {
  const next = clone(profile);
  next.version = Math.max(1, Number(profile.version) || 1) + 1;
  next.updatedAt = options.now || nowIso();
  next.versionNote = normalizeText(options.note, 240) || "Profile refined";
  return validateProfile(next).value;
}

export function diffProfiles(before: VoiceprintProfile, after: VoiceprintProfile): { changed: boolean; sections: string[] } {
  const sections: Array<[string, keyof VoiceprintProfile]> = [
    ["subject", "subject"],
    ["style", "style"],
    ["preferences", "preferences"],
    ["registers", "registers"],
    ["evidence", "evidence"]
  ];
  const changed = sections
    .filter(([, key]) => stableStringify(before?.[key]) !== stableStringify(after?.[key]))
    .map(([label]) => label);
  return { changed: changed.length > 0, sections: changed };
}

export function exportProfile(profile: VoiceprintProfile): string {
  const checked = validateProfile(profile);
  if (!checked.valid) throw new Error(checked.errors.join("; "));
  return stableStringify(sanitizeForPersistence(checked.value, { persistApprovedEvidence: true }), 2);
}

export function importProfile(serialized: string | unknown): ValidationResult {
  let parsed: unknown;
  try {
    parsed = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
  } catch {
    return { valid: false, errors: ["The selected file is not valid JSON."], warnings: [], value: {} as VoiceprintProfile };
  }
  return validateProfile(migrateProfile(parsed));
}

export const DEFAULT_PROFILE = buildProfileFromInterview({
  fullName: "Your name",
  role: "Your role",
  audience: "the people you write for"
}, { now: "2026-01-01T00:00:00.000Z", profileId: "profile-default" });

export { slugify, toNumber };
