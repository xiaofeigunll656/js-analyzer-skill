# Analysis Playbook

## Start

Always inspect `analysis-state/` first. If `plan.json` exists, run `status` or `resume`. Never restart a large project without checking existing shards.

When the user gives a natural prompt such as "analyze the xxx project under the current directory", resolve `xxx` relative to the current workspace and use an output directory named after the target project, for example `analysis-output/xxx`.

For the human/Codex reasoning layer, also read `codex-analysis-method.md`.

After the first scripted report, use `perspective-checklists.md` to fill gaps from intelligence, website, architecture, development, normal-user, and authorized-pentest perspectives.

## Project Type Detection

Classify with cumulative evidence:

- WeChat Mini Program source: `app.json`, `project.config.json`, `pages/**`, `.wxml`, `.wxss`, `wx.request`.
- Unpacked Mini Program: `app-service.js`, `page-frame.html`, split app/page service files, many minified page modules.
- Webpack/browserify bundle: `__webpack_require__`, `webpackJsonp`, `self.webpackChunk`, source map comments, chunk files.
- Source JS/TS project: `package.json`, `src/`, framework dependencies, readable modules.
- Mixed project: source plus bundles, Mini Program plus webview/H5, or multiple app shells.

## Inventory

Record all useful files, not only JS:

- Source: `.js`, `.jsx`, `.ts`, `.tsx`, `.vue`, `.mjs`, `.cjs`.
- Mini Program: `.json`, `.wxml`, `.wxss`, `.wxs`.
- Bundles/maps: `.map`, chunk files, minified JS.
- Config/static: `.html`, `.css`, package manifests, app configs.

Skip generated dependency folders unless the target project itself is a bundle.

Treat source maps as virtual source directories. If `sourcesContent` exists, analyze each source string as if it were a real source file and preserve both the `.map` file and original source name in evidence.

## Lazy Chunks

Bundle projects may be incomplete when the user downloaded only currently loaded scripts. Run chunk discovery after classification. Record missing chunk candidates even when they cannot be downloaded yet because the origin/base URL is unknown.

Download only after user approval. Store downloaded chunks under `analysis-output/downloaded-chunks/` and then resume analysis so those files are extracted as additional input.

## Source Map Completion

Run source-map discovery for web bundles. Download missing source maps only after user approval. Store downloaded maps under `analysis-output/downloaded-sourcemaps/`; then resume analysis so `sourcesContent` enters the extraction batches.

## AST and Call Graph

Use `analysis.callGraph` to connect pages, wrappers, API calls, crypto helpers, assets, and operations integrations. Treat call graph edges as review leads and keep evidence references.

## Mermaid Diagrams

Render diagrams into `analysis-output/diagrams/` and embed them in Markdown. Use them for website-flow, intelligence-map, call-graph, and architecture review.

## Extraction

Run extraction in small batches. For each batch, write one shard. A failed batch should not invalidate completed batches.

Extract in this order:

1. URLs, domains, IPs, repositories, downloads, config centers, Swagger docs, storage/CDN, monitoring, webhooks.
2. Lazy chunk candidates, public paths, dynamic imports, and source-map URLs.
3. Request calls and wrappers.
4. Configs, accounts, tokens, appids, storage/cookie keys.
5. Crypto/signature functions and call sites.
6. Modules, features, routes, pages, permissions, event names.
7. Source-map paths and developer/operations signals.

## Merge

Deduplicate by normalized value plus source category. Preserve multiple evidence references. Keep low-confidence but useful leads in `uncertainties`.

## Render

Render Markdown, Postman, OpenAPI, and HTML only after `analysis.json` is updated. Rendering can be repeated safely.
