# Resume Workflow

## Principle

Every meaningful task writes durable state before the next task starts. A new chat should be able to read only `run-summary.md`, `plan.json`, and unfinished shards to continue.

## State Files

- `analysis-state/plan.json`: task list and statuses.
- `analysis-state/progress.jsonl`: append-only event stream.
- `analysis-state/shards/*.json`: batch extraction results.
- `analysis-state/checkpoints/*.json`: stage-level snapshots.
- `analysis-state/run-summary.md`: compact resume briefing.

## Task Rules

- Use small tasks. Avoid one huge "analyze everything" step.
- Mark a task `in_progress` before work starts.
- Mark it `completed`, `failed`, or `blocked` immediately after it ends.
- Append progress events for task start, completion, failure, and generated output.
- Refresh `run-summary.md` after each task.

## New Session Instructions

1. Read `analysis-state/run-summary.md`.
2. Read `analysis-state/plan.json`.
3. Run `node scripts/js-analyzer.mjs status --out <output-dir>`.
4. Run `node scripts/js-analyzer.mjs resume --out <output-dir>` when there are pending or failed tasks.
5. If the previous run is already complete and the user asks to analyze the same project again, ask whether they want a fresh analysis. Use `node scripts/js-analyzer.mjs analyze <target> --out <output-dir> --fresh` only after they choose to rebuild, or `--resume-existing` only when they explicitly choose to keep the old report.

## Rebuilds

Use `--force-rebuild-task <task-id>` to reset and rerun a specific task. Do not delete all output unless the user explicitly asks.
