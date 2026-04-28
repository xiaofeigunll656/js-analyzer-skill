# Analysis Playbook

Use this playbook to guide Codex's own analysis. Scripts can support the workflow, but the report quality comes from reading, tracing, and judgment.

## Start

1. Resolve the target path and confirm it is inside the authorized workspace.
2. Inspect existing local analysis state if present:
   - `analysis-state/run-summary.md`
   - `analysis-state/plan.json`
   - prior `project-report.md`
   - prior `analysis.json` only as raw material, not as truth
3. If a prior run is incomplete, continue the useful work. If it is complete but weak, refresh it from source.
4. Read `codex-analysis-method.md` for the human/Codex reasoning layer.
5. Use `perspective-checklists.md` before final reporting to fill gaps from intelligence, website, architecture, development, normal-user, and authorized-pentest perspectives.

## Project Type Detection

Classify with cumulative evidence:

- WeChat Mini Program source: `app.json`, `project.config.json`, `pages/**`, `.wxml`, `.wxss`, `wx.request`.
- Unpacked Mini Program: `app-service.js`, `page-frame.html`, split app/page service files, many minified page modules.
- Webpack/browserify bundle: `__webpack_require__`, `webpackJsonp`, `self.webpackChunk`, source map comments, chunk files.
- Source JS/TS project: `package.json`, `src/`, framework dependencies, readable modules.
- Mixed project: source plus bundles, Mini Program plus WebView/H5, or multiple app shells.

## Inventory

Record all useful files, not only JS:

- Source: `.js`, `.jsx`, `.ts`, `.tsx`, `.vue`, `.mjs`, `.cjs`.
- Mini Program: `.json`, `.wxml`, `.wxss`, `.wxs`.
- Bundles/maps: `.map`, chunk files, minified JS.
- Config/static: `.html`, `.css`, package manifests, app configs, mock data, docs.

Skip generated dependency folders unless the target project itself is a bundle.

Treat source maps as virtual source directories. If `sourcesContent` exists, analyze each source string as if it were a real source file and preserve both the `.map` file and original source name in evidence.

## Analysis Order

Prefer this order:

1. Manifests, routes, pages, and entrypoints.
2. Request wrappers, interceptors, auth helpers, storage helpers, and environment config.
3. API call sites and nearby request body/query construction.
4. Response handling, table/form bindings, stores, mock files, and TypeScript interfaces.
5. Crypto/signature helpers and their callers.
6. External assets, operations endpoints, repositories, docs systems, monitoring, and third-party services.
7. Feature/module grouping from routes, UI text, permissions, events, and API prefixes.
8. Missing chunks/source maps/plugins/H5 supplements.

## Lazy Chunks

Bundle projects may be incomplete when the user downloaded only currently loaded scripts. Discover chunk candidates after classification. Record missing candidates even when they cannot be downloaded yet because the origin/base URL is unknown.

Download only after user approval. Store downloaded chunks under local analysis output and then inspect them as additional source.

## Source Map Completion

Discover source maps for web bundles. Download missing source maps only after user approval. Analyze downloaded maps through their `sourcesContent` and original source names.

## AST and Call Graph

Use call graph data as leads, not as a substitute for reading. Connect pages, wrappers, API calls, crypto helpers, assets, and operations integrations. Keep evidence references and confidence.

## Extraction

For each finding, capture:

- value and normalized value
- type/category
- source file and line when available
- snippet summary
- why it matters
- confidence and uncertainty

Extract in this order:

1. URLs, domains, IPs, repositories, downloads, config centers, Swagger/Knife4j/YApi/Apifox, storage/CDN, monitoring, webhooks.
2. Lazy chunk candidates, public paths, dynamic imports, and source-map URLs.
3. Request calls, wrappers, interceptors, request bodies, headers, and response handling.
4. Configs, accounts, tokens, appids, storage/cookie keys.
5. Crypto/signature functions and call sites.
6. Modules, features, routes, pages, permissions, event names.
7. Source-map paths and developer/operations signals.

## Merge

Deduplicate by normalized value plus source category. Preserve multiple evidence references. Keep low-confidence but useful leads in `uncertainties`.

If script output conflicts with source review, trust source review and explain the conflict.

## Render

Write the Markdown report when the evidence is ready, even if no `analysis.json` exists.

Render Postman, OpenAPI, local HTML, Mermaid diagrams, or `analysis.json` when they are useful or requested. If both Markdown and machine outputs exist, keep their core facts aligned.
