# js-analyzer-skill

Language: [English](README.en.md) | [中文](README.md)

`js-analyzer-skill` is an AI-led Codex skill for analyzing authorized JavaScript projects and producing readable, evidence-backed engineering/security handoff reports. It is designed for source projects, WeChat Mini Programs, unpacked Mini Programs, webpack/browserify bundles, minified JavaScript, and mixed frontend artifacts.

The point of this skill is not to hand the project to a script and paste the result. Codex should inspect the code directly, trace request wrappers, recover business modules, reconstruct request and response packages, cite evidence, and write a report a human engineer can use. The bundled scripts remain available as helpers for broad indexing, chunk/source-map discovery, resumable state, Postman/OpenAPI/local Swagger-style output, and validation.

## What This Skill Does

- Inventories JavaScript/TypeScript projects, Mini Program packages, unpacked app assets, bundles, source maps, routes, chunks, configs, and static assets.
- Classifies project type, framework/build signals, package layout, Mini Program metadata, pages, subpackages, plugins, and entrypoints.
- Reads request wrappers, interceptors, call sites, webpack module exports/imports, and same-file object literals to recover API paths, base URLs, headers, query/body data, and auth/signature logic.
- Infers or correlates response packages from source, mocks, types, UI-read fields, success/error branches, and user-provided HAR/request-response packets.
- Finds configs, appids, base URLs, environment values, storage keys, tokens, ak/sk-like values, accounts, developer signals, operations signals, and third-party services.
- Detects crypto/signature leads such as hash, HMAC, RSA, AES, base64, timestamp, nonce, sign headers, and shared helper call sites.
- Discovers lazy chunks, source maps, Mini Program plugin gaps, local cache/package search hints, WebView/H5 entries, remote JS candidates, and supplemental files.
- Keeps resumable state for long analyses without treating script output as the final answer.
- Produces Chinese `project-report.md` reports by default, with a clear overview plus per-interface sections similar to hand-written API notes.

## AI-Led Workflow

1. **Status and target check**
   - Resolve the target directory from the user's prompt.
   - Read existing `analysis-output/<project>/analysis-state/run-summary.md`, `plan.json`, or prior reports when present.
   - Treat old reports as context only; refresh from source when they are thin, stale, or missing APIs.

2. **Project inventory**
   - Scan target files with tools such as `rg --files`.
   - Classify source JS/TS, Mini Program source, unpacked Mini Program, webpack/browserify bundle, minified/obfuscated bundle, or mixed project type.
   - Prioritize manifests, routes, pages, request layers, configs, bundle runtimes, and source maps.

3. **Request-flow tracing**
   - Analyze request wrappers, base URL selection, interceptors, headers, tokens, tenant/org/user IDs, and signature/encryption logic before listing APIs.
   - Recover query/body/header fields from call-site objects, function parameters, form state, route params, storage/cookies, constants, and mocks.
   - Recover response fields from `res.data`, promise chains, callbacks, stores, table columns, form fills, types, and real traffic when provided.

4. **Perspective review**
   - Review from architecture, senior developer, website/product, intelligence, normal-user, and authorized-security perspectives.
   - Record evidence for missing chunks, source maps, plugins, WebView/H5 assets, and remote JS. Ask before downloading anything remote.

5. **Report writing**
   - Human report first, Chinese by default.
   - The opening should quickly answer what the project is, what it does, which APIs exist, how requests are built, how responses were inferred, and what remains uncertain.
   - Each API should include interface summary, business meaning, parameter source, parameter table, minimal request package, response package, evidence, and open questions.

6. **Optional machine outputs**
   - Generate `analysis.json`, Postman, OpenAPI, local Swagger-style UI, and Mermaid diagrams when useful or requested.
   - These artifacts should match the human report, not replace Codex's source review.

## Role of Scripts

Scripts can help, but they are not the analyst.

Useful helper commands:

```bash
node scripts/js-analyzer.mjs status --out analysis-output/<project-name>
node scripts/js-analyzer.mjs analyze <target-project> --out analysis-output/<project-name>
node scripts/js-analyzer.mjs resume --out analysis-output/<project-name>
node scripts/js-analyzer.mjs discover-chunks --out analysis-output/<project-name>
node scripts/js-analyzer.mjs discover-sourcemaps --out analysis-output/<project-name>
node scripts/js-analyzer.mjs discover-supplements --out analysis-output/<project-name>
node scripts/validate-outputs.mjs analysis-output/<project-name>
```

Use scripts when:

- a large bundle needs broad indexing;
- Postman, OpenAPI, or local Swagger-style HTML is needed;
- an interrupted long analysis needs to resume;
- missing chunks, source maps, Mini Program plugins, or H5 supplements need discovery;
- generated structured output needs validation.

Avoid:

- running `analyze` once and delivering the raw report;
- saying no APIs exist before manually checking wrappers, URL literals, source maps, and call sites;
- producing a URL list without request construction, parameter sources, response hints, and business meaning;
- trusting script output over source evidence.

## Output Files

Typical output directory:

```text
analysis-output/<project-name>/
```

Possible files:

| File | Purpose |
| --- | --- |
| `project-report.md` | Chinese Markdown report with overview, structure/function/API map, interface details, request/response packages, evidence, and appendices. |
| `analysis.json` | Optional structured analysis used to generate Postman, OpenAPI, HTML, and diagrams. |
| `postman_collection.json` | Postman collection generated from recovered API candidates. |
| `openapi.json` | OpenAPI 3.1 document generated from recovered API candidates. |
| `swagger-ui.html` | Self-contained local API workspace with search, API cards, mocks, and request sender. |
| `analysis-state/run-summary.md` | Compact status and resume briefing for future Codex sessions. |
| `analysis-state/plan.json` | Durable task plan used for resumable analysis. |
| `analysis-state/shards/*.json` | Partial extraction results written by batch tasks. |
| `analysis-state/checkpoints/*.json` | Stage snapshots for recovery and debugging. |
| `analysis-state/supplement-candidates.json` | Missing plugins, local cache hits, H5 entries, remote JS, and source-map supplement candidates. |
| `diagrams/*.mmd` | Mermaid diagrams for website flow, intelligence map, call graph, and architecture. |
| `crypto/` | Helper files and crypto manifest for recovered crypto/signature leads. |

`analysis-output/` is ignored by Git because it can contain internal URLs, tokens, default accounts, source-map paths, and other sensitive project facts.

## Markdown Report Shape

`project-report.md` is written in Chinese by default. It is designed to be useful as a direct handoff document:

1. 概述
2. 开头总览：结构、功能、接口
3. 关键指标
4. 项目结构与运行信息
5. 小程序元数据（如适用）
6. 功能模块
7. 接口清单
8. 接口详情
9. 请求封装、鉴权与签名
10. 插件和外部服务
11. 补充文件线索
12. 安全与复核事项
13. 输出文件（如生成）
14. Mermaid 结构图（如有）
15. 可折叠原始附录

Each API detail section should use this repeatable format:

- **接口**: method, path, raw URL, base URL, module/feature, confidence, auth/signature hint.
- **业务含义**: which page/feature/action appears to call it.
- **参数来源**: where query/body/header/path parameters were recovered from, with evidence bullets.
- **参数说明**: parameter table with name, location, required status, source, and inferred meaning.
- **最小请求包示例**: HTTP request package assembled from evidence.
- **返回包**: observed response, frontend-read fields, or static inference notes.
- **可能的返回包示例**: JSON example labeled observed, mock, or inferred.
- **证据**: `file:line` bullets and snippet summaries.
- **不确定项**: dynamic pieces, missing fields, signature caveats, or next files to inspect.

## Install Dependencies

The scripts can run some helper analyses without optional packages, but installing dependencies enables stronger parsing and validation support:

```bash
npm ci --ignore-scripts
```

The package targets Node.js `>=18.18.0`.

## Safety Notes

- Analyze only projects you are authorized to inspect.
- The default output preserves discovered values, including tokens, appids, internal URLs, default accounts, source-map paths, and other sensitive findings.
- Use redaction only when explicitly preparing a shareable report.
- Do not commit generated analysis output. This repository ignores `analysis-output/`, `reports/`, `evidence/`, `*.analysis-output/`, and `tests/`.
- Remote downloads for chunks, source maps, and H5/supplement files should be performed only after reviewing candidate evidence and getting user approval.
- API shapes come from static analysis, source review, and user-provided traffic evidence. Request bodies, response mocks, auth hints, and crypto labels must carry evidence and confidence.
