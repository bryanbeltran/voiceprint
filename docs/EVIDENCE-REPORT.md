# Verification evidence

This file records the implementation gates for the React/TypeScript migration. Last verified: 2026-10-21 UTC.

## Repository gates

- `npm run typecheck` — passed with strict TypeScript and no emit.
- `npm run lint` — passed with zero warnings/errors.
- `npm test` — passed: 2 test files, 18 tests.
  - Domain: schema, adapters, corpus contamination, persistence sanitization, evidence decisions, versioning/diffs, import/export, scoring, regression fixtures.
  - Integration: live preview, corpus analysis and approval, LocalStorage sanitization, blind comparison, canonical import, responsive DOM smoke.
- `npm run build` — passed with Vite production bundle and source map.
- `npm run verify` — the combined gate for typecheck, lint, tests, build, and built-entry markers.
- `npm audit` and `npm audit --omit=dev` — passed with zero vulnerabilities after the Vitest 5.0.5 upgrade.
- `git diff --check` — passed.

## Browser gates

The production bundle should be served with `npm run preview` and checked in a real browser before deployment. Required checks:

1. Interview input updated the canonical preview without a page reload (`Ada Lovelace` appeared in the compiled profile).
2. Corpus textarea analysis produced metrics and candidate evidence; register-scoped analysis and a real `.txt` upload were verified.
3. Evidence approval updated the review queue, and the compiled profile reflected the approved rule.
4. Codex output contained the expected front matter and all five adapter regression fixtures returned `PASS`.
5. A real `File` delivered through a browser `DataTransfer` event imported successfully as `Imported browser profile · Voice Profile`.
6. Blind A/B comparison hid source labels until selection and then revealed deterministic scores (`75` vs `75` in the final smoke flow).
7. At a 390px viewport, `document.documentElement.scrollWidth` and `document.body.scrollWidth` were both `390px`; no horizontal overflow was present.
8. Axe 4.12.1 reported `0` violations and `0` incomplete checks. Labels, live regions, and keyboard-visible focus styles are present in the accessibility tree and CSS.
9. Local production vitals sample: FCP `184ms`, LCP `184ms`, CLS `0`, TTFB `6.7ms`.

10. Browser `File`/`DataTransfer` import delivered a real file to the React handler; the integration test and browser smoke both confirmed the imported profile path.
11. LocalStorage inspection after import contained no raw uploaded sample text.
12. Draft audit reported register-relative drift and coaching without rewriting or sending the draft.
13. Supporting evidence spans were disclosed for approved rules, including coverage/confidence and register scope.

## Hosting

- The app is a static Vite build; `npm run build` writes the production bundle to `dist/`.
- This public repository does not track provider-specific deployment configuration or a hosted profile-data endpoint.

## Known limitations

- The analyzer is intentionally heuristic and does not claim to reproduce a person perfectly.
- The app is local-first and has no synchronized account or provider integration yet.
- Direct `agent-browser upload` is flaky in this environment; the import handler itself is proven with a real browser `File`/`DataTransfer` change event and the React integration test.
- The code license is MIT; provider-specific deployment configuration remains local and is not part of the public source contract.
