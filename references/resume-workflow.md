# Resume Workflow

This Codex-only skill does not rely on a script-managed task engine. Resume by reading the user's latest request, prior `project-report.md`, and any scratch `codex-js-leads.json` when present.

## Recommended Local State

For long analyses, keep local state minimal under ignored output directories:

- `project-report.md`: current human report draft.
- `crypto-helper.mjs`: optional user-callable helper only when confirmed crypto/signature logic exists.
- `codex-js-leads.json`: optional scratch helper lead index, not a deliverable.
- `evidence/` or `analysis-output/`: ignored local evidence folders.

## New Session Instructions

1. Read the prior report or notes first.
2. Read `codex-js-leads.json` only as a scratch checklist when present.
3. Re-open the source files behind important claims.
4. Continue from the highest-risk gaps: request wrappers, sensitive configs, API parameters, response inference, source maps, chunks, and operations signals.
5. Refresh the Markdown report from source evidence.

Do not restart a large analysis just because a previous helper output exists. Do not trust helper output without re-reading source.
