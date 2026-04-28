# js-analyzer-skill

语言：[中文](README.md) | [English](README.en.md)

`js-analyzer-skill` 是一个只为 Codex 服务的 AI 主导 JavaScript 项目分析 skill。它用于分析授权范围内的 JavaScript/TypeScript 项目、微信小程序源码、解包小程序、webpack/browserify bundle、压缩混淆后的前端代码和混合前端产物，并输出可读、可复核、有工程价值的中文分析报告。

核心原则很简单：**Codex 是分析者，脚本不是分析者。** Codex 自己决定如何读代码、追请求链路、判断敏感信息、恢复接口和写报告。仓库里只保留小脚本，用来帮助 Codex 快速收集“应该人工复核的线索”。

## 核心能力

- 直接盘点项目结构、入口、路由、页面、组件、bundle、source map、chunk、配置和静态资源。
- 追踪请求 wrapper、拦截器、base URL、Header、token、tenant/org/user ID、签名/加密逻辑。
- 恢复接口路径、请求方法、Query/Header/Body、参数来源、最小请求包和可能返回包。
- 从源码、mock、类型定义、UI 读取字段、成功/失败分支、HAR/请求响应包中判断返回结构。
- 发现 appid、默认/测试账号、硬编码密码、token、ak/sk、私钥、webhook、DSN、存储桶、API 文档、仓库、CI/CD、监控、配置中心等线索。
- 识别 source map、本地构建路径、开发者信息、运维系统、第三方 SDK、crypto/signature 逻辑。
- 默认只输出中文 `project-report.md`，报告要能直接给工程师或授权审计人员阅读。
- 只有确认请求/响应存在加密、解密或签名流程且用户需要复现时，才额外输出一个 Node.js `crypto-helper.mjs`，并在报告中写明用法。

## Codex 工作流

1. 根据用户提示解析目标目录，例如当前目录下的 `xxx`。
2. 用 `rg --files` 和高价值搜索词盘点项目，不一次性把整个项目塞进上下文。
3. 优先读 manifest、路由、请求层、配置、页面/组件、store、bundle runtime 和 source map。
4. 先追请求封装和鉴权/签名，再列接口。
5. 对每个接口恢复请求包、参数来源、返回包线索、证据和不确定项。
6. 从项目架构、资深开发、网站/产品、情报、普通用户、授权安全评估等视角补全。
7. 写中文 `project-report.md`，并在结束前做一次漏检搜索。

## 输出约定

默认用户可见输出只有：

| 文件 | 什么时候生成 |
| --- | --- |
| `project-report.md` | 每次 JS 项目分析都生成，中文总结报告。 |
| `crypto-helper.mjs` | 仅当确认请求/响应加解密或签名逻辑，并且复现脚本对用户有用时生成。 |

不要默认生成 Postman、OpenAPI、Mermaid、JSON、CSV、额外 Markdown、截图、拷贝源码、恢复后的 bundle 或证据包。若生成 `crypto-helper.mjs`，必须在 `project-report.md` 中说明：哪里用了加解密/签名、脚本支持哪些命令、需要哪些输入、如何调用、还有哪些限制。

## 内部线索脚本

唯一推荐的内部分析辅助脚本是：

```bash
node scripts/codex-js-leads.mjs <target-project> --out analysis-output/<project-name> --json-only
```

它会生成一个 scratch 文件：

| 文件 | 用途 |
| --- | --- |
| `codex-js-leads.json` | API、请求调用、敏感配置、账号、域名、source map、chunk、crypto、运维和开发者线索。 |

这个脚本只做本地文本扫描，不执行目标项目代码，不生成最终报告。它的输出只是“让 Codex 去看的地图”，不是结论，也不是用户交付物。

校验小脚本输出：

```bash
node scripts/validate-outputs.mjs analysis-output/<project-name> --json-only
```

## 报告结构

`project-report.md` 默认使用中文：

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
13. 可调用脚本（仅当生成 `crypto-helper.mjs`）
14. 安全与复核事项

每个接口详情建议包含：

- **接口**：方法、路径、原始 URL、Base URL、模块/功能、可信度、鉴权/签名线索。
- **业务含义**：哪个页面/功能/动作调用它。
- **参数来源**：Query、Body、Header、Path 参数从哪里恢复。
- **参数说明**：参数名、位置、是否必填、来源和推断说明。
- **最小请求包示例**：根据证据拼出的 HTTP 请求包。
- **返回包**：真实响应包、前端读取字段或静态推断说明。
- **可能的返回包示例**：标明 observed/mock/inferred。
- **证据**：`file:line` 和代码片段摘要。
- **不确定项**：动态片段、缺失字段、签名细节或下一步应检查文件。

## 安装依赖

当前小脚本只依赖 Node.js 标准库，不需要 `npm install`。Node.js 版本要求：`>=18.18.0`。

## 安全说明

- 只分析你有授权检查的项目。
- 默认本地报告会保留发现的真实值，包括 token、appid、内部 URL、默认账号、source-map 路径和其他敏感线索。
- 只有在准备共享版报告时，才显式脱敏。
- 不要提交生成的分析结果或真实目标的 `crypto-helper.mjs`。本仓库已忽略 `analysis-output/`、`reports/`、`evidence/`、`*.analysis-output/` 和 `tests/`。
- 下载 chunk、source map、H5 或补充文件前，应先审查候选证据并获得用户批准。
