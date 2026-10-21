import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyCorpusAnalysis,
  applyEditLearning,
  applyEvidenceDecision,
  buildProfileFromInterview,
  exportVoiceprintPackage,
  createProfileVersion,
  diffProfiles,
  evaluateHeldOutSamples,
  exportProfile,
  importProfile,
  mergeProfileFromInterview,
  readPersistedState,
  redactCorpusText,
  runRegressionFixtures,
  sanitizeForPersistence,
  writePersistedState,
  type AdapterTarget,
  type CorpusAnalysis,
  type CorpusSampleSummary,
  type CorpusSourceMetadata,
  type CorpusSampleInput,
  type EvidenceDecisionPatch,
  type EditLearningResult,
  type InterviewAnswers,
  type RegisterName,
  type RegressionResult,
  type VoiceprintProfile
} from "./domain";
import { analyzeCorpusAsync } from "./lib/corpus-analysis";
import { CorpusWorkspace } from "./components/CorpusWorkspace";
import { EvaluationPanel } from "./components/EvaluationPanel";
import { EvidenceReview } from "./components/EvidenceReview";
import { HistoryPanel } from "./components/HistoryPanel";
import { InterviewBuilder } from "./components/InterviewBuilder";
import { ProfilePreview } from "./components/ProfilePreview";
import { readFileAsText } from "./lib/file-text";

const ENERGY_LABELS = ["quiet", "low-key", "steady", "energized", "electric"] as const;
const FORMALITY_LABELS = ["very relaxed", "relaxed", "balanced", "polished", "formal"] as const;

interface WorkspaceState {
  profile: VoiceprintProfile;
  answers: InterviewAnswers;
  history: VoiceprintProfile[];
  analysis: CorpusAnalysis | null;
  activeMode: "interview" | "corpus";
  persistApprovedEvidence: boolean;
  currentStep: number;
  previewTarget: AdapterTarget;
  previewRegister: RegisterName;
  fileName: string;
  historyDiff: string;
  resetKey: number;
}

const defaultAnswers: InterviewAnswers = {
  fullName: "",
  role: "",
  audience: "",
  sample: "",
  tone: "warm and human",
  energyLabel: "steady",
  formalityLabel: "relaxed",
  feel: "understood, not managed",
  never: "generic, inflated, or overly polished",
  include: "a clear point of view and concrete details",
  signOff: "",
  contractions: true,
  shortParagraphs: true,
  plainLanguage: true,
  emDash: false
};

function answersFromProfile(profile: VoiceprintProfile): InterviewAnswers {
  const isStarterProfile = profile.profileId === "profile-default";
  return {
    fullName: isStarterProfile ? "" : profile.subject.name,
    role: isStarterProfile ? "" : profile.subject.role,
    audience: isStarterProfile ? "" : profile.subject.audience,
    sample: "",
    tone: profile.style.tone,
    energyLabel: profile.style.energy,
    formalityLabel: profile.style.formality,
    feel: profile.preferences.readerFeeling,
    never: profile.preferences.avoid,
    include: profile.preferences.reachFor,
    signOff: profile.preferences.signOff,
    contractions: profile.preferences.habits.contractions,
    shortParagraphs: profile.preferences.habits.shortParagraphs,
    plainLanguage: profile.preferences.habits.plainLanguage,
    emDash: profile.preferences.habits.emDash
  };
}

function summaryFromSource(source: CorpusSourceMetadata): CorpusSampleSummary {
  return {
    id: source.id,
    label: source.label,
    register: source.register,
    permission: source.permission,
    consentGranted: source.consentGranted,
    rightsNote: source.rightsNote,
    redacted: source.redacted,
    heldOut: source.heldOut,
    wordCount: source.wordCount,
    characterCount: source.characterCount,
    sourcePath: source.sourcePath || "",
    format: source.format || "unknown",
    language: source.language || "und",
    languageConfidence: source.languageConfidence || 0,
    proseScore: source.proseScore || 0,
    included: source.included !== false,
    exclusionReason: source.exclusionReason,
    duplicateOf: source.duplicateOf
  };
}

function analysisFromProfile(profile: VoiceprintProfile): CorpusAnalysis | null {
  const snapshot = profile.review.analysis;
  if (!snapshot) return null;
  return {
    analysisVersion: profile.provenance.analysisVersion,
    samples: snapshot.sources.map(summaryFromSource),
    metrics: snapshot.metrics,
    registers: snapshot.registers,
    heldOutSampleIds: snapshot.heldOutSampleIds,
    heldOutEvaluation: snapshot.heldOutEvaluation,
    issues: snapshot.issues,
    contaminationMatches: snapshot.contaminationMatches,
    evidence: profile.evidence.filter((item) => item.sourceType === "corpus"),
    conflicts: snapshot.conflicts,
    language: snapshot.language,
    dedupedSampleIds: snapshot.dedupedSampleIds
  };
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    const probe = "__voiceprint_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function initialWorkspace(): WorkspaceState {
  const loaded = readPersistedState(safeStorage());
  return {
    profile: loaded.profile,
    answers: answersFromProfile(loaded.profile),
    history: loaded.history,
    analysis: analysisFromProfile(loaded.profile),
    activeMode: "interview",
    persistApprovedEvidence: loaded.persistApprovedEvidence,
    currentStep: 1,
    previewTarget: "universal",
    previewRegister: "default",
    fileName: "my-voice-profile",
    historyDiff: "",
    resetKey: 0
  };
}

function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFileName(value: string, fallback = "my-voice-profile"): string {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || fallback;
}

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(initialWorkspace);
  const [toast, setToast] = useState("");
  const [regression, setRegression] = useState<RegressionResult[] | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storage = useMemo(() => safeStorage(), []);

  const notify = useCallback((message: string): void => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2_600);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    writePersistedState(storage, workspace.profile, workspace.history, workspace.persistApprovedEvidence);
  }, [storage, workspace.profile, workspace.history, workspace.persistApprovedEvidence]);

  const updateAnswers = (patch: Partial<InterviewAnswers>): void => {
    setWorkspace((current) => {
      const answers = { ...current.answers, ...patch };
      const base = buildProfileFromInterview(answers, { profileId: current.profile.profileId });
      return { ...current, answers, profile: mergeProfileFromInterview(base, current.profile) };
    });
  };

  const updateProfile = (updater: (profile: VoiceprintProfile) => VoiceprintProfile): void => {
    setWorkspace((current) => ({ ...current, profile: updater(current.profile) }));
  };

  const handleEditLearning = (result: EditLearningResult): void => {
    updateProfile((profile) => applyEditLearning(profile, result));
    notify("Approved edit preferences added to the profile.");
  };

  const handleAnalyze = (samples: CorpusSampleInput[], register: RegisterName): void => {
    if (!samples.length) {
      notify("Add pasted text or a text file first.");
      return;
    }
    notify("Analyzing locally…");
    void analyzeCorpusAsync(samples).then((rawAnalysis) => {
      const baseAnalysis: CorpusAnalysis = {
        ...rawAnalysis,
        evidence: rawAnalysis.evidence.map((item) => ({ ...item, register: item.register || register }))
      };
      setWorkspace((current) => {
        const base = buildProfileFromInterview(current.answers, { profileId: current.profile.profileId });
        const provisional = applyCorpusAnalysis(base, baseAnalysis);
        const heldOutSamples = samples
          .filter((sample) => sample.heldOut && sample.consentGranted !== false)
          .map((sample, index) => ({ id: sample.id || `held-out-${index + 1}`, label: sample.label, text: sample.redact === false ? sample.text : redactCorpusText(sample.text) }));
        const analysis: CorpusAnalysis = {
          ...baseAnalysis,
          heldOutEvaluation: heldOutSamples.length ? evaluateHeldOutSamples(provisional, heldOutSamples, register) : null
        };
        const next = mergeProfileFromInterview(applyCorpusAnalysis(base, analysis), current.profile);
        return { ...current, profile: next, analysis, activeMode: "corpus" };
      });
      notify(`${baseAnalysis.evidence.length} candidate rules ready for review.`);
    }).catch(() => notify("Analysis failed; the local workspace is still available."));
  };

  const handleEvidenceDecision = (evidenceId: string, patch: EvidenceDecisionPatch): void => {
    updateProfile((profile) => applyEvidenceDecision(profile, evidenceId, patch));
    if (patch.status === "approved") notify("Rule approved for compilation.");
    if (patch.status === "rejected") notify("Rule rejected.");
    if (patch.status === "pending") notify("Rule kept pending.");
  };

  const saveVersion = (): void => {
    setWorkspace((current) => ({
      ...current,
      history: [sanitizeForPersistence(current.profile, { persistApprovedEvidence: current.persistApprovedEvidence }), ...current.history].slice(0, 8),
      profile: createProfileVersion(current.profile, { note: "Manual snapshot" }),
      historyDiff: ""
    }));
    notify(`Saved Voiceprint version ${workspace.profile.version + 1}.`);
  };

  const restoreVersion = (index: number): void => {
    setWorkspace((current) => {
      const snapshot = current.history[index];
      if (!snapshot) return current;
      const nextHistory = [...current.history];
      nextHistory[index] = current.profile;
      return { ...current, profile: snapshot, answers: answersFromProfile(snapshot), history: nextHistory, historyDiff: "" };
    });
    notify("Restored the selected Voiceprint version.");
  };

  const compareVersion = (index: number): void => {
    setWorkspace((current) => {
      const snapshot = current.history[index];
      if (!snapshot) return current;
      const result = diffProfiles(snapshot, current.profile);
      return { ...current, historyDiff: result.changed ? `Current vs v${snapshot.version}: changed ${result.sections.join(", ")}.` : `Current vs v${snapshot.version}: no canonical sections changed.` };
    });
  };

  const resetProfile = (): void => {
    if (!window.confirm("Delete this local Voiceprint profile and its saved history?")) return;
    storage?.removeItem("voiceprint-profile-v3");
    const profile = buildProfileFromInterview(defaultAnswers, { now: new Date().toISOString() });
    setWorkspace((current) => ({ ...current, profile, answers: defaultAnswers, history: [], analysis: null, persistApprovedEvidence: false, currentStep: 1, historyDiff: "", resetKey: current.resetKey + 1 }));
    notify("Local profile deleted.");
  };

  const importCanonicalProfile = async (file: File): Promise<void> => {
    try {
      const result = importProfile(await readFileAsText(file));
      if (!result.valid) {
        notify(`Import failed: ${result.errors[0]}`);
        return;
      }
      const profile = result.value;
      setWorkspace((current) => ({
        ...current,
        profile,
        answers: answersFromProfile(profile),
        analysis: analysisFromProfile(profile)
      }));
      notify("Canonical profile imported.");
    } catch {
      notify("Import failed: the selected file could not be read.");
    }
  };

  const startOver = (): void => {
    const profile = buildProfileFromInterview(defaultAnswers, { now: new Date().toISOString() });
    setWorkspace((current) => ({ ...current, profile, answers: defaultAnswers, history: [], analysis: null, currentStep: 1, resetKey: current.resetKey + 1 }));
    notify("Fresh profile started.");
  };

  const runRegression = (): void => {
    const results = runRegressionFixtures(workspace.profile);
    setRegression(results);
    notify(results.every((result) => result.passed) ? "All adapter checks passed." : "One or more adapter checks need attention.");
  };

  const copyPreview = async (content: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content);
      notify("Copied to your clipboard.");
    } catch {
      notify("Clipboard access was unavailable; select the preview text to copy it.");
    }
  };

  const downloadProfile = (content: string, target: AdapterTarget, fileName: string): void => {
    const extension = target === "codex" || target === "agent-skill" ? "SKILL.md" : target === "cursor" ? "mdc" : "md";
    downloadText(`${safeFileName(fileName)}.${extension}`, content, "text/markdown;charset=utf-8");
    notify("Your voice profile is ready to carry.");
  };

  const exportCanonicalProfile = (): void => {
    downloadText(`${safeFileName(workspace.fileName)}.voiceprint.json`, exportProfile(workspace.profile), "application/json;charset=utf-8");
    notify("Canonical profile exported.");
  };

  const exportPackage = (): void => {
    downloadText(`${safeFileName(workspace.fileName)}.voiceprint-package.json`, exportVoiceprintPackage(workspace.profile, workspace.persistApprovedEvidence), "application/json;charset=utf-8");
    notify("Portable Agent Skills package exported.");
  };

  const updateMode = (mode: "interview" | "corpus"): void => setWorkspace((current) => ({ ...current, activeMode: mode }));

  return <>
    <a className="skip-link" href="#builder">Skip to builder</a>
    <header className="site-header"><div className="shell nav"><a className="brand" href="#top" aria-label="Voiceprint home"><span className="brand-mark">V</span><span>voiceprint</span></a><nav className="nav-links" aria-label="Primary navigation"><a href="#builder">Build</a><a href="#review-panel">Review</a><a href="#evaluation">Test</a><a className="nav-cta" href="#privacy">Private by default</a></nav></div></header>
    <main id="top">
      <section className="hero"><div className="shell hero-grid"><div className="hero-copy"><div className="section-kicker">An open compiler for personal voice</div><h1>Make AI sound <em>like you.</em></h1><p>Voiceprint turns a few thoughtful answers and real writing samples into a portable, inspectable profile for the AI tools you already use.</p><div className="hero-actions"><a className="button primary" href="#builder">Build your voice →</a><a className="button secondary" href="#how-it-works">See how it works</a></div><div className="hero-note"><span className="status-dot" aria-hidden="true" />Local-first · no account · export anytime</div></div><div className="profile-stage" role="img" aria-label="Example voice profile preview"><div className="profile-card"><div className="card-top"><span className="card-kicker">Voiceprint / v1</span><span className="card-status">portable</span></div><div className="avatar" aria-hidden="true">BB</div><h2>Your voice, in a file.</h2><p className="role">A living profile for the way you think and write.</p><p className="quote">Clear before clever. Specific before impressive.</p><div className="chip-row"><span className="chip">warm</span><span className="chip">direct</span><span className="chip">human</span></div></div></div></div></section>
      <section className="signal-bar" aria-label="Product principles"><div className="shell signal-items"><div className="signal-item"><span className="signal-number">01</span><span>One canonical profile<br />for every AI tool</span></div><div className="signal-item"><span className="signal-number">02</span><span>Evidence you can<br />approve or reject</span></div><div className="signal-item"><span className="signal-number">03</span><span>Local by default<br />portable by design</span></div></div></section>

      <section className="builder-section" id="builder"><div className="shell"><div className="mode-tabs" role="tablist" aria-label="Profile input mode"><button className={workspace.activeMode === "interview" ? "active" : ""} role="tab" aria-selected={workspace.activeMode === "interview"} type="button" onClick={() => updateMode("interview")}>Guided interview</button><button className={workspace.activeMode === "corpus" ? "active" : ""} role="tab" aria-selected={workspace.activeMode === "corpus"} type="button" onClick={() => updateMode("corpus")}>Analyze writing samples</button></div>{workspace.activeMode === "interview" ? <div className="builder-layout"><InterviewBuilder answers={workspace.answers} fileName={workspace.fileName} currentStep={workspace.currentStep} onChange={updateAnswers} onFileNameChange={(fileName) => setWorkspace((current) => ({ ...current, fileName }))} onStepChange={(currentStep) => setWorkspace((current) => ({ ...current, currentStep }))} onStartOver={startOver} /><ProfilePreview profile={workspace.profile} target={workspace.previewTarget} register={workspace.previewRegister} includeEvidence={workspace.persistApprovedEvidence} fileName={workspace.fileName} onTargetChange={(previewTarget) => setWorkspace((current) => ({ ...current, previewTarget }))} onRegisterChange={(previewRegister) => setWorkspace((current) => ({ ...current, previewRegister }))} onCopy={copyPreview} onDownload={downloadProfile} /></div> : <CorpusWorkspace key={workspace.resetKey} analysis={workspace.analysis} persistApprovedEvidence={workspace.persistApprovedEvidence} onPersistencePreferenceChange={(persistApprovedEvidence) => setWorkspace((current) => ({ ...current, persistApprovedEvidence }))} onAnalyze={handleAnalyze} onClear={() => setWorkspace((current) => ({ ...current, analysis: null }))} />}</div></section>
      {workspace.activeMode === "interview" && <section className="corpus-callout"><div className="shell callout-inner"><div><div className="section-kicker">Want more signal?</div><h2>Let your real writing add the grain.</h2></div><button className="button secondary" type="button" onClick={() => updateMode("corpus")}>Analyze samples →</button></div></section>}
      {workspace.activeMode === "corpus" && <div className="shell"><EvidenceReview evidence={workspace.profile.evidence} onDecision={handleEvidenceDecision} /><HistoryPanel profile={workspace.profile} history={workspace.history} diff={workspace.historyDiff} onSave={saveVersion} onRestore={restoreVersion} onCompare={compareVersion} onExport={exportCanonicalProfile} onExportPackage={exportPackage} onImport={importCanonicalProfile} onReset={resetProfile} /></div>}
      {workspace.activeMode === "interview" && <div className="shell secondary-flow"><EvidenceReview evidence={workspace.profile.evidence} onDecision={handleEvidenceDecision} /><HistoryPanel profile={workspace.profile} history={workspace.history} diff={workspace.historyDiff} onSave={saveVersion} onRestore={restoreVersion} onCompare={compareVersion} onExport={exportCanonicalProfile} onExportPackage={exportPackage} onImport={importCanonicalProfile} onReset={resetProfile} /></div>}

      <section className="story-section" id="how-it-works"><div className="shell story-grid"><div className="story-intro"><div className="section-kicker light">How it works</div><h2>Voice is more than tone.</h2><p>Voiceprint separates what you mean from the tool you use. That makes your preferences inspectable, revisable, and yours.</p></div><div className="story-steps"><StoryStep number="01" title="Answer" text="Start with a short guided interview about context, texture, habits, and guardrails." /><StoryStep number="02" title="Inspect" text="Analyze writing you own locally. Candidate rules show their source, confidence, and register." /><StoryStep number="03" title="Carry" text="Approve the useful evidence and compile the same profile for Codex, Claude, ChatGPT, Cursor, or Markdown." /></div></div></section>
      <EvaluationPanel profile={workspace.profile} onLearn={handleEditLearning} />
      <section className="regression-section"><div className="shell regression-panel"><div><div className="section-kicker">Adapter contract</div><h2>Keep every export honest.</h2><p>Run the built-in regression fixtures before you carry a profile into another tool.</p></div><div className="regression-actions"><button className="button secondary" type="button" onClick={runRegression}>Run profile checks</button><pre className="regression-results" aria-live="polite">{regression ? regression.map((result) => `${result.passed ? "PASS" : "FAIL"}  ${result.name}${result.missing.length ? ` — missing: ${result.missing.join(", ")}` : ""}`).join("\n") : "No checks run yet."}</pre></div></div></section>
      <section className="privacy-section" id="privacy"><div className="shell privacy-grid"><div><div className="section-kicker light">06 / Data flow</div><h2>Private until you choose otherwise.</h2></div><div className="privacy-copy"><p>Interview answers, profile state, and approved rules are stored in this browser only. Writing samples are analyzed in memory. Raw samples and unapproved evidence excerpts are removed before persistence by default.</p><p>The app ships with local heuristics and no provider call. A future local-model or BYOK analyzer can plug into the same typed analysis contract without changing your profile format.</p><div className="data-flow"><span>Input</span><span>Browser memory</span><span>Sanitized profile</span><span>Export on demand</span></div></div></div></section>
    </main>
    <footer className="site-footer"><div className="shell"><span>voiceprint</span><span>Open source direction · local first · user-owned data</span><a href="#top">Back to top ↑</a></div></footer>
    <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite">{toast}</div>
  </>;
}

function StoryStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="story-step"><span className="story-step-number">{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>;
}

export { ENERGY_LABELS, FORMALITY_LABELS };
