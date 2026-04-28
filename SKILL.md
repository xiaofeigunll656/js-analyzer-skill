---
name: js-analyzer-skill
description: Codex-only, AI-led analysis of authorized JavaScript, TypeScript, WeChat Mini Program, unpacked Mini Program, webpack/browserify bundle, minified, or obfuscated frontend projects. Use when Codex must decide how to inspect JS projects directly, trace request/response behavior, recover APIs, sensitive configs, accounts, source-map/chunk leads, crypto/signature logic, operations signals, and write useful evidence-backed Markdown reports. Includes only small Codex helper scripts for evidence lead collection and validation; no script is the analyst.
---

# JS Analyzer Skill

Analyze only projects the user is authorized to inspect. Codex is the analyst. The skill exists to improve Codex's own reading, tracing, judgment, and reporting, not to hand control to a scanner.

## Core Rule

AI decides how to analyze the project.

Use normal Codex tools first: `rg`, file reads, source-map inspection, targeted code slices, and reasoning. If Codex can see or infer something directly, do not add or run a JS script for that job.

Use the bundled helper only as a small evidence indexer:

```bash
node scripts/codex-js-leads.mjs <target-project> --out analysis-output/<project-name>
```

This writes:

- `codex-js-leads.json`: machine-readable leads with evidence.
- `codex-js-leads.md`: a compact checklist for Codex to review.

These files are not the report and not truth. They are a map of places Codex should inspect manually.

## Analysis Workflow

1. Resolve the target path from the user's prompt. For "analyze the xxx project under the current directory", inspect `./xxx`.
2. Read prior local notes or reports when present, but refresh conclusions from source when the old report is thin, stale, script-heavy, or missing obvious findings.
3. Classify the project from files and code evidence: source JS/TS, WeChat Mini Program source, unpacked Mini Program, webpack/browserify bundle, minified/obfuscated bundle, source-map recovered project, or mixed.
4. Read high-leverage files first:
   - manifests: `package.json`, `app.json`, `project.config.json`, `ext.json`, router/build config
   - request layer: API modules, request/http/service wrappers, interceptors, auth/token/storage helpers
   - pages/routes/components/stores and source-map `sourcesContent`
   - bundle runtime/chunks that define aliases, public paths, wrapper exports, and dynamic imports
5. Trace request construction before listing APIs:
   - base URL/env selection
   - method defaults
   - headers, tokens, cookies, tenant/org/user IDs
   - nonce/timestamp/signature/encryption flow
   - call-site object literals and form/state/route/storage values that supply query/body data
6. Reconstruct each important API as an engineer would:
   - interface: method, base URL, path/raw URL, business module, confidence
   - request package: headers, query, body, auth/signature steps, minimal request example
   - response package: observed HAR/traffic if supplied; otherwise frontend-read fields, table/form bindings, stores, mock/type/docs clues, and cautious inferred example
   - evidence: file, line, snippet summary, review method, confidence, uncertainty
7. Search for non-API intelligence and security leads:
   - appids, default/test accounts, hardcoded passwords, tokens, ak/sk, private keys, webhooks, DSNs, storage buckets, API docs, repos, CI/CD, Nacos/Apollo/Consul/Eureka, monitoring, payment/SMS/captcha/maps/push/analytics
   - source-map local paths, developer names/emails/phones, build users, internal domains, gateway/service names
8. Write the Markdown report in Chinese by default. The report must lead with conclusions, then evidence. It should be useful even when no helper script was run.
9. Before finishing, do a miss-finding pass: search likely unreported APIs, sensitive keys, accounts, storage keys, auth headers, crypto/signature terms, source maps, chunks, and operations endpoints. Put weak leads in `不确定项/待复核`.

## Helper Script Boundary

`scripts/codex-js-leads.mjs` is intentionally small. It scans local text-like files and highlights leads that Codex should inspect:

- backend-looking paths and URLs
- request primitives/wrappers
- sensitive-looking key/value assignments
- accounts, appids, tenant/org IDs
- domains, API docs, repos, operations systems
- crypto/signature terms
- source-map and chunk hints
- developer/build signals

Use it when it saves time on a large or minified project. Skip it when direct reading is faster.

Do not use helper output to replace:

- project classification
- wrapper/interceptor tracing
- request/response reconstruction
- business feature grouping
- severity/risk judgment
- final report writing

Validate helper output when needed:

```bash
node scripts/validate-outputs.mjs analysis-output/<project-name>
```

Remote downloads, target build scripts, dynamic evaluation, deobfuscator execution, packet replay, and live API calls are separate explicit user-approved work. The bundled helper never executes target project code.

## Report Contract

The final `project-report.md` must quickly answer:

- 项目是什么：类型、框架/运行时、入口、页面/路由、模块、构建/部署线索。
- 项目做什么：从页面、文案、路由、权限码、事件、接口和资源推断出的主要业务流程。
- 有哪些接口：域名/网关、接口前缀、主要 wrapper、完整接口索引、每个接口证据。
- 请求如何构造：base URL、method、headers、auth、token/tenant/org/user ID、body/query 来源、签名/加密流程。
- 返回如何判断：真实响应包（如有）、前端读取字段、表格/表单绑定、success/error 处理、mock/type/docs 线索、静态推断限制。
- 有哪些敏感和运维线索：账号、密码、token、appid、ak/sk、repo、Swagger/Knife4j/YApi/Apifox、Nacos/Apollo、CI/CD、监控、存储/CDN、第三方 SDK。
- 还有什么不确定：动态 URL、缺失 chunk/source map/plugin、弱参数猜测、未确认响应 schema、下一步应读哪些文件。

Each API detail should follow `references/report-template.md`: interface summary, business meaning, parameter source, parameter table, minimal request package, response package, possible response example, evidence, and uncertainty.

## Evidence Rules

- Do not invent APIs, parameters, accounts, secrets, crypto details, or response schemas.
- Keep raw values in local reports unless the user asks for redaction.
- Clearly separate observed traffic, source evidence, mock/test data, and static inference.
- Treat helper leads as prompts for review, not facts.
- Put weak but useful leads in `不确定项/待复核`.
- Do not commit generated analysis output, real target data, HAR/pcap files, credentials, screenshots, or recovered source from private targets.

## References

- Codex analysis method: `references/codex-analysis-method.md`
- Analysis flow: `references/analysis-playbook.md`
- Report template: `references/report-template.md`
- Perspective checklists: `references/perspective-checklists.md`
- Extraction patterns: `references/extraction-patterns.md`
- Crypto patterns: `references/crypto-patterns.md`
- Lazy chunk discovery: `references/chunk-discovery.md`
- Source map completion: `references/source-map-completion.md`
- AST/call graph guidance: `references/ast-call-graph.md`
- Mermaid output: `references/mermaid-output.md`
- Website and intelligence summaries: `references/website-intelligence-analysis.md`
- External asset intelligence: `references/asset-intelligence.md`
- Output schema: `references/output-schema.md`
- Postman/OpenAPI rules: `references/postman-openapi-rules.md`
- Safety/evidence rules: `references/safety-and-evidence.md`
- Resume workflow: `references/resume-workflow.md`
