# js-analyzer-skill

语言：[中文](README.md) | [English](README.en.md)

`js-analyzer-skill` 是一个面向 Codex 的 AI 主导 JavaScript 项目分析 skill，用于分析授权范围内的 JavaScript/TypeScript 项目，并生成可读、可复核、有工程价值的结构化分析报告。它适用于源码项目、微信小程序源码、反编译/解包后的小程序、webpack/browserify bundle、压缩混淆后的前端代码，以及多种前端产物混合的项目。

这个 skill 的核心目标不是“把项目丢给脚本跑一遍”，而是让 Codex 像有经验的前端逆向/工程交接分析师一样直接阅读代码、追踪请求封装、恢复功能模块、推断请求包和返回包、标注证据，并输出人能看懂的中文报告。仓库里的脚本仍然保留，但它们是辅助工具：用于批量索引、chunk/source map 发现、可恢复状态、Postman/OpenAPI/Swagger 风格工作台生成和结果校验。

## 核心能力

- 盘点 JavaScript/TypeScript 项目、小程序包、解包后的小程序资源、bundle、source map、路由、chunk、配置和静态资源。
- 识别项目类型、框架/构建工具线索、包结构、小程序元数据、页面、分包、插件和入口点。
- 直接阅读请求 wrapper、拦截器、调用点、webpack 模块导入导出、同文件对象字面量，恢复接口路径、Base URL、Header、Query、Body 和鉴权/签名逻辑。
- 根据源码、mock、类型定义、UI 读取字段、成功/失败分支，以及用户提供的 HAR/请求响应包，推断或关联返回包结构。
- 提取配置、appid、Base URL、环境值、存储键、token、疑似 ak/sk、账号线索、开发者线索、运维线索和第三方服务。
- 识别加密/签名线索，例如 hash、HMAC、RSA、AES、base64、timestamp、nonce、sign header 和共享 helper 调用点。
- 发现懒加载 chunk、source map、小程序插件缺口、本地缓存/包搜索线索、WebView/H5 入口、远程 JS 候选和补充文件。
- 为长项目保留可恢复的分析状态，但不把脚本输出当成最终结论。
- 默认生成中文 `project-report.md`，报告开头包含概述、结构/功能/接口总览，并按接口逐项给出类似人工接口文档的分析结果。

## AI 主导分析流程

1. **状态检查和目标确认**
   - 根据用户提示解析目标目录，例如当前目录下的 `xxx`。
   - 如果已有 `analysis-output/<project>/analysis-state/run-summary.md`、`plan.json` 或旧报告，先读取它们，避免丢失上下文。
   - 旧报告只能作为参考；如果内容很薄、过期或明显漏接口，应回到源码重新分析。

2. **项目盘点**
   - 用 `rg --files` 等方式扫描目标项目文件。
   - 判断项目属于源码 JS/TS、微信小程序源码、解包小程序、webpack/browserify bundle、压缩混淆 bundle，还是混合类型。
   - 优先阅读 manifest、路由、页面、请求层、配置、bundle runtime 和 source map。

3. **请求链路追踪**
   - 先分析请求 wrapper、base URL、拦截器、Header、token、tenant/org/user ID、签名/加密逻辑，再列接口。
   - 从调用点对象字面量、函数参数、表单状态、路由参数、storage/cookie、常量和 mock 文件恢复 Query/Body/Header。
   - 从 `res.data`、`.then(...)`、回调、store、表格列、表单回填、类型定义和真实响应包恢复返回字段。

4. **多视角补全**
   - 从项目架构、资深开发、网站/产品、情报、普通用户、授权安全评估等视角复核。
   - 对缺失 chunk、source map、插件、WebView/H5 静态资源和远程 JS 只记录证据；下载前需要用户明确批准。

5. **报告写作**
   - 报告优先于机器产物，默认中文。
   - 开头快速回答：项目是什么、有哪些结构、有哪些功能、有哪些接口、请求如何构造、返回如何判断、还有哪些不确定项。
   - 每个接口都要给出接口摘要、业务含义、参数来源、参数表、最小请求包、返回包/可能返回包、证据和待复核点。

6. **辅助产物和校验**
   - 如果用户需要或项目很大，可以生成 `analysis.json`、Postman、OpenAPI、本地 Swagger 风格 UI 和 Mermaid 图。
   - 这些产物应与人工报告一致，不能反过来替代 Codex 的源码审阅。

## 脚本的正确位置

脚本可以帮忙，但不应该成为唯一分析者。

常用辅助命令：

```bash
node scripts/js-analyzer.mjs status --out analysis-output/<project-name>
node scripts/js-analyzer.mjs analyze <target-project> --out analysis-output/<project-name>
node scripts/js-analyzer.mjs resume --out analysis-output/<project-name>
node scripts/js-analyzer.mjs discover-chunks --out analysis-output/<project-name>
node scripts/js-analyzer.mjs discover-sourcemaps --out analysis-output/<project-name>
node scripts/js-analyzer.mjs discover-supplements --out analysis-output/<project-name>
node scripts/validate-outputs.mjs analysis-output/<project-name>
```

适合使用脚本的情况：

- 大型 bundle 需要先做批量索引。
- 需要 Postman、OpenAPI、Swagger 风格 HTML 这类机器产物。
- 已有中断的长分析需要续跑。
- 需要发现缺失 chunk、source map 或小程序/H5 补充文件。
- 需要校验已生成的结构化输出。

不适合的情况：

- 只跑一次 `analyze` 就把报告交出去。
- API 为空时直接下结论。
- 报告只是 URL 列表，没有解释请求封装、参数来源、返回字段和业务含义。
- 脚本结果和源码证据冲突时仍然信脚本。

## 输出文件

典型输出目录：

```text
analysis-output/<project-name>/
```

可能生成的文件：

| 文件 | 用途 |
| --- | --- |
| `project-report.md` | 中文 Markdown 报告，包含概述、结构/功能/接口总览、接口详情、请求/返回包、证据和附录。 |
| `analysis.json` | 可选的结构化分析结果，用于生成 Postman、OpenAPI、HTML 和图表。 |
| `postman_collection.json` | 根据恢复出的接口候选生成的 Postman 集合。 |
| `openapi.json` | 根据接口候选生成的 OpenAPI 3.1 文档。 |
| `swagger-ui.html` | 本地接口工作台，支持搜索、接口卡片、Mock 示例和请求发送。 |
| `analysis-state/run-summary.md` | 简明运行状态和续跑说明，方便后续 Codex 会话接手。 |
| `analysis-state/plan.json` | 可恢复任务计划。 |
| `analysis-state/shards/*.json` | 批量任务写出的中间提取结果。 |
| `analysis-state/checkpoints/*.json` | 各阶段快照，用于恢复和调试。 |
| `analysis-state/supplement-candidates.json` | 缺失插件、本地缓存命中、H5 入口、远程 JS 和 source map 补充候选。 |
| `diagrams/*.mmd` | Mermaid 图，包括网站流程、情报图、调用图和架构图。 |
| `crypto/` | 生成的 helper 和 crypto manifest，用于记录加密/签名线索。 |

`analysis-output/` 默认被 Git 忽略，因为其中可能包含内部 URL、token、默认账号、source-map 路径和其他敏感项目信息。

## Markdown 报告结构

`project-report.md` 默认使用中文，适合作为分析交接文档直接阅读：

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

每个接口详情建议采用固定格式：

- **接口**：方法、路径、原始 URL、Base URL、模块/功能、可信度、鉴权/签名线索。
- **业务含义**：哪个页面/功能/动作调用它。
- **参数来源**：说明 Query、Body、Header、Path 参数从哪里恢复，并列出证据。
- **参数说明**：以表格展示参数名、位置、是否必填、来源和推断说明。
- **最小请求包示例**：给出可参考的 HTTP 请求包。
- **返回包**：真实响应包、前端读取字段或静态推断说明。
- **可能的返回包示例**：给出 JSON 示例，并标明 observed/mock/inferred。
- **证据**：列出 `file:line` 和截断代码片段摘要。
- **不确定项**：动态片段、缺失字段、签名细节或下一步应检查文件。

## 安装依赖

脚本可以在不安装可选依赖的情况下完成一些辅助分析；安装依赖后可获得更强的解析和校验能力：

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
- 生成的接口结构来自静态分析、源码审阅和用户提供的流量证据。请求体、返回 Mock、鉴权线索和加密标签都应带证据与可信度。
