# Threat model

## Assets

- User writing samples, which can contain confidential work or personal information.
- The canonical voice profile and approved evidence excerpts.
- Exported files that may be copied into agent configuration or repositories.
- LocalStorage state in the browser origin.
- Source permission and rights declarations that must remain auditable without exposing the source corpus.

## Trust boundaries

1. The user’s browser page is the processing boundary for the Vite client build.
2. File uploads and pasted text are untrusted input.
3. Generated Markdown and JSON are user-controlled output and may be passed to other agents.
4. A future BYOK/local provider is an explicit new boundary and must not be enabled silently.

## Threats and controls

| Threat | Control | Residual risk |
| --- | --- | --- |
| Sensitive corpus leaves the device | No network call in the client build; browser-only analysis; no raw-corpus persistence | A compromised browser/device can still read in-memory data |
| User analyzes material they are not allowed to use | Consent checkbox, permission enum, rights note, unknown-rights warning, and explicit user review | Voiceprint cannot verify ownership or legal rights |
| Direct identifiers enter evidence | Optional local redaction for emails, phones, and token-like secrets before analysis; raw text is not persisted | Redaction is heuristic and may miss identifiers |
| Prompt injection in writing samples | Heuristic detection for instruction-like text; warning shown before review; provenance is visible | Detection is not exhaustive; user review remains required |
| XSS through user text | User text is rendered as `textContent` or escaped HTML; generated profile is placed in `<pre>` | Future UI changes must preserve the escaping boundary |
| Accidental retention | Sanitizer removes `rawSamples` and unapproved excerpts before LocalStorage | Browser history, extensions, screenshots, or exported files may retain data |
| Profile corruption | Versioned schema, validation, stable IDs, import checks, and reset control | Unknown future schema versions require explicit migration |
| Package exposes private corpus text | Package export sanitizes raw samples and unapproved excerpts; artifacts contain claims only when evidence inclusion is enabled | User can intentionally export approved excerpts or copy them into a third-party tool |
| Misleading voice cloning | UI and adapter guardrail describe a profile, not identity impersonation; no invented quotes | Users can still misuse exported instructions outside the app |
| Malicious or oversized files | Input normalization and per-sample character limits; only text file types are offered | Browser file APIs and availability are platform-dependent |

## Operational requirements for a hosted/BYOK mode

Before adding a backend or model provider, document provider names, retention, encryption, deletion, request logging, key storage, failure behavior, consent, and whether raw corpus text can be sent. Add an explicit setting and an observable data-flow status. Hosted mode must remain private unless the owner explicitly changes the Site audience.
