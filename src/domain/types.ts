export const PROFILE_SCHEMA_VERSION = "1.2.0" as const;
export const LEGACY_PROFILE_SCHEMA_VERSION = "1.0.0" as const;
export const PREVIOUS_PROFILE_SCHEMA_VERSION = "1.1.0" as const;
export const STORAGE_SCHEMA_VERSION = 1 as const;

export const REGISTER_NAMES = ["default", "email", "chat", "public", "technical"] as const;
export type RegisterName = (typeof REGISTER_NAMES)[number];

export const ADAPTER_TARGETS = ["universal", "codex", "claude", "chatgpt", "cursor", "gemini", "agent-skill"] as const;
export type AdapterTarget = (typeof ADAPTER_TARGETS)[number];

export type EvidenceStatus = "pending" | "approved" | "rejected";
export type EvidenceConfidence = "low" | "medium" | "high";
export type EvidenceSourceType = "interview" | "corpus" | "manual" | "edit";
export type EvidenceScope = "global" | "register";
export type SourcePermission = "owned" | "licensed" | "authorized" | "unknown";
export type FeatureStatus = "within" | "low" | "high" | "insufficient";
export type CorpusSourceFormat = "plain-text" | "markdown" | "html" | "json" | "unknown";

export interface EvidenceSpan {
  start: number;
  end: number;
}

export interface EvidenceSupport {
  sampleId: string;
  sourceId: string;
  excerpt: string;
  span: EvidenceSpan | null;
}

export interface CorpusSourceMetadata {
  id: string;
  label: string;
  register: RegisterName;
  permission: SourcePermission;
  consentGranted: boolean;
  rightsNote: string;
  redacted: boolean;
  wordCount: number;
  characterCount: number;
  heldOut: boolean;
  sourcePath?: string;
  format?: CorpusSourceFormat;
  language?: string;
  languageConfidence?: number;
  proseScore?: number;
  included?: boolean;
  exclusionReason?: CorpusSampleSummary["exclusionReason"];
  duplicateOf?: string;
}

export interface VoiceprintEvidence {
  id: string;
  claim: string;
  excerpt: string;
  sourceType: EvidenceSourceType;
  sourceRef: string;
  sourceId: string;
  featureId?: string;
  sampleIds: string[];
  span: EvidenceSpan | null;
  supports: EvidenceSupport[];
  coverage: number;
  scope: EvidenceScope;
  permission: SourcePermission;
  rightsNote: string;
  register: RegisterName;
  confidence: EvidenceConfidence;
  status: EvidenceStatus;
  createdAt: string;
}

export interface EvidenceConflict {
  id: string;
  featureId: string;
  message: string;
  severity: "warning" | "error";
  evidenceIds: string[];
  registers: RegisterName[];
}

export interface RegisterDefinition {
  label: string;
  purpose: string;
  tone: string;
  rules: string[];
  fallbackTo: RegisterName;
}

export interface WritingHabits {
  contractions: boolean;
  shortParagraphs: boolean;
  plainLanguage: boolean;
  emDash: boolean;
}

export interface CustomRule {
  id: string;
  text: string;
  register: RegisterName;
  sourceEvidenceId: string;
}

export interface VoiceprintProfile {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  profileId: string;
  version: number;
  versionNote?: string;
  createdAt: string;
  updatedAt: string;
  subject: {
    name: string;
    role: string;
    audience: string;
  };
  style: {
    tone: string;
    energy: string;
    formality: string;
  };
  preferences: {
    readerFeeling: string;
    reachFor: string;
    avoid: string;
    signOff: string;
    habits: WritingHabits;
    customRules: CustomRule[];
  };
  registers: Record<RegisterName, RegisterDefinition>;
  evidence: VoiceprintEvidence[];
  provenance: {
    mode: "interview" | "corpus";
    sampleCount: number;
    retainedRawText: false;
    corpusHash: string | null;
    analysisVersion: string;
    sources: CorpusSourceMetadata[];
  };
  review: {
    pendingCount: number;
    lastReviewedAt: string | null;
    analysis?: AnalysisSnapshot;
    conflicts?: EvidenceConflict[];
  };
}

export interface InterviewAnswers {
  fullName: string;
  role: string;
  audience: string;
  sample: string;
  tone: string;
  energyLabel: string;
  formalityLabel: string;
  feel: string;
  never: string;
  include: string;
  signOff: string;
  contractions: boolean;
  shortParagraphs: boolean;
  plainLanguage: boolean;
  emDash: boolean;
}

export interface BuildProfileOptions {
  now?: string;
  profileId?: string;
  registers?: Partial<Record<RegisterName, Partial<RegisterDefinition>>>;
}

export interface CorpusSampleInput {
  id?: string;
  text: string;
  label?: string;
  register?: RegisterName;
  permission?: SourcePermission;
  consentGranted?: boolean;
  rightsNote?: string;
  redact?: boolean;
  heldOut?: boolean;
  sourcePath?: string;
  format?: CorpusSourceFormat;
}

export interface CorpusSampleSummary {
  id: string;
  label: string;
  register: RegisterName;
  permission: SourcePermission;
  consentGranted: boolean;
  rightsNote: string;
  redacted: boolean;
  heldOut: boolean;
  wordCount: number;
  characterCount: number;
  sourcePath: string;
  format: CorpusSourceFormat;
  language: string;
  languageConfidence: number;
  proseScore: number;
  included: boolean;
  exclusionReason?: "consent" | "held-out" | "duplicate" | "non-prose" | "unsupported-language" | "empty";
  duplicateOf?: string;
}

export interface CorpusMetrics {
  sampleCount: number;
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  averageSentenceWords: number;
  averageParagraphWords: number;
  averageWordLength: number;
  uniqueWordRatio: number;
  contractionRate: number;
  emDashCount: number;
  questionCount: number;
  exclamationCount: number;
  firstPersonRate: number;
  directAddressRate: number;
  functionWordRate: number;
  hedgingRate: number;
  thirdPersonRate: number;
  lowercaseStartRate: number;
  markdownRate: number;
  repeatedOpeningRate: number;
  questionRate: number;
  exclamationRate: number;
  emDashRate: number;
  commaRate: number;
  semicolonRate: number;
  colonRate: number;
  parentheticalRate: number;
  bulletRate: number;
  headingRate: number;
  listRate: number;
  averageSentencesPerParagraph: number;
  sentenceLengthSpread: number;
  paragraphLengthSpread: number;
  sentenceWordPercentiles: { p25: number; p50: number; p75: number; p90: number };
  paragraphWordPercentiles: { p25: number; p50: number; p75: number; p90: number };
  openers: Array<{ token: string; count: number; rate: number }>;
  repeatedPhrases: Array<{ phrase: string; count: number }>;
  fidelityScore: number;
}

export interface FeatureBand {
  id: string;
  label: string;
  value: number;
  unit: string;
  targetMin: number;
  targetMax: number;
  coverage: number;
  confidence: EvidenceConfidence;
  status: FeatureStatus;
  detail: string;
  sampleCount: number;
  outlierCount: number;
  stability: number;
  uncertainty: number;
}

export interface RegisterAnalysis {
  register: RegisterName;
  sampleIds: string[];
  sampleCount: number;
  featureBands: FeatureBand[];
  metrics: CorpusMetrics;
}

export interface CorpusIssue {
  id: string;
  severity: "warning" | "error";
  message: string;
}

export interface ContaminationMatch {
  sampleId: string;
  pattern: string;
}

export interface CorpusAnalysis {
  analysisVersion: string;
  samples: CorpusSampleSummary[];
  metrics: CorpusMetrics;
  registers: Record<RegisterName, RegisterAnalysis>;
  heldOutSampleIds: string[];
  heldOutEvaluation?: HeldOutEvaluation | null;
  issues: CorpusIssue[];
  contaminationMatches: ContaminationMatch[];
  evidence: VoiceprintEvidence[];
  conflicts: EvidenceConflict[];
  language: LanguageSummary;
  dedupedSampleIds: string[];
}

export interface LanguageSummary {
  code: string;
  label: string;
  confidence: number;
  abstained: boolean;
}

export interface AnalysisSnapshot {
  metrics: CorpusMetrics;
  registers: Record<RegisterName, RegisterAnalysis>;
  sources: CorpusSourceMetadata[];
  heldOutSampleIds: string[];
  heldOutEvaluation?: HeldOutEvaluation | null;
  issues: CorpusIssue[];
  contaminationMatches: ContaminationMatch[];
  conflicts: EvidenceConflict[];
  language: LanguageSummary;
  dedupedSampleIds: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  value: VoiceprintProfile;
}

export interface EvidenceDecisionPatch {
  status?: EvidenceStatus;
  claim?: string;
  register?: RegisterName;
  excerpt?: string;
  supports?: EvidenceSupport[];
  scope?: EvidenceScope;
  rightsNote?: string;
  force?: boolean;
}

export interface EditLearningResult {
  register: RegisterName;
  changedFeatures: string[];
  suggestions: string[];
  beforeWordCount: number;
  afterWordCount: number;
  confidence: EvidenceConfidence;
}

export interface EditLearningObservation {
  id: string;
  register: RegisterName;
  changedFeatures: string[];
  suggestions: string[];
  status: EvidenceStatus;
  createdAt: string;
}

export interface CompileOptions {
  register?: RegisterName;
  includeEvidence?: boolean;
}

export interface VoiceprintPackage {
  packageVersion: "1.0.0";
  profileId: string;
  profileVersion: number;
  generatedAt: string;
  provenance: {
    schemaVersion: string;
    analysisVersion: string;
    sourceCount: number;
  };
  install: {
    universal: string;
    agents: string;
    fileNames: Record<AdapterTarget, string>;
  };
  artifacts: Record<AdapterTarget, string>;
  registerArtifacts: Record<RegisterName, Record<AdapterTarget, string>>;
}

export interface Adapter {
  (profile: VoiceprintProfile, options: Required<CompileOptions>): string;
}

export interface ScoreCheck {
  label: string;
  score: number;
  detail: string;
}

export interface ProfileScore {
  overall: number;
  alignmentScore: number;
  confidence: EvidenceConfidence;
  measuredFeatureCount: number;
  insufficientFeatureCount: number;
  register: string;
  wordCount: number;
  checks: ScoreCheck[];
  features: FeatureDrift[];
  driftCount: number;
  matchedAvoid: string[];
  recommendations: string[];
}

export interface FeatureDrift {
  id: string;
  label: string;
  actual: number;
  targetMin: number;
  targetMax: number;
  unit: string;
  status: FeatureStatus;
  detail: string;
  recommendation: string;
  coverage?: number;
  stability?: number;
  uncertainty?: number;
}

export interface HeldOutEvaluation {
  register: RegisterName;
  sampleCount: number;
  passed: boolean;
  averageScore: number;
  reports: Array<{ sampleId: string; label: string; score: ProfileScore }>;
}

export interface RegressionResult {
  name: string;
  target: AdapterTarget;
  mustContain: string[];
  passed: boolean;
  missing: string[];
}

export interface FeatureRegressionResult {
  name: string;
  feature: string;
  expected: number;
  actual: number;
  tolerance: number;
  passed: boolean;
}

export interface PersistenceEnvelope {
  storageVersion: typeof STORAGE_SCHEMA_VERSION;
  current: VoiceprintProfile;
  history: VoiceprintProfile[];
  settings: {
    persistApprovedEvidence: boolean;
  };
}
