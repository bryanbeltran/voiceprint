# Voiceprint Profile Schema

Current schema version: `1.1.0`.

Profiles at `1.0.0` are migrated on import. Unknown versions are rejected. The migration adds provenance, source metadata, evidence coverage, scope, and feature-analysis defaults without retaining raw corpus text.

The schema is the canonical source of truth. Markdown adapters are compiled artifacts and must not become a second, independently edited profile source.

## Top-level shape

```json
{
  "schemaVersion": "1.0.0",
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
    "analysisVersion": "local-heuristics-2",
    "sources": []
  },
  "review": {
    "pendingCount": 0,
    "lastReviewedAt": null
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
  "sampleIds": ["sample-1"],
  "span": { "start": 0, "end": 84 },
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
  "heldOut": false
}
```

## Feature bands

Each analyzed register stores deterministic feature bands rather than a single similarity score. Bands currently cover sentence and paragraph percentiles, lexical diversity, function-word rate, hedging, contractions, lowercase openings, Markdown density, and repeated openings. A feature report records the observed value, target range, coverage, confidence, and within/low/high/insufficient status. A held-out audit compares new text to these bands without adding that text to the profile.

## Compatibility rules

1. Migrate `1.0.0` to `1.1.0`; reject unknown schema versions until a migration is written and tested.
2. Keep adapter output deterministic for the same profile, target, register, and options.
3. Do not store raw corpus input in the profile or LocalStorage envelope.
4. Treat generated Markdown as disposable output; round-trip through canonical JSON for edits.
5. Add fixtures and a migration note for every schema change.
