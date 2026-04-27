# Codex Commit Safety

This repository is a public Codex skill. Data safety is the first priority.

## Commit Scope

Commit only reusable skill files:

- `SKILL.md`
- `README.md`, `README.en.md`
- `package.json`
- `.gitignore`, `AGENTS.md`
- `agents/**`
- `scripts/**`
- `references/**`
- `assets/**`

Never commit local analysis results, user target projects, recovered source code from real targets, screenshots of private reports, credentials, tokens, internal URLs, account data, or generated output.

Forbidden paths include:

- `analysis-output/**`
- `reports/**`
- `evidence/**`
- `*.analysis-output/**`
- `tests/**`
- `node_modules/**`
- `.env*`
- `*.wxapkg`
- `*.har`
- `*.pcap`
- archive files that may contain target data, such as `*.zip`, `*.7z`, `*.rar`, `*.tar`, `*.gz`

## Before Commit

When Codex commits in this repo:

1. Run `git status --short --untracked-files=all`.
2. Stage files by explicit path. Do not rely on broad `git add .` for normal work.
3. Run `npm test`.
4. Run `node scripts/check-public-safety.mjs --staged`.
5. Run `git diff --cached --name-only` and confirm every path belongs to the reusable skill.

If the user asks to commit everything, still apply this policy. Ask before staging any file outside the reusable skill paths.

## Fixtures

Use only synthetic fixtures with fake domains such as `example.test`, fake accounts, and minimal code. Keep public smoke-test fixtures under `assets/synthetic-fixtures/**`.

Do not place real customer, client, Mini Program, website, source-map, API, token, or report data in public fixtures. Keep local/private experiments under ignored directories such as `tests/**` or `analysis-output/**`.

## Skill Functionality

The skill must remain usable from the GitHub checkout. Keep scripts and required assets committed. Do not depend on ignored local files for normal analysis.
