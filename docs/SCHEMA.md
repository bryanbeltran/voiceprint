# Voiceprint Profile Schema

Current schema version: `1.2.0`.

Profiles at `1.0.0` and `1.1.0` are migrated on import. Unknown versions are rejected. The migration adds provenance, source metadata, evidence coverage, scope, robust feature-analysis defaults, language/duplicate metadata, and conflict records without retaining raw corpus text.

The schema is the canonical source of truth. Markdown adapters are compiled artifacts and must not become a second, independently edited profile source.

## Top-level shape

```json
{
  "schemaVersion": "1.2.0",
  "profileId": "profile-…",
  "version": 1,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "subject": {
    "name": "…",
    "role": "…",
    "audience": "…"
  },
  "style": {
    "tone": "…",
    "energy": "…",
    "formality": "…"
  },
  "preferences": {
    "readerFeeling": "…",
    "reachFor": "…",
    "avoid": "…",
    "signOff": "…",
    "habits": {
      "contractions": true,
      "shortParagraphs": true,
      "plainLanguage": true,
      "emDash": false
    },
    "customRules": []
  },
  "registers": {
    "default": { "label": "Default", "purpose": "…", "tone": "…", "rules": [], "fallbackTo": "default" },
    "email": {},
    "chat": {},
    "public": {},
    "technical": {}
  },
  "evidence": [],
  "provenance": {
    "mode": "interview | corpus",
    "sampleCount": 0,
    "retainedRawText": false,
    "corpusHash": null,
    "analysisVersion": "local-heuristics-3",
    "sources": []
  },
  "review": {
    "pendingCount": 0,
    "lastReviewedAt": null,
    "conflicts": []
  }
}
```

## Evidence record

Evidence is a candidate claim, not an instruction automatically applied to the profile.

```json
{
  "id": "evidence-…",
  "claim": "Keep paragraphs focused and relatively short.",
  "excerpt": "A source excerpt, only retained when explicitly approved",
  "sourceType": "interview | corpus | manual",
  "sourceRef": "sample-1 or interview field",
  "sourceId": "sample-1",
  "featureId": "questions",
  "sampleIds": ["sample-1"],
  "span": { "start": 0, "end": 84 },
  "supports": [
    { "sampleId": "sample-1", "sourceId": "sample-1", "excerpt": "A source excerpt", "span": { "start": 0, "end": 84 } }
  ],
  "coverage": 0.75,
  "scope": "global | register",
  "permission": "owned | licensed | authorized | unknown",
  "rightsNote": "…",
  "register": "default | email | chat | public | technical",
  "confidence": "low | medium | high",
  "status": "pending | approved | rejected",
  "createdAt": "ISO-8601"
}
```

`sourceType` may also be `edit`. Corpus evidence has a feature ID and claim-specific supporting spans; a conflict record names registers whose measured behavior should not be generalized globally.

Only approved evidence can create a `preferences.customRules` entry. Editing a rule changes the claim, preserves the source reference, and never fabricates an excerpt. Persistence strips excerpts by default; a user must opt in to retain approved excerpts locally.

## Corpus source metadata

Corpus input accepts a label, register, permission, consent flag, rights note, redaction setting, and held-out flag. The persisted profile keeps only sanitized metadata and aggregate measurements:

```json
{
  "id": "email-1",
  "label": "Team update",
  "register": "email",
  "permission": "owned",
  "consentGranted": true,
  "rightsNote": "Written by me",
  "redacted": true,
  "wordCount": 320,
  "characterCount": 1900,
  "heldOut": false,
  "sourcePath": "email/team-update.html",
  "format": "html",
  "language": "en",
  "languageConfidence": 0.94,
  "proseScore": 0.88,
  "included": true
}
```

Source formats are `plain-text`, `markdown`, `html`, `json`, or `unknown`. Samples may be marked as `consent`, `held-out`, `duplicate`, `non-prose`, or `unsupported-language` exclusions. Language detection abstains instead of pretending that English heuristics are reliable for an unsupported corpus.

## Feature bands

Each analyzed register stores deterministic feature bands rather than a single similarity score. Bands cover sentence and paragraph percentiles/spread, sentences per paragraph, average word length, lexical diversity, function words, first/direct/third-person rates, hedging, contractions, questions, exclamations, punctuation, parentheticals, lowercase openings, Markdown/list structure, and repeated openings. A feature band records the observed value, robust target range, coverage, confidence, status, sample count, outlier count, stability, and uncertainty. A held-out audit compares new text to these bands without adding that text to the profile; its feature-first report contains no source text.

## Compatibility rules

1. Migrate `1.0.0` and `1.1.0` to `1.2.0`; reject unknown schema versions until a migration is written and tested.
2. Keep adapter output deterministic for the same profile, target, register, and options.
3. Do not store raw corpus input in the profile or LocalStorage envelope.
4. Treat generated Markdown as disposable output; round-trip through canonical JSON for edits.
5. Add fixtures and a migration note for every schema change.

The `1.0.0 → 1.2.0` and `1.1.0 → 1.2.0` migrations are deterministic: they normalize legacy evidence and feature bands, preserve aggregate metrics and issues, add empty language/conflict metadata, and never reconstruct or retain raw samples. Unsupported versions return an explicit validation error.
