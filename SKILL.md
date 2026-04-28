---
name: js-analyzer-skill
description: Analyze authorized JavaScript, TypeScript, WeChat Mini Program, unpacked Mini Program, webpack/browserify bundle, minified, or obfuscated JS projects. Use when Codex needs to recover project structure, modules, APIs, request construction, configs, accounts, external assets, developer/operations signals, crypto/signature logic, Postman collections, Markdown reports, OpenAPI specs, local Swagger-style UI pages, or resumable long-running JS analysis workflows.
---

# JS Analyzer Skill

Analyze only projects the user is authorized to inspect. Treat the analysis output as a local engineering/security-audit artifact: preserve discovered values by default, including tokens, default accounts, appids, ak/sk, URLs, and internal service addresses. Use `--redact-secrets` only when the user explicitly wants a shareable redacted report.

## Fast Path

1. Check for prior progress before doing new work:

   ```bash
   node scripts/js-analyzer.mjs status --out analysis-output
   ```

2. Start or resume analysis:

   ```bash
   node scripts/js-analyzer.mjs analyze <target-project> --out analysis-output
   node scripts/js-analyzer.mjs resume --out analysis-output
   node scripts/js-analyzer.mjs analyze <target-project> --out analysis-output --fresh
   node scripts/js-analyzer.mjs discover-chunks --out analysis-output
   ```

3. Validate outputs:

   ```bash
   node scripts/validate-outputs.mjs analysis-output
   ```

4. Open or share these local artifacts:

   - `analysis-output/analysis.json`
   - `analysis-output/project-report.md`
   - `analysis-output/postman_collection.json`
   - `analysis-output/openapi.json`
   - `analysis-output/swagger-ui.html`
   - `analysis-output/analysis-state/supplement-candidates.json`
   - `analysis-output/analysis-state/run-summary.md`

When the user says "analyze the xxx project under the current directory", resolve `xxx` relative to the current workspace and use:

```bash
node scripts/js-analyzer.mjs analyze ./xxx --out ./analysis-output/xxx
```

Then read `./analysis-output/xxx/analysis-state/run-summary.md` before doing any manual follow-up.

`analyze` resumes only incomplete or failed plans. If `./analysis-output/xxx` already contains a completed analysis for the same target, the script must ask whether to re-analyze from scratch. In non-interactive runs it must stop instead of silently reusing old results; pass `--fresh` to rebuild clean outputs, or `--resume-existing` when the user explicitly wants to keep the completed report.

If a report shows no APIs after upgrading this skill, do not trust the old rendered report until extraction has been rebuilt. Re-run with a fresh output directory, or force the extraction stage to rebuild:

```bash
node scripts/js-analyzer.mjs analyze ./xxx --out ./analysis-output/xxx --fresh
node scripts/js-analyzer.mjs analyze ./xxx --out ./analysis-output/xxx --force-rebuild-task extract.plan-batches
node scripts/validate-outputs.mjs ./analysis-output/xxx
```

For Mini Program packages, first confirm the target is an unpacked/decompiled directory containing analyzable files such as `app-service.js`, page `.js` files, or downloaded H5/static JS. If APIs are still empty, inspect `analysis-state/run-summary.md`, run `discover-supplements`, then `resume`; many Mini Programs keep WebView/H5/plugin code outside the first unpacked bundle.

If the project is a downloaded web frontend or webpack/Vite bundle, inspect missing lazy chunks:

```bash
node scripts/js-analyzer.mjs discover-chunks --out ./analysis-output/xxx
```

Run remote downloads only after user approval. The downloader asks for each candidate by default:

```bash
node scripts/js-analyzer.mjs download-chunks --out ./analysis-output/xxx --base-url https://target.example.com/
node scripts/js-analyzer.mjs resume --out ./analysis-output/xxx
```

For Mini Program, H5, or plugin projects, discover high-confidence supplemental files before requesting network access. This records missing plugin providers, local cache search hints, WebView/H5 static entrypoints, remote JS, and source-map follow-ups:

```bash
node scripts/js-analyzer.mjs discover-supplements --out ./analysis-output/xxx
node scripts/js-analyzer.mjs download-supplements --out ./analysis-output/xxx --yes
node scripts/js-analyzer.mjs resume --out ./analysis-output/xxx
```

Supplement discovery performs a bounded local scan before recommending network work. It only scans the target directory, explicit `--local-cache-root` directories, and common WeChat DevTools cache roots, then records each search as `found_local_package` or `not_found` with scan limits and matched `.wxapkg` / unpacked directory paths. Only download candidates that are tied to current-project evidence such as `app-config.json` plugin declarations, H5 URLs literal in the project, or source-map comments from downloaded/static JS.

`download-supplements` is two-stage for H5 entries: after downloading an HTML shell, it extracts `<script src>`, manifest/precache assets, and `sourceMappingURL` comments into `nested_static_asset` / `source_map` candidates with `parentUrl`, `h5EntryUrl`, and `evidenceChain`. Re-run `download-supplements` to fetch those second-stage candidates after reviewing the evidence.

## Required Workflow

1. Read `analysis-state/run-summary.md` and `analysis-state/plan.json` first when they exist. Continue from the plan instead of restarting.
2. Inventory the project and classify it as source JS/TS, WeChat Mini Program, unpacked Mini Program, webpack/browserify bundle, or mixed.
3. Split work into small recoverable tasks. Do not load a huge project into context all at once.
4. Discover missing lazy chunks for bundle projects. Do not download remote chunks without explicit user approval.
5. Discover high-confidence supplemental files: missing Mini Program plugins, local cache/package search targets, WebView/H5 static entries, remote JS, and source maps.
6. Extract APIs, configs, accounts, external assets, developer signals, operations signals, third-party services, modules, features, and crypto/signature logic.
7. Attach evidence to every conclusion: file, line, snippet summary, confidence, and extraction method.
8. Write intermediate shards and checkpoints after each task. Refresh `analysis-state/run-summary.md` after every completed task.
9. Generate outputs only from `analysis.json`, not from separate hand-maintained copies.
10. Render `project-report.md` in Chinese by default. The report must start with an overview and an explicit structure/function/API map, then present API details in the repeatable shape: interface, parameter source, parameter table, minimal request example, response package, possible response example, and evidence.
11. When script output is incomplete, use the Codex method in `references/codex-analysis-method.md`: targeted `rg`, source-map reading, wrapper/interceptor tracing, and manual review of uncertain code slices.
12. Treat the bundled script as the deterministic first pass, not the whole analysis. If the API list is empty or obviously too small, combine tool output with Codex reasoning: search for API-looking literals, inspect nearby call sites, trace short/aliased wrappers, then rerun or patch extraction before rendering the final report.

## Resume Contract

Long analyses must be restartable after a closed chat, interrupted run, or context compaction.

- `analysis-state/plan.json` is the source of task truth.
- `analysis-state/progress.jsonl` is append-only event history.
- `analysis-state/shards/*.json` stores partial extraction results.
- `analysis-state/checkpoints/*.json` stores stage snapshots.
- `analysis-state/run-summary.md` is the first file a new Codex session should read.
- `analysis-state/chunk-candidates.json` stores lazy chunk candidates and download state.

Use:

```bash
node scripts/js-analyzer.mjs status --out <output-dir>
node scripts/js-analyzer.mjs resume --out <output-dir>
node scripts/js-analyzer.mjs discover-chunks --out <output-dir>
node scripts/js-analyzer.mjs download-chunks --out <output-dir> --base-url <origin>
node scripts/js-analyzer.mjs discover-sourcemaps --out <output-dir>
node scripts/js-analyzer.mjs download-sourcemaps --out <output-dir> --base-url <origin>
node scripts/js-analyzer.mjs discover-supplements --out <output-dir> [--local-cache-root <dir>[,<dir>]]
node scripts/js-analyzer.mjs download-supplements --out <output-dir>
node scripts/js-analyzer.mjs analyze <target-project> --out <output-dir> --force-rebuild-task <task-id>
node scripts/js-analyzer.mjs analyze <target-project> --out <output-dir> --fresh
node scripts/js-analyzer.mjs analyze <target-project> --out <output-dir> --resume-existing
```

## Output Model

Use `analysis.json` as the single data source. It must include:

- `project`: project identity, detected type, framework, package manager, build tool, Mini Program metadata, entrypoints, language, versions.
- `inventory`: source files, bundles, source maps, routes, chunks, config files, static assets.
- `chunkDiscovery`: lazy chunk candidates, missing local chunks, downloaded chunks, public paths, and base URL requirements.
- `sourceMapDiscovery`: local, guessed, missing, downloadable, and downloaded source-map candidates. Guessing is limited to confirmed project/downloaded JS and uses `file.js.map` / same-path `file.map`; unresolved guesses remain `needs_base_url` unless a `baseUrl`, `publicPath`, or downloaded JS source URL exists.
- `supplementDiscovery`: missing Mini Program plugins, bounded local cache scan results, WebView/H5 static entries, remote JS, downloaded supplemental files, and nested static asset/source-map candidates.
- `callGraph`: static function/call edges extracted from source, bundles, source-map virtual files, and webpack module/export/import alias edges.
- `callGraphStats`: raw/deduped/retained edge counts, limit, and `truncated` flag.
- `diagrams`: Mermaid `.mmd` outputs for website flow, intelligence map, call graph, and architecture.
- `modules`: business modules, responsibilities, routes/pages, source files.
- `features`: feature names, business role, UI/page location, related files, APIs, crypto references, mock data.
- `apis`: method, URL, base URL, path, query, headers, body, auth, content type, request construction, mocks, response hints, errors.
- `crypto`: algorithms, key/iv/signature sources, call sites, reuse scope, generated Node/Python helper scripts.
- `configs`: appids, base URLs, envs, tokens, ak/sk, API keys, client/app secrets, private keys, DB/Redis/Mongo/Postgres/MySQL connection strings, Authorization headers, JWTs, webhooks, SMTP credentials, payment keys, cloud provider credentials, AI/DevOps service tokens, feature flags, storage keys, build/channel values.
- `accounts`: discovered default/test accounts, usernames, passwords/passphrases, phone numbers, emails, tenant/org identifiers, and credential pairs inferred from literal objects or config assignments.
- `externalAssets`: APK/IPA/H5 downloads, GitLab/GitHub/Gitee, Nacos, Swagger/Knife4j, OSS/COS/S3/CDN, monitoring, webhook, registry, CI/CD, service discovery.
- `developerSignals`: names, emails, phones, source-map local paths, package maintainers, comments, build host/user hints.
- `operationsSignals`: gateways, logging, tracing, monitoring, config centers, service discovery, CI/CD, container/registry hints.
- `thirdPartyServices`: payment, OAuth/SSO/CAS, captcha, SMS, push, analytics, maps, IM, OCR, risk control, Sentry/Bugly/Firebase.
- `evidence`: exact source references and confidence.
- `uncertainties`: unconfirmed findings that need Codex or human review.

See `references/output-schema.md` and `references/analysis-ir.schema.json` for field details.

For Markdown layout and API-detail formatting, see `references/report-template.md`. Keep the Markdown report Chinese-first even when raw extracted identifiers, paths, or code snippets remain in their original language.

## Extraction Priorities

Prioritize findings that help an engineer understand and operate the project:

- Request construction: wrappers, interceptors, base URLs, headers, tokens, nonce/timestamp, signature flow.
- Webpack bundle request body flow: resolve `__webpack_require__.d(exports,{alias:function(){return localFn}})` / `n.d(t,{a:function(){return i}})` exports, `var api=n(2568)` imports, and `api.a({...})` callsites back to wrapper function parameters before falling back to broad regex inference.
- Obfuscated wrapper call sites: detect API calls hidden behind `Object(alias)("/path", data)`, short functions such as `s("/path", data)`, and framework helpers such as `this.$ajaxRequest("/path", data)` when the surrounding code, promise chaining, or strong path prefix indicates a request wrapper.
- API shape inference: derive path/query parameters from URL strings, request body/query examples from wrapper second arguments and same-file call-site object literals, and response hints from direct `res.data` / `success(res)` usage. Mark these as static inferred mocks unless confirmed by source docs or runtime evidence.
- Project shape: routes, pages, chunks, modules, feature names, menu/permission codes, i18n keys, event names.
- Runtime environment: dev/test/stage/pre/prod endpoints, WebSocket/SSE/MQTT/GraphQL, uploads/downloads.
- Sensitive values: hardcoded passwords/passphrases, default/test accounts, API keys, OAuth/client secrets, access/refresh/JWT tokens, Authorization headers, cookies/sessions, private keys/cert key material, database/Redis/Mongo/Postgres/MySQL credential URLs, cloud access keys, webhooks, SMTP credentials, payment keys, AI service keys, and DevOps tokens.
- External resources: APK/IPA, repositories, Nacos/Apollo/Consul/Eureka, Swagger/Knife4j, Jenkins/GitLab CI, Harbor, SonarQube, OSS/COS/S3/MinIO/CDN.
- People and operations: emails, phones, company/department names, source-map paths, build machine users, error reporting, monitoring, webhooks.
- Crypto: shared signature/encryption helpers should be modeled once and referenced by all dependent features/APIs.

## References

- Codex analysis method: `references/codex-analysis-method.md`
- Lazy chunk discovery: `references/chunk-discovery.md`
- Source map completion: `references/source-map-completion.md`
- AST/call graph mode: `references/ast-call-graph.md`
- Mermaid output: `references/mermaid-output.md`
- Website and intelligence summaries: `references/website-intelligence-analysis.md`
- Perspective checklists: `references/perspective-checklists.md`
- Analysis flow: `references/analysis-playbook.md`
- Resume workflow: `references/resume-workflow.md`
- Extraction patterns: `references/extraction-patterns.md`
- Crypto patterns: `references/crypto-patterns.md`
- External asset intelligence: `references/asset-intelligence.md`
- Output schema: `references/output-schema.md`
- Postman/OpenAPI rules: `references/postman-openapi-rules.md`
- Safety/evidence rules: `references/safety-and-evidence.md`

## Tools

The bundled scripts are intentionally usable without installing dependencies for a first pass. Install npm dependencies to enable stronger future AST, source-map, Postman, OpenAPI, and Swagger validation:

```bash
npm ci --ignore-scripts
```

Default scripts never execute target project code. Treat dynamic evaluation, deobfuscator execution, or target build scripts as separate, explicit user-approved work.
