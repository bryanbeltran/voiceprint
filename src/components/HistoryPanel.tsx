import type { VoiceprintProfile } from "../domain";

export interface HistoryPanelProps {
  profile: VoiceprintProfile;
  history: VoiceprintProfile[];
  diff: string;
  onSave: () => void;
  onRestore: (index: number) => void;
  onCompare: (index: number) => void;
  onExport: () => void;
  onExportPackage: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
}

export function HistoryPanel({ profile, history, diff, onSave, onRestore, onCompare, onExport, onExportPackage, onImport, onReset }: HistoryPanelProps) {
  const sourceCount = profile.provenance.sources.length;
  return <section className="history-section" aria-labelledby="history-title"><div className="workspace-heading"><div><div className="section-kicker">04 / Keep your source of truth</div><h2 id="history-title">Version, compare, and take it with you.</h2><p>Profiles are yours. Export the canonical JSON or a portable Agent Skills package, restore an earlier snapshot, or reset the local workspace.</p></div><span className="version-badge">v{profile.version} · {sourceCount} sources</span></div><div className="tool-actions"><button className="button secondary" type="button" onClick={onExport}>Export profile JSON</button><button className="button primary" type="button" onClick={onExportPackage}>Export portable package</button><label className="button secondary file-button">Import JSON<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ""; }} /></label><button className="button secondary" type="button" onClick={onSave}>Save version</button><button className="button danger" type="button" onClick={onReset}>Delete local profile</button></div><div className="history-strip"><span className="history-label">Version history</span><div className="history-list">{history.length ? history.map((entry, index) => <span className="history-entry" key={`${entry.profileId}-${entry.version}-${index}`}><button className="history-chip" type="button" onClick={() => onRestore(index)} title={`Restore version ${entry.version}`}>v{entry.version} · {entry.versionNote || "saved"}</button><button className="history-diff-button" type="button" onClick={() => onCompare(index)}>Diff</button></span>) : <span className="muted-inline">No saved versions yet.</span>}</div></div><div className="history-diff" aria-live="polite">{diff || <>Select <strong>Diff</strong> beside a saved version to see which profile sections changed.</>}</div><RegisterInheritance profile={profile} /></section>;
}

function RegisterInheritance({ profile }: { profile: VoiceprintProfile }) {
  return <div className="register-map"><div><strong>Register inheritance</strong><p className="field-hint">Specific registers override their fallback; unconfigured registers inherit the default rules.</p></div><div className="register-map-grid">{Object.entries(profile.registers).map(([name, register]) => <div className="register-map-card" key={name}><strong>{register.label}</strong><span>{name} → {register.fallbackTo}</span><small>{register.rules.length} local rule{register.rules.length === 1 ? "" : "s"}</small></div>)}</div></div>;
}
