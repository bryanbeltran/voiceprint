import { useState, type FormEvent } from "react";
import { REGISTER_NAMES, type CorpusAnalysis, type CorpusSampleInput, type RegisterName } from "../domain";
import { readFileAsText } from "../lib/file-text";

export interface CorpusWorkspaceProps {
  analysis: CorpusAnalysis | null;
  persistApprovedEvidence: boolean;
  onPersistencePreferenceChange: (persist: boolean) => void;
  onAnalyze: (samples: CorpusSampleInput[], register: RegisterName) => void;
  onClear: () => void;
}

export function CorpusWorkspace({ analysis, persistApprovedEvidence, onPersistencePreferenceChange, onAnalyze, onClear }: CorpusWorkspaceProps) {
  const [draft, setDraft] = useState("");
  const [fileSamples, setFileSamples] = useState<CorpusSampleInput[]>([]);
  const [register, setRegister] = useState<RegisterName>("default");
  const [permission, setPermission] = useState<CorpusSampleInput["permission"]>("owned");
  const [rightsNote, setRightsNote] = useState("");
  const [consentGranted, setConsentGranted] = useState(false);
  const [redact, setRedact] = useState(true);
  const [heldOut, setHeldOut] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);

  const handleFiles = async (files: FileList | null): Promise<void> => {
    if (!files?.length) return;
    const next = await Promise.all([...files].map(async (file, index) => ({
      id: `file-${index + 1}-${file.name}`,
      text: await readFileAsText(file)
    })));
    setFileSamples(next);
    setFileNames([...files].map((file) => file.name));
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const pastedSamples = draft.trim()
      ? draft.split(/\n\s*---\s*\n/g).map((text, index) => ({ id: `paste-${index + 1}`, label: `Pasted sample ${index + 1}`, text }))
      : [];
    const samples = [...pastedSamples, ...fileSamples]
      .filter((sample) => sample.text.trim())
      .map((sample) => ({ ...sample, register, permission, rightsNote, consentGranted, redact, heldOut }));
    if (samples.length) onAnalyze(samples, register);
  };

  const clear = (): void => {
    setDraft("");
    setFileSamples([]);
    setFileNames([]);
    onClear();
  };

  return (
    <section className="workspace-section" id="corpus-mode" aria-labelledby="corpus-title">
      <div className="workspace-heading"><div><div className="section-kicker">02 / Learn from your work</div><h2 id="corpus-title">Let the writing add texture.</h2><p>Paste emails, notes, posts, or documents you own. Local heuristics surface patterns; you decide what becomes a rule.</p></div><span className="privacy-badge">Local analysis</span></div>
      <div className="corpus-grid">
        <form className="input-card" onSubmit={submit}>
          <div className="field"><label htmlFor="sample-file">Add text files</label><input id="sample-file" type="file" accept=".txt,.md,text/plain,text/markdown" multiple onChange={(event) => void handleFiles(event.target.files)} /><p className="field-hint">Text stays in memory for this session. Separate pasted samples with a line containing <code>---</code>.</p>{fileNames.length > 0 && <p className="file-list" aria-live="polite">Loaded: {fileNames.join(", ")}</p>}</div>
          <div className="field"><label htmlFor="corpus-input">Writing samples</label><textarea id="corpus-input" rows={12} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Paste a few pieces of writing here…" spellCheck /></div>
          <div className="two-up">
            <div className="field"><label htmlFor="corpus-register">Primary register / category</label><select id="corpus-register" value={register} onChange={(event) => setRegister(event.target.value as RegisterName)}>{REGISTER_NAMES.map((name) => <option key={name} value={name}>{name === "default" ? "Default" : name[0].toUpperCase() + name.slice(1)}</option>)}</select></div>
            <div className="field"><label htmlFor="corpus-permission">Source permission</label><select id="corpus-permission" value={permission} onChange={(event) => setPermission(event.target.value as CorpusSampleInput["permission"])}><option value="owned">I wrote it</option><option value="authorized">I have permission</option><option value="licensed">Licensed source</option><option value="unknown">Unknown — review before sharing</option></select></div>
          </div>
          <div className="field"><label htmlFor="corpus-rights">Source note (optional)</label><input id="corpus-rights" type="text" value={rightsNote} onChange={(event) => setRightsNote(event.target.value)} placeholder="Where it came from or what permission covers it" /></div>
          <div className="check-grid corpus-consent"><label className="check"><input type="checkbox" checked={consentGranted} onChange={(event) => setConsentGranted(event.target.checked)} />I have the right to use these samples for this profile.</label><label className="check"><input type="checkbox" checked={redact} onChange={(event) => setRedact(event.target.checked)} />Redact emails, phones, and token-like secrets before analysis.</label><label className="check"><input type="checkbox" checked={heldOut} onChange={(event) => setHeldOut(event.target.checked)} />Treat these samples as held-out evaluation data.</label><label className="check privacy-check"><input type="checkbox" checked={persistApprovedEvidence} onChange={(event) => onPersistencePreferenceChange(event.target.checked)} />Store approved excerpts locally</label></div>
          <p className="field-hint">{persistApprovedEvidence ? "Approved evidence excerpts will be included in local storage." : "Off by default. Rules and metrics persist without excerpts."}</p>
          <div className="corpus-actions"><button className="button primary" type="submit">Analyze samples →</button><button className="button secondary" type="button" onClick={clear}>Clear input</button></div>
        </form>
        <AnalysisCard analysis={analysis} register={register} />
      </div>
    </section>
  );
}

function AnalysisCard({ analysis, register }: { analysis: CorpusAnalysis | null; register: RegisterName }) {
  if (!analysis) return <aside className="analysis-card empty-card" aria-live="polite"><span className="analysis-icon" aria-hidden="true">∿</span><h3>No analysis yet</h3><p>Add at least one sample to see metrics, provenance, and candidate rules.</p></aside>;
  const { metrics, issues, evidence } = analysis;
  const active = analysis.registers[register]?.sampleCount ? analysis.registers[register] : analysis.registers.default;
  const heldOut = analysis.heldOutEvaluation;
  return <aside className="analysis-card" aria-live="polite"><div className="section-kicker">Analysis result · {active.register}</div><h3>{metrics.sampleCount} sample{metrics.sampleCount === 1 ? "" : "s"} <span>·</span> {metrics.fidelityScore * 100}% fidelity signal</h3><div className="metric-grid"><Metric value={metrics.wordCount} label="words" /><Metric value={active.metrics.sentenceWordPercentiles.p50} label="median sentence words" /><Metric value={evidence.length} label="candidate rules" /></div><div className="feature-summary"><strong>Measured bands · {active.sampleCount || "all"} reference sample{active.sampleCount === 1 ? "" : "s"}</strong>{active.featureBands.slice(0, 8).map((band) => <div className="feature-row" key={band.id}><span>{band.label}</span><span>{band.targetMin}–{band.targetMax} {band.unit}</span></div>)}</div><div className="source-summary"><strong>Source inventory</strong>{analysis.samples.map((sample) => <div className="feature-row" key={sample.id}><span>{sample.label} · {sample.register}</span><span>{sample.permission}{sample.heldOut ? " · held out" : ""}</span></div>)}</div>{heldOut && <div className="heldout-summary"><strong>Held-out check</strong><p>{heldOut.averageScore}% average style alignment · {heldOut.passed ? "reference band passed" : "needs review"} across {heldOut.sampleCount} sample{heldOut.sampleCount === 1 ? "" : "s"}.</p>{heldOut.reports.map((report) => <div className="feature-row" key={report.sampleId}><span>{report.label}</span><span>{report.score.overall}% · {report.score.driftCount} drift</span></div>)}</div>}<ul className="analysis-list">{issues.length ? issues.map((issue) => <li className={issue.severity} key={issue.id}><strong>{issue.severity}:</strong> {issue.message}</li>) : <li><strong>clear:</strong> no instruction-like contamination signals detected.</li>}</ul><p className="field-hint">Local heuristic version {analysis.analysisVersion}. {analysis.heldOutSampleIds.length ? `${analysis.heldOutSampleIds.length} held-out sample${analysis.heldOutSampleIds.length === 1 ? "" : "s"} excluded from the profile.` : "No held-out samples were included."} A signal for review, not a claim of perfect imitation.</p></aside>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}
