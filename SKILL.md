---
name: js-analyzer-skill
description: AI-led analysis of authorized JavaScript, TypeScript, WeChat Mini Program, unpacked Mini Program, webpack/browserify bundle, minified, or obfuscated frontend projects. Use when Codex needs to inspect code directly and produce useful evidence-backed Markdown reports, API request/response reconstruction, request wrapper analysis, configs, accounts, external assets, developer/operations signals, crypto/signature logic, Postman collections, OpenAPI specs, local Swagger-style UI pages, or resumable long-running JS analysis workflows. Bundled scripts are optional helpers, not the primary analyst.
---

# JS Analyzer Skill

Analyze only projects the user is authorized to inspect. Treat findings as local engineering/security-audit artifacts: preserve discovered values by default, including tokens, default accounts, appids, ak/sk, URLs, and internal service addresses. Redact only when the user explicitly wants a shareable report.

## Operating Principle

Codex is the analyst. Scripts are helpers.

Do not turn the task into "run a script and paste whatever it produced." Read source files, trace request flow, compare evidence, infer carefully, and write a report a human engineer can actually use. Use bundled scripts only when they accelerate repeatable work such as indexing, lazy-chunk/source-map discovery, resumable state, validation, Postman/OpenAPI generation, or local Swagger-style UI output.

Script output is never authoritative by itself. If a script misses APIs, returns an empty list, misclassifies a wrapper, or produces a thin report, inspect the code directly and correct the analysis with evidence.

## Default AI-Led Workflow

1. Resolve the target path from the user's prompt. For "analyze the xxx project under the current directory", inspect `./xxx`.
2. Check for existing local analysis state only to avoid losing work:
   - Read `<out>/analysis-state/run-summary.md`, `<out>/analysis-state/plan.json`, and any existing `<out>/project-report.md` when present.
   - If an old completed report exists, do not silently reuse it as the answer. Either refresh it from source or ask the user before relying on it.
3. Inventory the project with targeted file listing, not by loading the whole tree into context. Classify it as source JS/TS, WeChat Mini Program source, unpacked Mini Program, webpack/browserify bundle, minified/obfuscated bundle, or mixed.
4. Read the high-leverage files first:
   - manifests: `package.json`, `app.json`, `project.config.json`, `ext.json`, router/build config
   - request layer: API directories, request/http/service wrappers, interceptors, auth/token helpers
   - entrypoints/pages/routes/components and source-map `sourcesContent` when available
   - bundles/runtime chunks that define module loading, public paths, and wrapper aliases
5. Build a working evidence notebook while reading. Keep each conclusion tied to file, line, snippet summary, confidence, and uncertainty.
6. Trace request construction before listing APIs:
   - base URL/env selection
   - wrapper/interceptor behavior
   - headers, token/tenant/org IDs, cookies/storage keys
   - nonce/timestamp/signature/encryption flow
   - call sites and object literals that supply query/body data
7. Reconstruct APIs as an engineer would:
   - request package: method, full URL/base/path, query, headers, body, auth/signature steps, minimal request example
   - response package: live HAR/traffic response when provided; otherwise infer from `res.data`, `success(res)`, `.then(...)`, destructuring, table/form fields, mock files, or docs in the project
   - parameter table: name, location, required/optional guess, source, meaning, evidence
   - confidence and caveats for every inferred field
8. Review from multiple perspectives before writing the final report: project architect, senior developer, website/product analyst, intelligence analyst, normal user, and authorized pentest engineer when appropriate. Use `references/perspective-checklists.md`.
9. Write the human report in Chinese by default. The report comes first; machine artifacts are optional unless the user asked for them.
10. Validate the report by doing at least one miss-finding pass: search for likely unreported APIs, domains, storage keys, auth headers, crypto/signature terms, source maps, chunks, and operations endpoints. Add gaps to `uncertainties` instead of hiding them.

## When To Use Scripts

Use scripts deliberately, with Codex review before and after.

Good uses:

- `status` / `resume`: continue a long run that already has durable state.
- `discover-chunks`, `discover-sourcemaps`, `discover-supplements`: find missing local/remote artifacts that direct reading suggests may exist.
- `analyze`: create a broad first-pass index for a large bundle or generate machine artifacts, then manually audit the important findings.
- `validate-outputs`: check generated `analysis.json`, Markdown, Postman, OpenAPI, and HTML outputs after they exist.
- `render`: regenerate machine-readable outputs after Codex has corrected or enriched structured data.

Avoid:

- Running `analyze` as the first and only analysis step.
- Re-running scripts repeatedly when the real problem is an untraced wrapper, missing source map, dynamic request body, or weak report writing.
- Reporting "no APIs found" until Codex has searched URL literals, request wrappers, obfuscated wrapper call sites, routes, source maps, and nearby call-site objects.

Useful commands:

```bash
node scripts/js-analyzer.mjs status --out <output-dir>
node scripts/js-analyzer.mjs analyze <target-project> --out <output-dir>
node scripts/js-analyzer.mjs resume --out <output-dir>
node scripts/js-analyzer.mjs discover-chunks --out <output-dir>
node scripts/js-analyzer.mjs discover-sourcemaps --out <output-dir>
node scripts/js-analyzer.mjs discover-supplements --out <output-dir>
node scripts/validate-outputs.mjs <output-dir>
```

Remote downloads require explicit user approval:

```bash
node scripts/js-analyzer.mjs download-chunks --out <output-dir> --base-url <origin>
node scripts/js-analyzer.mjs download-sourcemaps --out <output-dir> --base-url <origin>
node scripts/js-analyzer.mjs download-supplements --out <output-dir>
```

Default scripts never execute target project code. Treat dynamic evaluation, deobfuscator execution, target build scripts, packet replay, or live API calls as separate explicit user-approved work.

## Report Contract

The final `project-report.md` must be readable and useful even if no script was run.

It must quickly answer:

- What is this project? Type, framework/runtime, entrypoints, pages/routes, modules, build/deploy clues.
- What does it do? Main user/business flows inferred from pages, UI text, routes, permissions, APIs, events, and assets.
- What interfaces exist? Domains/gateways, API prefixes, wrapper behavior, complete endpoint index, and per-interface evidence.
- How are requests built? Base URL, method, headers, auth, token/tenant/org IDs, body/query source, signature/crypto pipeline.
- What can be inferred about responses? Real response packets if provided; otherwise frontend-read fields, table/form bindings, success/error handling, and cautious mock examples.
- What sensitive or operational clues exist? Configs, accounts, appids, keys, repositories, Swagger/Knife4j/YApi/Apifox, Nacos/Apollo/Consul/Eureka, CI/CD, monitoring, storage/CDN, payment/SMS/captcha/maps/push/analytics.
- What remains uncertain? Missing chunks/source maps/plugins, dynamic URLs, weak parameter guesses, unconfirmed response schemas, and next files to inspect.

Each API detail should use the shape in `references/report-template.md`: interface summary, parameter source, parameter table, minimal request package, response package, possible response example, and evidence.

## Evidence Rules

- Do not invent APIs, parameters, accounts, secrets, crypto details, or response schemas.
- Put weak but useful leads in `uncertainties`.
- Prefer exact file and line references. If line numbers are not available in a bundle/source-map virtual file, preserve the containing file, module ID/source name, and snippet summary.
- Keep raw values in local reports unless the user asks for redaction.
- For traffic captures or request/response packets supplied by the user, correlate them with source evidence and clearly label them as observed traffic. Do not commit captures or generated reports.

## Output Model

The human Markdown report may be written directly from Codex's evidence-backed analysis.

Use `analysis.json` when machine-readable outputs are needed. If generated, keep it aligned with the report and include:

- project identity, detected type, framework, entrypoints, Mini Program metadata
- inventory: source files, bundles, source maps, routes, chunks, configs, assets
- modules, features, APIs, request/response examples, crypto/signature findings
- configs, accounts, external assets, developer/operations signals, third-party services
- chunk/source-map/supplement discovery and unresolved candidates
- call graph leads, diagrams, evidence, uncertainties, and progress summary

Postman, OpenAPI, Swagger-style HTML, Mermaid diagrams, and helper scripts should be generated only when useful for the user's goal.

## High-Value Search Patterns

Use targeted `rg` searches before broad reading:

```bash
rg -n "wx\\.request|uni\\.request|Taro\\.request|axios|fetch\\(|XMLHttpRequest|baseURL|baseUrl|Authorization|token|sign|signature|CryptoJS|createHmac|createHash|JSEncrypt|sm2|sm3|sm4" <target>
rg -n "Object\\([^)]{1,120}\\)\\s*\\(\\s*['\"]/(api|auth|authStaff|file|logout|pageHits|report)|\\b[a-zA-Z_$][\\w$]{0,40}\\s*\\(\\s*['\"]/(api|auth|authStaff|file|logout|pageHits|report)|\\$ajaxRequest" <target>
rg -n "nacos|apollo|consul|eureka|swagger|knife4j|yapi|apifox|gitlab|github|gitee|jenkins|harbor|sentry|bugly|oss|cos|s3|minio|apk|ipa" <target>
```

## References

- Codex analysis method: `references/codex-analysis-method.md`
- Analysis flow: `references/analysis-playbook.md`
- Report template: `references/report-template.md`
- Perspective checklists: `references/perspective-checklists.md`
- Extraction patterns: `references/extraction-patterns.md`
- Crypto patterns: `references/crypto-patterns.md`
- Lazy chunk discovery: `references/chunk-discovery.md`
- Source map completion: `references/source-map-completion.md`
- AST/call graph mode: `references/ast-call-graph.md`
- Mermaid output: `references/mermaid-output.md`
- Website and intelligence summaries: `references/website-intelligence-analysis.md`
- External asset intelligence: `references/asset-intelligence.md`
- Output schema: `references/output-schema.md`
- Postman/OpenAPI rules: `references/postman-openapi-rules.md`
- Safety/evidence rules: `references/safety-and-evidence.md`
- Resume workflow: `references/resume-workflow.md`
