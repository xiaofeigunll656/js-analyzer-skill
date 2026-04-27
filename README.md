# js-analyzer-skill

Language: [English](README.md) | [中文](README.zh-CN.md)

`js-analyzer-skill` is a Codex skill for analyzing authorized JavaScript projects and producing a structured engineering/security-audit report. It is designed for source projects, WeChat Mini Programs, unpacked Mini Programs, webpack/browserify bundles, minified JavaScript, and mixed frontend artifacts.

The skill helps Codex recover project structure, business modules, API request construction, configuration, external assets, crypto/signature logic, and evidence-backed findings. It also generates Markdown, Postman, OpenAPI, and a local Swagger-style UI workspace from the same `analysis.json` source of truth.

## What This Skill Does

- Inventories JavaScript/TypeScript projects, Mini Program packages, unpacked app assets, bundles, source maps, routes, chunks, configs, and static assets.
- Classifies project type, framework/build signals, package layout, Mini Program metadata, pages, subpackages, plugins, and entrypoints.
- Extracts API candidates, HTTP methods, paths, base URLs, query/body/header fields, request mocks, response mocks, response key hints, and evidence lines.
- Traces request wrappers, interceptors, call sites, webpack module exports/imports, and same-file object literals to infer request body/query shapes.
- Finds configs, appids, base URLs, environment values, storage keys, tokens, ak/sk-like values, accounts, developer signals, operations signals, and third-party services.
- Detects crypto/signature leads such as hash, HMAC, RSA, AES, base64, timestamp, nonce, sign headers, and shared helper call sites.
- Discovers lazy chunks, source maps, Mini Program plugin gaps, local cache/package search hints, WebView/H5 entries, remote JS candidates, and supplemental files.
- Generates resumable analysis state so a large analysis can continue after an interrupted run or a new Codex conversation.
- Produces Chinese `project-report.md` reports by default, with a clear overview plus per-interface sections similar to hand-written API notes.

## Analysis Workflow

The skill follows a resumable workflow instead of treating analysis as one large pass:

1. **Status and resume check**
   - Reads existing `analysis-state/run-summary.md` and `analysis-state/plan.json` when present.
   - Continues unfinished work instead of restarting.

2. **Project inventory**
   - Scans files under the target project.
   - Classifies source JS/TS, Mini Program source, unpacked Mini Program, webpack/browserify bundle, or mixed project type.
   - Records source files, bundles, source maps, config files, routes, chunks, and static assets.

3. **Chunk and supplement discovery**
   - Finds lazy chunk candidates and source-map candidates.
   - For Mini Program/H5/plugin projects, identifies missing plugins, WebView/H5 entries, local cache search targets, remote JS, and source-map follow-ups.
   - Downloads remote resources only when explicitly approved by the user.

4. **Batch extraction**
   - Splits large projects into small extraction tasks.
   - Extracts APIs, configs, accounts, external assets, developer/operations signals, third-party services, features, modules, crypto/signature leads, and call graph edges.
   - Writes shard files and checkpoints after each stage.

5. **Merge and enrichment**
   - Deduplicates extracted entities.
   - Links APIs to nearby crypto/signature findings.
   - Builds module/feature groupings, call graph summaries, and Mermaid diagram data.

6. **Output rendering**
   - Renders all human and machine-readable outputs from `analysis.json`.
   - Produces Markdown, Postman, OpenAPI, local Swagger-style UI, Mermaid diagrams, helper scripts, and run summaries.

## Output Files

Typical output directory:

```text
analysis-output/<project-name>/
```

Important files:

| File | Purpose |
| --- | --- |
| `analysis.json` | Full structured result and raw evidence. This is the source of truth for rendered outputs. |
| `project-report.md` | Chinese Markdown report with overview, structure/function/API map, interface details, evidence, and appendices. |
| `postman_collection.json` | Postman collection generated from recovered API candidates. |
| `openapi.json` | OpenAPI 3.1 document generated from recovered API candidates. |
| `swagger-ui.html` | Self-contained local API workspace with search, API cards, mocks, and request sender. |
| `analysis-state/run-summary.md` | Compact status and resume briefing for future Codex sessions. |
| `analysis-state/plan.json` | Durable task plan used for resumable analysis. |
| `analysis-state/shards/*.json` | Partial extraction results written by batch tasks. |
| `analysis-state/checkpoints/*.json` | Stage snapshots for recovery and debugging. |
| `analysis-state/supplement-candidates.json` | Missing plugins, local cache hits, H5 entries, remote JS, and source-map supplement candidates. |
| `diagrams/*.mmd` | Mermaid diagrams for website flow, intelligence map, call graph, and architecture. |
| `crypto/` | Generated Node/Python helper files and crypto manifest for recovered crypto/signature leads. |

`analysis-output/` is ignored by Git because it can contain internal URLs, tokens, default accounts, source-map paths, and other sensitive project facts.

## Markdown Report Shape

`project-report.md` is written in Chinese by default. It is designed to be useful as a direct handoff document:

1. 概述
2. 开头总览：结构、功能、接口
3. 关键指标
4. 项目结构与运行信息
5. 小程序元数据
6. 功能模块
7. 接口清单
8. 接口详情
9. 插件和外部服务
10. 补充文件线索
11. 安全与复核事项
12. 输出文件
13. Mermaid 结构图
14. 可折叠原始附录

Each API detail section uses this repeatable format:

- 接口：method, path, raw URL, base URL, group, confidence, auth/signature hint.
- 参数来源：where query/body/header/path parameters were recovered from, with evidence bullets.
- 参数说明：parameter table with name, location, required status, and inferred meaning.
- 最小请求包示例：HTTP request example.
- 返回包：response type, likely frontend-read fields, and caveats.
- 可能的返回包示例：JSON response mock.
- 证据：file:line bullets with extractor name and short snippet.

## Quick Start

Check existing progress:

```bash
node scripts/js-analyzer.mjs status --out analysis-output/<project-name>
```

Analyze a project:

```bash
node scripts/js-analyzer.mjs analyze <target-project> --out analysis-output/<project-name>
```

Resume an interrupted analysis:

```bash
node scripts/js-analyzer.mjs resume --out analysis-output/<project-name>
```

Validate generated outputs:

```bash
node scripts/validate-outputs.mjs analysis-output/<project-name>
```

Render outputs again from an existing `analysis.json`:

```bash
node scripts/js-analyzer.mjs render --ir analysis-output/<project-name>/analysis.json --out analysis-output/<project-name>
```

## Chunk, Source Map, and Supplement Commands

Discover lazy chunks:

```bash
node scripts/js-analyzer.mjs discover-chunks --out analysis-output/<project-name>
```

Download approved lazy chunks:

```bash
node scripts/js-analyzer.mjs download-chunks --out analysis-output/<project-name> --base-url https://target.example.com/
```

Discover source maps:

```bash
node scripts/js-analyzer.mjs discover-sourcemaps --out analysis-output/<project-name>
```

Download approved source maps:

```bash
node scripts/js-analyzer.mjs download-sourcemaps --out analysis-output/<project-name> --base-url https://target.example.com/
```

Discover Mini Program/H5/plugin supplements:

```bash
node scripts/js-analyzer.mjs discover-supplements --out analysis-output/<project-name>
```

Download approved supplements:

```bash
node scripts/js-analyzer.mjs download-supplements --out analysis-output/<project-name>
```

## Repository Layout

| Path | Purpose |
| --- | --- |
| `SKILL.md` | Main Codex skill instructions and workflow contract. |
| `scripts/js-analyzer.mjs` | Main CLI for analysis, resume, discovery, merge, and rendering. |
| `scripts/validate-outputs.mjs` | Output validation helper. |
| `scripts/swagger-proxy.mjs` | Optional local proxy helper for Swagger-style UI requests. |
| `references/` | Focused reference docs for extraction, output schema, chunk discovery, source maps, reports, evidence, crypto, and OpenAPI/Postman rules. |
| `assets/` | Static assets/templates used by generated outputs. |
| `agents/openai.yaml` | UI-facing skill metadata. |

## Install Dependencies

The scripts can run a first pass without installing optional packages, but installing dependencies enables stronger parsing and validation support:

```bash
npm ci --ignore-scripts
```

The package targets Node.js `>=18.18.0`.

## Safety Notes

- Analyze only projects you are authorized to inspect.
- The default output preserves discovered values, including tokens, appids, internal URLs, default accounts, source-map paths, and other sensitive findings.
- Use redaction only when explicitly preparing a shareable report.
- Do not commit generated analysis output. This repository ignores `analysis-output/`, `reports/`, `evidence/`, `*.analysis-output/`, and `tests/`.
- Remote downloads for chunks, source maps, and H5/supplement files should be performed only after reviewing the candidate evidence and getting user approval.
- The generated API shapes are static-analysis candidates. Treat request bodies, response mocks, auth hints, and crypto labels as leads until confirmed by source review, backend docs, or runtime traffic.
