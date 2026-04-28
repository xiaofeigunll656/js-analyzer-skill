# Analysis Playbook

Use this playbook to guide Codex's own analysis. The small helper script can collect leads, but report quality comes from reading, tracing, and judgment.

## Start

1. Resolve the target path and confirm it is inside the authorized workspace.
2. Read prior local notes, `project-report.md`, or `codex-js-leads.md/json` when present.
3. If a prior report is weak or script-heavy, refresh from source.
4. Use `codex-analysis-method.md` for the reasoning flow.
5. Use `perspective-checklists.md` before final reporting.

## Project Type Detection

Classify with cumulative evidence:

- WeChat Mini Program source: `app.json`, `project.config.json`, `pages/**`, `.wxml`, `.wxss`, `wx.request`.
- Unpacked Mini Program: `app-service.js`, `page-frame.html`, split app/page service files, minified page modules.
- Webpack/browserify bundle: `__webpack_require__`, `webpackJsonp`, `self.webpackChunk`, source map comments, chunk files.
- Source JS/TS project: `package.json`, `src/`, framework dependencies, readable modules.
- Mixed project: source plus bundles, Mini Program plus WebView/H5, or multiple app shells.

## Analysis Order

1. Manifests, routes, pages, and entrypoints.
2. Request wrappers, interceptors, auth helpers, storage helpers, and environment config.
3. API call sites and nearby request body/query construction.
4. Response handling, table/form bindings, stores, mock files, and TypeScript interfaces.
5. Sensitive configs, accounts, appids, tokens, ak/sk, private keys, webhooks, DSNs, and storage buckets.
6. Crypto/signature helpers and callers.
7. External assets, operations endpoints, repos, API docs, monitoring, and third-party services.
8. Feature/module grouping from routes, UI text, permissions, events, and API prefixes.
9. Missing chunks/source maps/plugins/H5 supplements.

## Lead Helper

For large or minified projects, generate a lead index:

```bash
node scripts/codex-js-leads.mjs <target> --out analysis-output/<project-name>
```

Review the generated Markdown first, then inspect the source files behind high-confidence leads. Do not copy helper output into the report without manual confirmation.

## Merge And Report

Deduplicate by normalized value plus source category. Preserve multiple evidence references. Keep low-confidence but useful leads in `不确定项/待复核`.

Write Markdown when the evidence is ready. Optional Postman/OpenAPI/Mermaid artifacts can be created by Codex from the final evidence-backed API model when the user asks for them.
