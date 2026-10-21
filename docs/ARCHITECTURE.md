# Architecture and extension design

## Runtime shape

Voiceprint is a client-only Vite application. `index.html` bootstraps `src/main.tsx`; React renders the UI, and the typed domain modules provide pure profile transformations. `npm run build` emits the production bundle into `dist/`. No backend, account, provider key, or network request is required.

## Ownership boundaries

- **Composition (`src/App.tsx`)**: workspace state, mode switching, LocalStorage lifecycle, downloads, import/export, toasts, and workflow orchestration.
- **Presentation (`src/components/`)**: interview, corpus, preview, evidence, history, and evaluation surfaces. Components receive typed props and do not own the canonical profile invariants.
- **Domain (`src/domain/`)**: normalization, profile construction, validation, corpus feature bands, contamination signals, evidence decisions, versioning, diffing, adapters, package manifests, persistence sanitization, scoring, held-out audits, and regression fixtures.
- **File boundary (`src/lib/file-text.ts`)**: browser reads with a `File.text()` path and a `FileReader` fallback, plus directory imports, HTML stripping, conversation-JSON extraction, format detection, and path-based register categorization.
- **Packaging (`vite.config.ts`, `index.html`)**: TypeScript/React compilation and production asset bundling. Generated `dist/` output is never hand-edited.
- **Quality gates (`tests/`)**: domain invariants plus React integration coverage for live preview, corpus analysis, evidence coverage, storage sanitization, blind evaluation, draft audits, package exports, import, and responsive DOM smoke behavior.

## Data flow

```text
Interview answers ────────────┐
                              ├─> VoiceprintProfile ─> adapter / JSON export
TXT/MD/HTML/JSON files + pasted samples ┘│
                                        ├─> evidence review ─> approved custom rules
                                        ├─> sanitized LocalStorage envelope
                                        ├─> deterministic feature bands / held-out audits
                                        └─> portable package artifacts
```

Generated-draft → user-edited-final pairs are compared in memory by `evaluation/learning.ts`. Only an explicitly approved, aggregate preference becomes evidence and a custom rule; neither draft is persisted.

Raw corpus strings exist only in the current page session and are passed to `analyzeCorpus`. The analysis returns summaries, metrics, issues, contamination matches, and candidate evidence; it does not return raw corpus text. `sanitizeForPersistence` removes raw samples and strips excerpts unless the user opts in to approved evidence retention.

## State and persistence

The browser state is a versioned `PersistenceEnvelope` under `voiceprint-profile-v3`. The current profile and up to eight sanitized history snapshots are persisted. A load failure falls back to the default profile rather than blocking the UI. Quota/private-mode failures are non-fatal because the in-memory workflow remains usable.

React state is kept in one workspace object for atomic profile/answer/history updates. Derived compiled Markdown is memoized by profile, target, register, and evidence-retention preference; it is never persisted as a second source of truth. Large corpus analysis uses a module Worker above a size threshold and falls back synchronously when Workers are unavailable.

## Adapter contract

An adapter receives a validated `VoiceprintProfile` and `{ register, includeEvidence }`, then returns a deterministic string. Built-in targets are `universal`, `codex`, `claude`, `chatgpt`, `cursor`, `gemini`, and `agent-skill`. `registerAdapter` and `createVoiceprintPackage` are the extension seams for future targets. New adapters must add a regression fixture and preserve the no-impersonation guardrail.

## Analyzer contract

`analyzeCorpus(samples)` accepts text plus safe source metadata and returns `CorpusAnalysis`:

- `analysisVersion`
- per-sample counts and consent/rights metadata without raw text
- deterministic metrics, per-register robust feature bands, quartiles, uncertainty, stability, outlier counts, and coverage
- language detection with abstention, duplicate detection, prose filtering, and explicit exclusion reasons
- warning/error issues
- contamination matches
- evidence candidates with feature IDs, claim-specific supporting spans, provenance, register, and confidence
- register-specific conflicts that prevent over-generalizing a pattern

A future local model or BYOK service can implement this result shape behind an explicit provider boundary. It must not silently change the privacy boundary or bypass user review. `scoreTextAgainstProfile` and `evaluateHeldOutSamples` are deterministic local gates, not authorship proofs. Feature drift is the primary score; habits and avoid-phrase checks are secondary. The CLI exposes the same score for local CI checks.

## Deliberate non-goals

- No hosted database or account system.
- No silent model-provider call.
- No automatic publication of a user profile.
- No claim that lexical heuristics reproduce a person perfectly.
- No persistence of raw writing samples by default.
