# Markdown Report Template

`project-report.md` must be written in Chinese by default. It should read like a useful handoff report written by a senior engineer, not a raw scanner dump.

## Required Structure

1. 概述
2. 开头总览：结构、功能、接口
3. 关键指标
4. 项目结构与运行信息
5. 小程序元数据（如适用）
6. 功能模块
7. 请求封装、鉴权、签名与加解密
8. 接口清单
9. 接口详情
10. 插件、第三方服务和外部资产
11. 敏感配置、账号和运维线索
12. 补充文件线索：chunk/source map/H5/plugin
13. 可调用脚本（仅当生成 `crypto-helper.mjs`）
14. 安全与复核事项

Do not add standalone raw appendices, Mermaid-only files, Postman/OpenAPI exports, JSON summaries, CSV tables, screenshots, or copied source unless the user explicitly asks. Keep raw evidence inside concise report sections or local scratch only.

## Opening Requirements

The beginning must quickly answer:

- 项目有哪些结构：项目类型、目录/包/插件、页面根目录、业务模块、关键调用线索。
- 项目有哪些功能：页面、文案、业务模块、接口前缀、权限码、事件名共同推断出的功能域。
- 项目有哪些接口：域名/网关、HTTP 方法分布、接口前缀、完整接口索引、主要 wrapper。
- 请求如何构造：base URL、headers、token、tenant/org/user ID、content type、签名/加密、错误处理。
- 返回如何判断：真实响应包（如用户提供）、前端读取字段、mock/docs/类型定义、静态推断限制。
- 是否存在可调用脚本：只有确认请求/响应加解密或签名逻辑时才生成 Node.js `crypto-helper.mjs`，否则明确写“未确认需要额外脚本的加解密/签名流程”。

## API Detail Shape

Each API detail must follow this shape, similar to a manual API note:

- **接口**：method, path, raw URL, base URL, module/feature, confidence, auth/signature hint.
- **业务含义**：which page/feature/action appears to call it and why it matters.
- **参数来源**：where query/body/header/path parameters came from, with evidence bullets.
- **参数说明**：table with 参数, 位置, 是否必填, 来源, 说明.
- **最小请求包示例**：HTTP request example assembled from wrapper/base URL/header/body evidence.
- **返回包**：observed response if provided; otherwise likely response type, frontend-read fields, and processing caveat.
- **可能的返回包示例**：JSON example marked as observed, mock, or static inference.
- **证据**：file:line bullets with review/extractor method and short snippet summary.
- **不确定项**：dynamic pieces, missing response fields, unclear signature, or files to inspect next.

## Report Quality Bar

- Lead with conclusions, then evidence. Do not make readers dig through raw tables before knowing what the project does.
- Group APIs by business feature when possible, not only by URL prefix.
- Explain wrapper/interceptor/signature behavior once, then reference it from API details.
- Clearly separate observed traffic from static inference.
- Include low-confidence but useful leads in "不确定项/待复核", not as certain facts.
- Keep concise tables in overview sections, but make API details explicit enough for an engineer to copy a request shape and trace it back to source evidence.
- Keep the report self-contained enough for handoff without relying on helper JSON/Markdown.

## Optional Node.js Helper Section

Include this section only when a script is generated:

- `脚本路径`：usually `crypto-helper.mjs` next to `project-report.md`.
- `作用范围`：which wrapper/interceptor/API uses the flow and whether it signs requests, encrypts request bodies, or decrypts responses.
- `证据`：file:line references for algorithm, key/iv/salt/nonce/timestamp sources, canonicalization, and call sites.
- `用法`：exact command examples, required Node.js version, and dependency install command if the script needs a third-party package.
- `限制`：dynamic keys, missing traffic samples, unconfirmed padding/mode, or response fields that still need validation.
