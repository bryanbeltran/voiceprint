import { useState, type FormEvent } from "react";
import { REGISTER_NAMES, scoreTextAgainstProfile, type ProfileScore, type RegisterName, type VoiceprintProfile } from "../domain";

interface Draft {
  label: "A" | "B";
  original: "baseline" | "Voiceprint";
  text: string;
}

export interface EvaluationState {
  register: RegisterName;
  prompt: string;
  left: Draft;
  right: Draft;
  choice: "left" | "right" | null;
  revealed: boolean;
}

export interface EvaluationPanelProps {
  profile: VoiceprintProfile;
}

export function EvaluationPanel({ profile }: EvaluationPanelProps) {
  const [register, setRegister] = useState<RegisterName>("default");
  const [prompt, setPrompt] = useState("");
  const [baseline, setBaseline] = useState("");
  const [voice, setVoice] = useState("");
  const [evaluation, setEvaluation] = useState<EvaluationState | null>(null);
  const [auditText, setAuditText] = useState("");
  const [auditRegister, setAuditRegister] = useState<RegisterName>("default");
  const [auditScore, setAuditScore] = useState<ProfileScore | null>(null);

  const start = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!baseline.trim() || !voice.trim()) return;
    const baselineFirst = Math.random() >= 0.5;
    setEvaluation({
      register,
      prompt: prompt.trim(),
      left: baselineFirst ? { label: "A", original: "baseline", text: baseline.trim() } : { label: "A", original: "Voiceprint", text: voice.trim() },
      right: baselineFirst ? { label: "B", original: "Voiceprint", text: voice.trim() } : { label: "B", original: "baseline", text: baseline.trim() },
      choice: null,
      revealed: false
    });
  };

  const audit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (auditText.trim()) setAuditScore(scoreTextAgainstProfile(auditText, profile, auditRegister));
  };

  return <section className="evaluation-section" id="evaluation" aria-labelledby="evaluation-title"><div className="workspace-heading"><div><div className="section-kicker">05 / Test the feel</div><h2 id="evaluation-title">Can you tell which one sounds like you?</h2><p>Blind the labels first. Reveal the deterministic signals only after you choose the draft that feels more like you.</p></div></div><div className="audit-card"><div><div className="section-kicker">Held-out voice audit</div><h3>Measure a draft without changing the profile.</h3><p>Paste a generated draft to see where it sits inside or outside your approved feature bands. This is coaching, not an authorship claim.</p></div><div className="audit-grid"><form className="input-card" onSubmit={audit}><div className="field"><label htmlFor="audit-register">Audit register</label><select id="audit-register" value={auditRegister} onChange={(event) => setAuditRegister(event.target.value as RegisterName)}>{REGISTER_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}</select></div><div className="field"><label htmlFor="audit-draft">Draft or held-out sample</label><textarea id="audit-draft" rows={8} value={auditText} onChange={(event) => setAuditText(event.target.value)} placeholder="Paste a draft here…" /></div><button className="button secondary" type="submit">Run voice audit →</button></form><AuditResult score={auditScore} /></div></div><div className="evaluation-grid"><form className="input-card" onSubmit={start}><div className="field"><label htmlFor="evaluation-register">Register</label><select id="evaluation-register" value={register} onChange={(event) => setRegister(event.target.value as RegisterName)}>{REGISTER_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}</select></div><div className="field"><label htmlFor="evaluation-prompt">What was the request?</label><textarea id="evaluation-prompt" rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Draft a short update about the new feature…" /></div><div className="field"><label htmlFor="baseline-output">Version A · baseline output</label><textarea id="baseline-output" rows={7} value={baseline} onChange={(event) => setBaseline(event.target.value)} placeholder="Paste the baseline draft here…" /></div><div className="field"><label htmlFor="voice-output">Version B · Voiceprint output</label><textarea id="voice-output" rows={7} value={voice} onChange={(event) => setVoice(event.target.value)} placeholder="Paste the Voiceprint draft here…" /></div><button className="button primary" type="submit">Start blind comparison →</button></form><BlindCard evaluation={evaluation} profile={profile} onChoose={(choice) => setEvaluation((current) => current ? { ...current, choice } : current)} onReveal={() => setEvaluation((current) => current ? { ...current, revealed: true } : current)} /></div></section>;
}

function AuditResult({ score }: { score: ProfileScore | null }) {
  if (!score) return <aside className="blind-card empty-card" aria-live="polite"><span className="analysis-icon" aria-hidden="true">↗</span><h3>Ready for a held-out check</h3><p>Nothing is added to the profile. The audit only reports measured drift.</p></aside>;
  return <aside className="blind-card audit-result" aria-live="polite"><div className="blind-label">Profile-relative report · {score.register}</div><div className="audit-score"><strong>{score.overall}</strong><span>style alignment</span></div><p className="blind-status">{score.driftCount ? `${score.driftCount} measured feature${score.driftCount === 1 ? "" : "s"} outside the reference band.` : "All measured features are inside the reference band."}</p><div className="feature-report">{score.features.length ? score.features.map((feature) => <div className={`feature-report-row ${feature.status}`} key={feature.id}><span>{feature.label}</span><strong>{feature.status === "within" ? "within" : feature.status}</strong><small>{feature.actual} {feature.unit} · target {feature.targetMin}–{feature.targetMax}</small>{feature.status !== "within" && <em>{feature.recommendation}</em>}</div>) : <p className="field-hint">Analyze a corpus first to create per-feature target bands.</p>}</div>{score.recommendations.length > 0 && <div className="audit-coaching"><strong>Coaching</strong><ul>{score.recommendations.slice(0, 5).map((recommendation) => <li key={recommendation}>{recommendation}</li>)}</ul></div>}</aside>;
}

function BlindCard({ evaluation, profile, onChoose, onReveal }: { evaluation: EvaluationState | null; profile: VoiceprintProfile; onChoose: (choice: "left" | "right") => void; onReveal: () => void }) {
  if (!evaluation) return <aside className="blind-card empty-card" aria-live="polite"><span className="analysis-icon" aria-hidden="true">A / B</span><h3>Ready when you are</h3><p>The labels will be shuffled before you choose the draft that feels more like you.</p></aside>;
  const leftScore = evaluation.revealed ? scoreTextAgainstProfile(evaluation.left.text, profile, evaluation.register) : null;
  const rightScore = evaluation.revealed ? scoreTextAgainstProfile(evaluation.right.text, profile, evaluation.register) : null;
  return <aside className="blind-card" aria-live="polite"><div className="blind-label">Blind comparison · {evaluation.register}</div><DraftCard draft={evaluation.left} /><DraftCard draft={evaluation.right} />{evaluation.choice ? <><p className="blind-status">You chose <strong>Draft {evaluation.choice === "left" ? "A" : "B"}</strong>. Reveal the scoring when you are ready.</p><button className="button secondary" type="button" onClick={onReveal}>Reveal scoring</button></> : <><p className="blind-status">Which draft feels more like you? The labels are intentionally anonymous.</p><div className="blind-choice"><button className="button secondary" type="button" onClick={() => onChoose("left")}>A feels more like me</button><button className="button secondary" type="button" onClick={() => onChoose("right")}>B feels more like me</button></div></>}{leftScore && rightScore && <ScoreGrid left={leftScore} right={rightScore} leftOriginal={evaluation.left.original} rightOriginal={evaluation.right.original} />}</aside>;
}

function DraftCard({ draft }: { draft: Draft }) {
  return <div className="draft-card"><div className="blind-label">Draft {draft.label}</div><div className="blind-output">{draft.text}</div></div>;
}

function ScoreGrid({ left, right, leftOriginal, rightOriginal }: { left: ProfileScore; right: ProfileScore; leftOriginal: string; rightOriginal: string }) {
  return <div className="score-grid"><div className="score-card"><strong>{left.overall}</strong><span>Draft A style score · {leftOriginal}</span></div><div className="score-card"><strong>{right.overall}</strong><span>Draft B style score · {rightOriginal}</span></div><p className="field-hint score-note">Signals are deterministic heuristics, not a judgment of writing quality. Avoidance matches: {left.matchedAvoid.length + right.matchedAvoid.length || "none"}.</p></div>;
}
