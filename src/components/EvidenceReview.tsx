import type { EvidenceDecisionPatch, RegisterName, VoiceprintEvidence } from "../domain";
import { REGISTER_NAMES } from "../domain";

export interface EvidenceReviewProps {
  evidence: VoiceprintEvidence[];
  onDecision: (evidenceId: string, patch: EvidenceDecisionPatch) => void;
}

export function EvidenceReview({ evidence, onDecision }: EvidenceReviewProps) {
  const pendingCount = evidence.filter((item) => item.status === "pending").length;
  return (
    <section className="review-section" id="review-panel" aria-labelledby="review-title">
      <div className="workspace-heading"><div><div className="section-kicker">03 / Review queue</div><h2 id="review-title">Approve what should become part of your voice.</h2><p>Candidate rules remain suggestions until you approve them. Edit the wording if the evidence is directionally right but not quite yours.</p></div><span className="pending-count">{pendingCount} pending</span></div>
      {evidence.length === 0 ? <div className="empty-card evidence-empty">No evidence has been collected yet. Complete the interview or analyze a writing sample.</div> : <div className="evidence-list">{evidence.map((item) => <EvidenceCard item={item} key={item.id} onDecision={onDecision} />)}</div>}
    </section>
  );
}

function EvidenceCard({ item, onDecision }: { item: VoiceprintEvidence; onDecision: EvidenceReviewProps["onDecision"] }) {
  const applyStatus = (status: "approved" | "pending" | "rejected"): void => onDecision(item.id, { status });
  return <article className={`evidence-card ${item.status === "pending" ? "pending" : ""}`}>
    <div className="evidence-content">
      <div className="evidence-meta"><span>{item.sourceType}</span><span>{item.confidence} confidence</span><span>{Math.round(item.coverage * 100)}% coverage</span><span>{item.scope} scope</span><span>{item.status}</span><label className="sr-only" htmlFor={`register-${item.id}`}>Evidence register</label><select id={`register-${item.id}`} value={item.register} onChange={(event) => onDecision(item.id, { register: event.target.value as RegisterName })}>{REGISTER_NAMES.map((register) => <option key={register} value={register}>{register}</option>)}</select></div>
      <label className="sr-only" htmlFor={`claim-${item.id}`}>Edit evidence rule</label><textarea id={`claim-${item.id}`} value={item.claim} onChange={(event) => onDecision(item.id, { claim: event.target.value })} />
      <p className="evidence-excerpt">{item.excerpt ? `“${item.excerpt}”` : "Excerpt not retained in the local snapshot."}</p><p className="evidence-source">Source: {item.sourceRef || item.sourceId || "unspecified"}{item.span ? ` · characters ${item.span.start}–${item.span.end}` : ""}{item.rightsNote ? ` · ${item.rightsNote}` : ""}</p>{item.supports?.length ? <details className="evidence-supports"><summary>{item.supports.length} supporting span{item.supports.length === 1 ? "" : "s"}</summary><ul>{item.supports.map((support) => <li key={`${support.sampleId}-${support.span?.start || 0}`}><span>{support.sampleId}{support.span ? ` · characters ${support.span.start}–${support.span.end}` : ""}</span>{support.excerpt && <q>{support.excerpt}</q>}</li>)}</ul></details> : null}
    </div>
    <div className="evidence-actions"><button className={`mini-button ${item.status === "approved" ? "active" : ""}`} type="button" onClick={() => applyStatus("approved")}>Approve</button><button className={`mini-button ${item.status === "pending" ? "active" : ""}`} type="button" onClick={() => applyStatus("pending")}>Keep pending</button><button className={`mini-button reject ${item.status === "rejected" ? "active" : ""}`} type="button" onClick={() => applyStatus("rejected")}>Reject</button></div>
  </article>;
}
