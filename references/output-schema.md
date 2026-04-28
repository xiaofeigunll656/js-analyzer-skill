# Output Schema

The primary output is a human `project-report.md` written by Codex. The optional machine-readable helper output is `codex-js-leads.json`, produced by:

```bash
node scripts/codex-js-leads.mjs <target> --out analysis-output/<project-name>
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

The final Markdown report may cite `codex-js-leads.json/md` as a discovery aid, but its claims must be grounded in direct source reads, source-map review, or user-provided traffic evidence.
