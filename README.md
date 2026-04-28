# js-analyzer-skill

语言：[中文](README.md) | [English](README.en.md)

`js-analyzer-skill` 是一个面向 Codex 的 JavaScript 项目分析 skill，用于分析授权范围内的 JavaScript/TypeScript 项目，并生成结构化的工程分析和安全审计报告。它适用于源码项目、微信小程序源码、反编译/解包后的小程序、webpack/browserify bundle、压缩混淆后的前端代码，以及多种前端产物混合的项目。

这个 skill 的目标不是只列出 URL，而是帮助分析者恢复“项目是什么、有哪些结构、有哪些功能、有哪些接口、接口如何构造、证据在哪里”。所有主要输出都从同一个 `analysis.json` 渲染生成，包括中文 Markdown 报告、Postman 集合、OpenAPI 文档和本地 Swagger 风格接口工作台。

## 核心功能

- 盘点 JavaScript/TypeScript 项目、小程序包、解包后的小程序资源、bundle、source map、路由、chunk、配置和静态资源。
- 识别项目类型、框架/构建工具线索、包结构、小程序元数据、页面、分包、插件和入口点。
- 提取接口候选，包括 HTTP 方法、路径、Base URL、Query/Header/Body 字段、请求示例、返回示例、返回字段线索和证据行。
- 追踪请求 wrapper、拦截器、调用点、webpack 模块导入导出、同文件对象字面量，尽量恢复接口请求体和查询参数。
- 提取配置、appid、Base URL、环境值、存储键、token、疑似 ak/sk、账号线索、开发者线索、运维线索和第三方服务。
- 识别加密/签名线索，例如 hash、HMAC、RSA、AES、base64、timestamp、nonce、sign header 和共享 helper 调用点。
- 发现懒加载 chunk、source map、小程序插件缺口、本地缓存/包搜索线索、WebView/H5 入口、远程 JS 候选和补充文件。
- 为长项目生成可恢复的分析状态，支持中断后续跑，也方便新的 Codex 会话接手。
- 默认生成中文 `project-report.md`，报告开头包含概述、结构/功能/接口总览，并按接口逐项给出类似人工接口文档的分析结果。

## 分析流程

这个 skill 采用可恢复的多阶段流程，而不是一次性把大项目全部塞进上下文：

1. **状态检查和续跑判断**
   - 如果输出目录里已经有 `analysis-state/run-summary.md` 和 `analysis-state/plan.json`，优先读取它们。
   - 根据已有任务计划继续执行，避免重复分析。

2. **项目盘点**
   - 扫描目标项目文件。
   - 判断项目属于源码 JS/TS、微信小程序源码、解包小程序、webpack/browserify bundle，还是混合类型。
   - 记录源码文件、bundle、source map、配置文件、路由、chunk 和静态资源。

3. **Chunk、Source Map 和补充文件发现**
   - 发现懒加载 chunk 候选和 source map 候选。
   - 对小程序、H5、插件项目，识别缺失插件、WebView/H5 入口、本地缓存搜索目标、远程 JS 和 source map 后续线索。
   - 涉及远程下载时，默认需要用户明确批准。

4. **批量提取**
   - 将大项目拆成多个可恢复的小任务。
   - 提取接口、配置、账号、外部资产、开发/运维线索、第三方服务、功能、模块、加密/签名线索和调用图边。
   - 每个阶段写入 shard 和 checkpoint，方便失败后恢复。

5. **合并和增强**
   - 合并并去重提取结果。
   - 将接口和同文件附近的加密/签名线索关联起来。
   - 生成模块/功能分组、调用图摘要和 Mermaid 图数据。

6. **输出渲染**
   - 所有输出都从 `analysis.json` 渲染，避免手工维护多份状态。
   - 生成 Markdown、Postman、OpenAPI、本地 Swagger 风格 UI、Mermaid 图、crypto helper 和运行摘要。

## 输出文件

典型输出目录：

```text
analysis-output/<project-name>/
```

主要文件：

| 文件 | 用途 |
| --- | --- |
| `analysis.json` | 完整结构化分析结果和原始证据，是所有渲染输出的唯一数据源。 |
| `project-report.md` | 中文 Markdown 报告，包含概述、结构/功能/接口总览、接口详情、证据和附录。 |
| `postman_collection.json` | 根据恢复出的接口候选生成的 Postman 集合。 |
| `openapi.json` | 根据接口候选生成的 OpenAPI 3.1 文档。 |
| `swagger-ui.html` | 本地接口工作台，支持搜索、接口卡片、Mock 示例和请求发送。 |
| `analysis-state/run-summary.md` | 简明运行状态和续跑说明，方便后续 Codex 会话接手。 |
| `analysis-state/plan.json` | 可恢复任务计划。 |
| `analysis-state/shards/*.json` | 批量任务写出的中间提取结果。 |
| `analysis-state/checkpoints/*.json` | 各阶段快照，用于恢复和调试。 |
| `analysis-state/supplement-candidates.json` | 缺失插件、本地缓存命中、H5 入口、远程 JS 和 source map 补充候选。 |
| `diagrams/*.mmd` | Mermaid 图，包括网站流程、情报图、调用图和架构图。 |
| `crypto/` | 生成的 Node/Python helper 和 crypto manifest，用于记录加密/签名线索。 |

`analysis-output/` 默认被 Git 忽略，因为其中可能包含内部 URL、token、默认账号、source-map 路径和其他敏感项目信息。

## Markdown 报告结构

`project-report.md` 默认使用中文，适合作为分析交接文档直接阅读：

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

每个接口详情会采用固定格式：

- **接口**：方法、路径、原始 URL、Base URL、分组、可信度、鉴权/签名线索。
- **参数来源**：说明 Query、Body、Header、Path 参数从哪里恢复，并列出证据。
- **参数说明**：以表格展示参数名、位置、是否必填和推断说明。
- **最小请求包示例**：给出可参考的 HTTP 请求包。
- **返回包**：说明返回类型、前端可能读取的字段和处理逻辑提示。
- **可能的返回包示例**：给出 JSON Mock 示例。
- **证据**：列出 `file:line`、提取器名称和截断代码片段。

## 快速开始

检查已有进度：

```bash
node scripts/js-analyzer.mjs status --out analysis-output/<project-name>
```

分析项目：

```bash
node scripts/js-analyzer.mjs analyze <target-project> --out analysis-output/<project-name>
```

如果该输出目录已经有同一目标的完整分析，`analyze` 会提示是否重新分析；非交互环境会停止并要求显式选择。使用 `--fresh` 重新生成干净输出，或使用 `--resume-existing` 明确沿用旧报告。

续跑中断的分析：

```bash
node scripts/js-analyzer.mjs resume --out analysis-output/<project-name>
```

校验输出：

```bash
node scripts/validate-outputs.mjs analysis-output/<project-name>
```

从已有 `analysis.json` 重新渲染输出：

```bash
node scripts/js-analyzer.mjs render --ir analysis-output/<project-name>/analysis.json --out analysis-output/<project-name>
```

## Chunk、Source Map 和补充文件命令

发现懒加载 chunk：

```bash
node scripts/js-analyzer.mjs discover-chunks --out analysis-output/<project-name>
```

下载已批准的懒加载 chunk：

```bash
node scripts/js-analyzer.mjs download-chunks --out analysis-output/<project-name> --base-url https://target.example.com/
```

发现 source map：

```bash
node scripts/js-analyzer.mjs discover-sourcemaps --out analysis-output/<project-name>
```

下载已批准的 source map：

```bash
node scripts/js-analyzer.mjs download-sourcemaps --out analysis-output/<project-name> --base-url https://target.example.com/
```

发现小程序/H5/插件补充文件：

```bash
node scripts/js-analyzer.mjs discover-supplements --out analysis-output/<project-name>
```

下载已批准的补充文件：

```bash
node scripts/js-analyzer.mjs download-supplements --out analysis-output/<project-name>
```

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `SKILL.md` | Codex skill 主说明和工作流约定。 |
| `scripts/js-analyzer.mjs` | 主 CLI，负责分析、续跑、发现、合并和渲染。 |
| `scripts/validate-outputs.mjs` | 输出校验工具。 |
| `scripts/swagger-proxy.mjs` | 可选的本地代理，用于 Swagger 风格 UI 发起请求。 |
| `references/` | 分析方法、输出 schema、chunk、source map、报告、证据、加密和 OpenAPI/Postman 规则。 |
| `assets/` | 生成输出时使用的静态资源和模板。 |
| `agents/openai.yaml` | 面向 UI 的 skill 元数据。 |

## 安装依赖

脚本可以在不安装可选依赖的情况下完成第一轮分析；安装依赖后可获得更强的解析和校验能力：

```bash
npm ci --ignore-scripts
```

Node.js 版本要求：`>=18.18.0`。

## 安全说明

- 只分析你有授权检查的项目。
- 默认输出会保留发现的真实值，包括 token、appid、内部 URL、默认账号、source-map 路径和其他敏感线索。
- 只有在准备共享版报告时，才应显式做脱敏处理。
- 不要提交生成的分析结果。本仓库已忽略 `analysis-output/`、`reports/`、`evidence/`、`*.analysis-output/` 和 `tests/`。
- 下载 chunk、source map、H5 或补充文件前，应先审查候选证据并获得用户批准。
- 生成的接口结构来自静态分析。请求体、返回 Mock、鉴权线索和加密标签都应视为候选结论，需要结合源码、后端文档或真实流量确认。
