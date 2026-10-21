import type { ChangeEvent, ReactNode } from "react";
import type { InterviewAnswers } from "../domain";

const ENERGY_LABELS = ["quiet", "low-key", "steady", "energized", "electric"] as const;
const FORMALITY_LABELS = ["very relaxed", "relaxed", "balanced", "polished", "formal"] as const;
const TONE_OPTIONS = [
  ["warm and human", "Warm & human"],
  ["clear and direct", "Clear & direct"],
  ["playful and vivid", "Playful & vivid"],
  ["measured and thoughtful", "Measured & thoughtful"]
] as const;

export interface InterviewBuilderProps {
  answers: InterviewAnswers;
  fileName: string;
  currentStep: number;
  onChange: (patch: Partial<InterviewAnswers>) => void;
  onFileNameChange: (fileName: string) => void;
  onStepChange: (step: number) => void;
  onStartOver: () => void;
}

const steps = ["Context", "Texture", "Rules", "Carry it"];

export function InterviewBuilder({
  answers,
  fileName,
  currentStep,
  onChange,
  onFileNameChange,
  onStepChange,
  onStartOver
}: InterviewBuilderProps) {
  const updateText = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    onChange({ [event.target.name]: event.target.value });
  };
  const updateCheckbox = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange({ [event.target.name]: event.target.checked });
  };
  const updateRange = (event: ChangeEvent<HTMLInputElement>, labels: readonly string[], key: "energyLabel" | "formalityLabel"): void => {
    onChange({ [key]: labels[Number(event.target.value) - 1] || labels[2] });
  };
  const energyIndex = Math.max(0, ENERGY_LABELS.indexOf(answers.energyLabel as (typeof ENERGY_LABELS)[number]));
  const formalityIndex = Math.max(0, FORMALITY_LABELS.indexOf(answers.formalityLabel as (typeof FORMALITY_LABELS)[number]));

  return (
    <section className="builder-panel" aria-labelledby="builder-title">
      <div className="section-kicker">01 / Build your voice</div>
      <h2 id="builder-title">A short interview, a profile you can actually carry.</h2>
      <p className="section-intro">Answer in plain language. Your answers become inspectable rules instead of a mysterious prompt.</p>
      <div className="step-tabs" role="tablist" aria-label="Voice interview steps">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          return (
            <button
              className={`step-tab${stepNumber === currentStep ? " active" : ""}`}
              key={step}
              type="button"
              role="tab"
              aria-selected={stepNumber === currentStep}
              aria-controls={`step-panel-${stepNumber}`}
              onClick={() => onStepChange(stepNumber)}
            >
              <span>{String(stepNumber).padStart(2, "0")}</span>{step}
            </button>
          );
        })}
      </div>

      <div className="step-panel" id="step-panel-1" role="tabpanel" hidden={currentStep !== 1}>
        <h3>Start with context.</h3>
        <p className="step-intro">A voice is shaped by who is speaking and who is listening.</p>
        <div className="two-up">
          <Field label="What should we call you?" htmlFor="fullName">
            <input id="fullName" name="fullName" type="text" autoComplete="name" value={answers.fullName} onChange={updateText} />
          </Field>
          <Field label="What do you do?" htmlFor="role">
            <input id="role" name="role" type="text" value={answers.role} onChange={updateText} />
          </Field>
        </div>
        <Field label="Who do you usually write for?" htmlFor="audience">
          <input id="audience" name="audience" type="text" value={answers.audience} onChange={updateText} />
        </Field>
        <Field label="Paste a small piece of writing you like." htmlFor="sample">
          <textarea id="sample" name="sample" value={answers.sample} onChange={updateText} />
          <p className="field-hint">Used in memory to seed the profile. It is not retained as raw text in local storage.</p>
        </Field>
      </div>

      <div className="step-panel" id="step-panel-2" role="tabpanel" hidden={currentStep !== 2}>
        <h3>Choose the texture.</h3>
        <p className="step-intro">There is no correct setting. Pick the combination you want an assistant to protect.</p>
        <fieldset className="field">
          <legend>What quality should lead?</legend>
          <div className="tone-grid">
            {TONE_OPTIONS.map(([value, label]) => (
              <label className={`tone-option${answers.tone === value ? " selected" : ""}`} key={value}>
                <input type="radio" name="tone" value={value} checked={answers.tone === value} onChange={() => onChange({ tone: value })} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <RangeField id="energy" label="How much energy should come through?" value={energyIndex + 1} output={answers.energyLabel} onChange={(event) => updateRange(event, ENERGY_LABELS, "energyLabel")} />
        <RangeField id="formality" label="Where do you land on formality?" value={formalityIndex + 1} output={answers.formalityLabel} onChange={(event) => updateRange(event, FORMALITY_LABELS, "formalityLabel")} />
        <Field label="When people read my writing, I want them to feel…" htmlFor="feel">
          <textarea id="feel" name="feel" value={answers.feel} onChange={updateText} placeholder="oriented, understood, energized…" />
        </Field>
      </div>

      <div className="step-panel" id="step-panel-3" role="tabpanel" hidden={currentStep !== 3}>
        <h3>Set the guardrails.</h3>
        <p className="step-intro">These are the details that keep a draft from drifting into generic AI language.</p>
        <Field label="Please never make me sound…" htmlFor="never">
          <textarea id="never" name="never" value={answers.never} onChange={updateText} placeholder="corporate, inflated, overly polished…" />
        </Field>
        <Field label="Please make room for…" htmlFor="include">
          <textarea id="include" name="include" value={answers.include} onChange={updateText} placeholder="specific examples, a point of view, a little humor…" />
        </Field>
        <fieldset className="field">
          <legend>Natural writing habits</legend>
          <div className="check-grid">
            <label className="check"><input name="contractions" type="checkbox" checked={answers.contractions} onChange={updateCheckbox} />Use contractions</label>
            <label className="check"><input name="shortParagraphs" type="checkbox" checked={answers.shortParagraphs} onChange={updateCheckbox} />Keep paragraphs short</label>
            <label className="check"><input name="plainLanguage" type="checkbox" checked={answers.plainLanguage} onChange={updateCheckbox} />Prefer plain language</label>
            <label className="check"><input name="emDash" type="checkbox" checked={answers.emDash} onChange={updateCheckbox} />Use em dashes</label>
          </div>
        </fieldset>
        <Field label="A sign-off or phrase you use often (optional)" htmlFor="signOff">
          <input id="signOff" name="signOff" type="text" value={answers.signOff} onChange={updateText} placeholder="— Bryan" />
        </Field>
      </div>

      <div className="step-panel" id="step-panel-4" role="tabpanel" hidden={currentStep !== 4}>
        <h3>Choose how to carry it.</h3>
        <p className="step-intro">The same canonical profile can compile to the tools you already use.</p>
        <Field label="File name" htmlFor="filename">
          <input id="filename" name="filename" type="text" value={fileName} onChange={(event) => onFileNameChange(event.target.value)} />
          <p className="field-hint">The extension is added automatically when you download.</p>
        </Field>
        <div className="carry-note"><span className="carry-icon" aria-hidden="true">↗</span><div><strong>One source of truth.</strong><p>Review evidence and change the register in the preview. Every adapter is generated from the same versioned profile.</p></div></div>
      </div>

      <div className="step-actions">
        <button className="button secondary" type="button" disabled={currentStep === 1} onClick={() => onStepChange(Math.max(1, currentStep - 1))}>← Back</button>
        <span className="step-counter">Step <strong>{currentStep}</strong> of 4</span>
        {currentStep === 4 ? (
          <button className="button primary" type="button" onClick={onStartOver}>Start over ↺</button>
        ) : (
          <button className="button primary" type="button" onClick={() => onStepChange(Math.min(4, currentStep + 1))}>Next question →</button>
        )}
      </div>
    </section>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  children: ReactNode;
}

function Field({ label, htmlFor, children }: FieldProps) {
  return <div className="field"><label htmlFor={htmlFor}>{label}</label>{children}</div>;
}

interface RangeFieldProps {
  id: string;
  label: string;
  value: number;
  output: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function RangeField({ id, label, value, output, onChange }: RangeFieldProps) {
  return <div className="field"><label htmlFor={id}>{label}</label><div className="range-row"><input id={id} name={id} type="range" min="1" max="5" value={value} onChange={onChange} /><output htmlFor={id}>{output}</output></div></div>;
}
