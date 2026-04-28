# js-analyzer-skill

Language: [English](README.en.md) | [中文](README.md)

`js-analyzer-skill` is a Codex-only, AI-led skill for analyzing authorized JavaScript projects. It is designed for JavaScript/TypeScript source projects, WeChat Mini Programs, unpacked Mini Programs, webpack/browserify bundles, minified frontend artifacts, and mixed frontend projects.

The core rule is simple: **Codex is the analyst; scripts are not.** Codex decides how to inspect the project, trace request flow, review sensitive information, recover APIs, and write the report. This repo keeps only small helper scripts that collect evidence leads for Codex to review.

## Capabilities

- Inventory project structure, entrypoints, routes, pages, components, bundles, source maps, chunks, configs, and assets.
- Trace request wrappers, interceptors, base URLs, headers, tokens, tenant/org/user IDs, signatures, and encryption.
- Recover API paths, methods, query/header/body fields, parameter sources, minimal request packages, and likely response packages.
- Infer response structures from source, mocks, types, UI-read fields, success/error branches, and user-provided HAR/request-response packets.
- Find appids, default/test accounts, hardcoded passwords, tokens, ak/sk values, private keys, webhooks, DSNs, buckets, API docs, repos, CI/CD, monitoring, and config-center leads.
- Identify source maps, local build paths, developer signals, operations systems, third-party SDKs, and crypto/signature logic.
- Produce Chinese `project-report.md` reports by default for engineering handoff or authorized review.

## Codex Workflow

1. Resolve the target directory from the user's prompt.
2. Use `rg --files` and high-value searches to inventory the project without loading everything at once.
3. Read manifests, routes, request layers, configs, pages/components, stores, bundle runtimes, and source maps first.
4. Trace request wrappers and auth/signature behavior before listing APIs.
5. Reconstruct request packages, parameter sources, response leads, evidence, and uncertainty for each important API.
6. Review from architecture, senior-developer, website/product, intelligence, normal-user, and authorized-security perspectives.
7. Write the Chinese report and perform a final miss-finding search before finishing.

## Small Helper

The only recommended analysis helper is:

```bash
node scripts/codex-js-leads.mjs <target-project> --out analysis-output/<project-name>
```

It produces:

| File | Purpose |
| --- | --- |
| `codex-js-leads.json` | API, request call, sensitive config, account, domain, source-map, chunk, crypto, operations, and developer leads. |
| `codex-js-leads.md` | A compact lead summary and review checklist for Codex. |

The helper only scans local text. It does not execute target code and does not generate the final report. Its output is a map for Codex to inspect, not a conclusion.

Validate helper output:

```bash
node scripts/validate-outputs.mjs analysis-output/<project-name>
```

## Report Shape

`project-report.md` is written in Chinese by default:

1. 概述
2. 开头总览：结构、功能、接口
3. 关键指标
4. 项目结构与运行信息
5. 小程序元数据（如适用）
6. 功能模块
7. 请求封装、鉴权与签名
8. 接口清单
9. 接口详情
10. 插件、第三方服务和外部资产
11. 敏感配置、账号和运维线索
12. 补充文件线索：chunk/source map/H5/plugin
13. 安全与复核事项
14. Mermaid 结构图（如有）
15. 可折叠原始附录

Each API detail should include:

- **接口**: method, path, raw URL, base URL, module/feature, confidence, auth/signature hint.
- **业务含义**: which page/feature/action appears to call it.
- **参数来源**: where query/body/header/path parameters were recovered from.
- **参数说明**: parameter name, location, required status, source, and inferred meaning.
- **最小请求包示例**: HTTP request package assembled from evidence.
- **返回包**: observed response, frontend-read fields, or static inference notes.
- **可能的返回包示例**: clearly labeled observed/mock/inferred.
- **证据**: `file:line` and snippet summary.
- **不确定项**: dynamic pieces, missing fields, signature caveats, or next files to inspect.

## Dependencies

The helper scripts use only the Node.js standard library. No `npm install` is required. Node.js `>=18.18.0` is expected.

## Safety Notes

- Analyze only projects you are authorized to inspect.
- Local reports preserve discovered values by default, including tokens, appids, internal URLs, default accounts, source-map paths, and other sensitive findings.
- Redact only when explicitly preparing a shareable report.
- Do not commit generated analysis output. This repository ignores `analysis-output/`, `reports/`, `evidence/`, `*.analysis-output/`, and `tests/`.
- Remote downloads for chunks, source maps, H5, or supplemental files require candidate review and explicit user approval.
