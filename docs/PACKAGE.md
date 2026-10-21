# Portable package contract

Voiceprint's canonical JSON profile is the source of truth. The **Export portable package** action emits a JSON envelope with the following shape:

```json
{
  "profile": { "schemaVersion": "1.1.0", "...": "sanitized canonical profile" },
  "package": {
    "packageVersion": "1.0.0",
    "profileId": "profile-…",
    "profileVersion": 1,
    "generatedAt": "ISO-8601",
    "provenance": {
      "schemaVersion": "1.1.0",
      "analysisVersion": "local-heuristics-2",
      "sourceCount": 3
    },
    "install": {
      "universal": "…",
      "agents": "…"
    },
    "artifacts": {
      "universal": "…",
      "codex": "…",
      "claude": "…",
      "chatgpt": "…",
      "cursor": "…",
      "gemini": "…",
      "agent-skill": "…"
    }
  }
}
```

Artifacts are deterministic for the same profile, register, and evidence setting. The `agent-skill` and `codex` artifacts use Agent Skills-compatible frontmatter. The Cursor artifact is Markdown that can be moved into a project rules directory; ChatGPT and Gemini artifacts are paste-ready instruction blocks.

## Privacy contract

Packages do not contain raw corpus samples. Approved excerpts are omitted unless the user explicitly enables approved-evidence retention before export. Source IDs, labels, aggregate metrics, permission state, rights notes, evidence coverage, and spans are retained so a reviewer can understand provenance without receiving the full corpus.

## Installation examples

1. Import the `profile` object as canonical JSON into another Voiceprint-compatible client.
2. Copy `artifacts/agent-skill` into a compatible Agent Skills directory.
3. Copy `artifacts/codex` into a Codex skill file, or use the Claude/Cursor/ChatGPT/Gemini artifact in its platform-specific instruction surface.

The package is an export, not an authorization to impersonate another person. Users remain responsible for source rights, review, and any text they send.
