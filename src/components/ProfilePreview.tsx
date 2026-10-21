import { useMemo } from "react";
import { compileProfile, REGISTER_NAMES, type AdapterTarget, type RegisterName, type VoiceprintProfile } from "../domain";

const TARGET_OPTIONS: Array<[AdapterTarget, string]> = [
  ["universal", "Universal profile"],
  ["codex", "Codex skill"],
  ["claude", "Claude instructions"],
  ["chatgpt", "ChatGPT instructions"],
  ["cursor", "Cursor rules"],
  ["gemini", "Gemini instructions"],
  ["agent-skill", "Standard Agent Skill"]
];

export interface ProfilePreviewProps {
  profile: VoiceprintProfile;
  target: AdapterTarget;
  register: RegisterName;
  includeEvidence: boolean;
  fileName: string;
  onTargetChange: (target: AdapterTarget) => void;
  onRegisterChange: (register: RegisterName) => void;
  onCopy: (content: string) => void;
  onDownload: (content: string, target: AdapterTarget, fileName: string) => void;
}

export function ProfilePreview({
  profile,
  target,
  register,
  includeEvidence,
  fileName,
  onTargetChange,
  onRegisterChange,
  onCopy,
  onDownload
}: ProfilePreviewProps) {
  const output = useMemo(
    () => compileProfile(profile, target, { register, includeEvidence }),
    [profile, target, register, includeEvidence]
  );
  return (
    <aside className="preview-panel" aria-labelledby="preview-title">
      <div className="preview-head">
        <div><div className="section-kicker">Live output</div><h2 id="preview-title">Your portable voice</h2><p>Generated from the canonical profile, not a one-off prompt.</p></div>
        <span className="live-pill">Live</span>
      </div>
      <div className="preview-tools">
        <label className="sr-only" htmlFor="preview-register">Preview register</label>
        <select id="preview-register" value={register} onChange={(event) => onRegisterChange(event.target.value as RegisterName)}>
          {REGISTER_NAMES.map((name) => <option key={name} value={name}>{name === "default" ? "Default" : `${name[0].toUpperCase()}${name.slice(1)}`} register</option>)}
        </select>
        <label className="sr-only" htmlFor="preview-format">Preview format</label>
        <select id="preview-format" value={target} onChange={(event) => onTargetChange(event.target.value as AdapterTarget)}>
          {TARGET_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <pre className="preview-code" tabIndex={0} aria-live="polite">{output}</pre>
      <div className="preview-foot">
        <div className="privacy-note"><span>Compiled in your browser.<br />No provider call required.</span></div>
        <div className="preview-actions">
          <button className="button secondary small" type="button" onClick={() => onCopy(output)}>Copy</button>
          <button className="button primary small" type="button" onClick={() => onDownload(output, target, fileName)}>Download</button>
        </div>
      </div>
    </aside>
  );
}
