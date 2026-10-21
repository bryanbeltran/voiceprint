# Contributing

## Development loop

1. Make the smallest coherent change at the owning layer.
2. Add or update a domain or integration test for every new invariant or user-visible flow.
3. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run verify`.
4. For UI changes, serve the production bundle with `npm run preview` and check the critical flow in a browser, including an accessibility audit.
5. Update the relevant schema, architecture, privacy, threat-model, or evidence documentation.

## Change rules

- Keep the default path local and provider-free.
- Do not add an account, backend, provider, or persistence surface without an explicit data-flow and lifecycle design.
- Never attribute a generated quote to a user without an approved source excerpt.
- Edit `src/` and run `npm run build`; do not hand-edit generated `dist/` assets.
- Preserve the existing private audience and `.openai/hosting.json` project ID unless the owner explicitly requests a hosting change.
- Keep adapter output deterministic and add regression coverage for new targets.
- Avoid adding dependencies unless they support a lifecycle requirement or a quality gate; document material trade-offs.

## Pull request checklist

- [ ] Canonical schema and validation behavior are covered.
- [ ] Sensitive-input handling is documented.
- [ ] Focused tests pass.
- [ ] Typecheck, lint, production build, and verification pass.
- [ ] Browser critical path checked when UI changed.
- [ ] Accessibility audit has no reported violations.
- [ ] README/docs explain new trade-offs or limitations.
