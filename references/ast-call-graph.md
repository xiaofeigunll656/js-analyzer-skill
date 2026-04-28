# AST and Call Graph Review

Use call graph reasoning to connect website pages, request wrappers, API methods, crypto helpers, and external services. Do not generate a standalone call-graph artifact during default analysis.

## Modes

- `lightweight-ast`: built-in parser heuristics that extract functions and call edges without third-party dependencies.
- `babel-ast`: future/optional mode when Babel parser dependencies are installed and deeper AST traversal is needed.

When call graph evidence is useful, summarize only the important edges in `project-report.md`. Each edge should have caller, callee, file, line, evidence, and confidence.

## Analyst Uses

Website analyst:

- Follow page/component functions to route handlers, API calls, analytics events, and lazy chunks.
- Identify user flows by clustering calls around route/page files.

Intelligence analyst:

- Follow calls from request wrappers to domains, config centers, monitoring, webhooks, and storage/CDN helpers.
- Identify shared integration helpers that imply external platform dependencies.

Project architect:

- Map modules to shared utilities, crypto/signature helpers, and request layers.
- Identify high-leverage files where changing behavior affects many APIs.

## Manual Review

Call graph edges are leads, not proof of runtime reachability. Review evidence when:

- Code is minified or generated.
- Dynamic property access is used.
- The callee is a wrapper alias.
- Source-map virtual files disagree with minified bundle evidence.
