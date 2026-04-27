# Markdown Report Template

`project-report.md` must be written in Chinese by default. Use this structure:

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

The beginning must quickly answer:

- 项目有哪些结构：项目类型、目录/包/插件、页面根目录、业务模块、关键调用线索。
- 项目有哪些功能：页面、文案、业务模块、接口前缀共同推断出的功能域。
- 项目有哪些接口：域名/网关、HTTP 方法分布、接口前缀、完整接口索引。

Each API detail must follow this shape, similar to a manual API note:

- 接口：method, path, raw URL, base URL, group, confidence, auth/signature hint.
- 参数来源：query/body/header/path 参数来自哪里, plus evidence bullets.
- 参数说明：table with 参数, 位置, 是否必填, 说明.
- 最小请求包示例：HTTP request example.
- 返回包：type, likely read fields, processing caveat.
- 可能的返回包示例：JSON example.
- 证据：file:line bullets with extractor and short snippet.

Inside raw appendices include website analyst view, intelligence analyst view, lazy chunk discovery, source-map discovery, architecture/modules, features, call graph, complete API candidate table, configs, external assets, developer signals, operations signals, third-party services, evidence highlights, and uncertainties.

Prefer concise tables in overview sections, but keep the interface details explicit enough for an engineer to copy a request shape and trace it back to source evidence. Keep full raw values available through `analysis.json` and collapsible appendices.
