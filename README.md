# Voiceprint

Voiceprint is a local-first, open personal voice compiler for AI tools. It turns a guided interview or writing samples into an inspectable, versioned profile, then compiles that profile into portable instructions and Agent Skills for Codex, Claude, ChatGPT, Cursor, Gemini, or a generic Markdown prompt.

The repository is a proper React + TypeScript application. It has no backend and makes no model-provider call: analysis, persistence, and compilation happen in the browser.

## Product surface

- Guided interview with a live canonical profile preview.
- Corpus mode for pasted or uploaded TXT/Markdown samples.
- Deterministic local heuristics for rhythm, paragraph shape, contractions, lexical diversity, function words, pronouns, hedging, openers, punctuation/formatting, message structure, source-fidelity signals, and instruction-like contamination.
- Per-register feature bands, percentiles, held-out evaluation reports, exact supporting spans, sample coverage, consent, source rights, redaction, and profile-relative drift/coaching reports.
- Evidence queue with confidence, provenance, register, and approve/edit/reject controls.
- Register-aware compilation for default, email, chat, public/social, and technical writing.
- Universal, Codex, Claude, ChatGPT, Cursor, Gemini, standard Agent Skills, portable package manifests, and canonical JSON exports.
- Local profile persistence with raw corpus text and unapproved excerpts removed by default.
- Version snapshots, restore, diffing, reset, import/export, blind A/B comparison, deterministic per-feature scoring, golden analyzer fixtures, held-out audits, and adapter regression fixtures.
- Responsive, keyboard-accessible UI with reduced-motion support and a testable React component boundary.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open the Vite URL printed in the terminal. Production checks are:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run verify
```

`npm run verify` runs the typecheck, lint, unit/component tests, production build, and built-entry assertions in one gate. `npm run preview` serves the production bundle locally.

The UI's **Export portable package** action creates a sanitized package containing the canonical profile, provenance, install guidance, deterministic artifacts for every supported target, and register-specific artifacts. See [docs/PACKAGE.md](docs/PACKAGE.md) for the contract.

## Architecture

```text
src/main.tsx → src/App.tsx → React components
                         └── domain/
                             ├── profile/schema.ts       canonical schema + invariants
                             ├── corpus/analyzer.ts      local analysis + contamination
                             ├── compiler/adapters.ts    deterministic target adapters
                             ├── evaluation/scoring.ts   blind comparison signals
                             └── persistence/storage.ts  sanitized local envelope
```

The UI owns interaction state, browser file APIs, downloads, and rendering. The domain layer owns profile invariants and pure transformations, so it can be tested without a browser and can later receive a local-model/BYOK analyzer behind the same typed contract. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SCHEMA.md](docs/SCHEMA.md), and [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## Privacy model

Interview-derived profile state is stored in browser LocalStorage under a versioned envelope. Corpus samples are held in memory for the current session and never written to the persisted profile. Raw samples, `rawSamples`, and unapproved evidence excerpts are stripped before persistence. Approved excerpts are retained only when the user enables that setting. Export is always explicit.

This is a client-side privacy boundary, not a guarantee against a compromised browser, device, extension, screenshot, or exported file. No provider key or network request is required for the default path.

## Scope and extension seams

The canonical profile is schema version `1.1.0`; imports from `1.0.0` are migrated deterministically. Markdown adapters and package artifacts are compiled outputs, not a second source of truth. `registerAdapter`, `analyzeCorpus`, the typed `CorpusAnalysis` result, and `createVoiceprintPackage` are the documented seams for future targets and analyzers. Unknown profile schema versions are rejected until an explicit migration exists.

Deliberate non-goals for this release are a hosted database, accounts, silent provider calls, automatic publication, and claims that heuristics reproduce a person perfectly.

## Hosting

The app builds to `dist/` and can be hosted by any static host. The public source has no provider-specific deployment dependency and must not publish user profile data.

## License and data ownership

The code is licensed under MIT. User corpora, profiles, and exports remain the user’s data and are not used for project training by this application. See [LICENSE](LICENSE).
