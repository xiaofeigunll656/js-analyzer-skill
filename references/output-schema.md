# Output Contract

The required user-visible output is one Chinese `project-report.md` written by Codex.

Optional user-visible output is allowed only when confirmed request/response encryption, decryption, or signing exists and a reusable script will help the user. In that case, generate one Node.js helper, preferably `crypto-helper.mjs`, beside the report and document it in `project-report.md`.

Do not create user-visible Postman, OpenAPI, Mermaid, JSON, CSV, extra Markdown, screenshots, copied source, recovered bundles, or evidence dumps unless the user explicitly asks.

## Scratch Lead Helper

The optional machine-readable scratch helper output is `codex-js-leads.json`, produced by:

```bash
node scripts/codex-js-leads.mjs <target> --out analysis-output/<project-name> --json-only
```

## `codex-js-leads.json`

This file is an evidence index, not the final analysis.

Top-level fields:

- `schemaVersion`: starts with `codex-js-leads/`.
- `targetRoot`: absolute analyzed target path.
- `purpose`: reminder that the file is for Codex review.
- `project`: type hints, high-value files, and file counts.
- `files`: scanned text-like files.
- `leads`: category arrays.
- `leadCounts`: count per lead category.
- `evidence`: file/line/snippet evidence records.
- `codexReviewChecklist`: review prompts for Codex.

Lead categories:

- `apis`
- `requestCalls`
- `sensitiveConfigs`
- `accounts`
- `domains`
- `apiDocs`
- `repositories`
- `operations`
- `crypto`
- `sourceMaps`
- `chunks`
- `developerSignals`

## Evidence Rules

Every useful finding in the final report must still be manually reviewed. Helper evidence should include file path, line number, category, value, and snippet. Confidence values are prompts for review, not facts.

## Final Report

The final Markdown report should not list scratch helper files as deliverables. Its claims must be grounded in direct source reads, source-map review, or user-provided traffic evidence.

If `crypto-helper.mjs` is generated, `project-report.md` must include the script path, commands, required inputs, exact API/wrapper usage locations, and limitations.
