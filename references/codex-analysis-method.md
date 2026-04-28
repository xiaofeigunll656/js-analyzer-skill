# Codex Analysis Method

This skill should make Codex behave like an experienced JS reverse-engineering and project-handoff engineer, not a regex runner.

## Mental Model

Codex usually succeeds on JS projects because it combines several views:

1. **File-system view**: infer project type from files, directories, manifests, bundles, source maps, Mini Program files, and static assets.
2. **String-intelligence view**: find URLs, domains, keys, accounts, routes, event names, permission codes, SDK names, and operations endpoints.
3. **Code-flow view**: trace from page/component/business function to request wrapper, interceptor, headers, token, signature, and response handler.
4. **Bundle-runtime view**: identify webpack/browserify module systems, chunks, dynamic imports, public paths, aliases, and source maps.
5. **Source-map view**: recover original source paths and `sourcesContent`; use source-map files as virtual source files when available.
6. **Business-language view**: infer modules and features from route names, Chinese/English UI text, API prefixes, permission codes, i18n keys, and analytics events.
7. **Traffic view**: when HAR/request/response packets are provided, correlate observed traffic with source calls and label it separately from static inference.
8. **Crypto-pattern view**: recognize known algorithms/libraries and separate shared crypto/signature helpers from the API features that call them.
9. **Evidence view**: keep every conclusion tied to file, line, snippet summary, confidence, and uncertainty.

## Natural Prompt Workflow

When the user says "analyze the xxx project under the current directory":

1. Resolve `xxx` relative to the current working directory.
2. Choose an output directory such as `analysis-output/xxx` only for local notes/artifacts; do not assume scripts must run.
3. Check for prior work:
   - If `analysis-output/xxx/analysis-state/run-summary.md` exists, read it.
   - If `analysis-output/xxx/project-report.md` exists, skim it for prior conclusions and gaps.
   - If the previous report is complete but stale or too thin, refresh from source rather than presenting it unchanged.
4. Inventory the target with `rg --files`, then read high-leverage files directly.
5. Search for API/request/config/crypto/ops strings and inspect nearby code slices.
6. Trace wrappers and request construction before writing the API list.
7. Reconstruct request and response packages with evidence.
8. Use scripts only for helper passes when useful:
   - `node scripts/js-analyzer.mjs analyze ./xxx --out ./analysis-output/xxx` for broad indexing or machine artifacts.
   - `discover-chunks`, `discover-sourcemaps`, and `discover-supplements` when direct reading shows missing artifacts.
   - `validate-outputs` after generated machine outputs exist.
9. Write the Markdown report in Chinese by default. It should read like a handoff report, not a raw extraction dump.

## High-Signal Search Terms

Use `rg` before broad reading:

```bash
rg -n "wx\\.request|uni\\.request|Taro\\.request|axios|fetch\\(|XMLHttpRequest|baseURL|baseUrl|Authorization|token|sign|signature|CryptoJS|createHmac|createHash|JSEncrypt|sm2|sm3|sm4" <target>
rg -n "Object\\([^)]{1,120}\\)\\s*\\(\\s*['\"]/(api|auth|authStaff|file|logout|pageHits|report)|\\b[a-zA-Z_$][\\w$]{0,40}\\s*\\(\\s*['\"]/(api|auth|authStaff|file|logout|pageHits|report)|\\$ajaxRequest" <target>
rg -n "nacos|apollo|consul|eureka|swagger|knife4j|yapi|apifox|gitlab|github|gitee|jenkins|harbor|sentry|bugly|oss|cos|s3|minio|apk|ipa" <target>
rg -n "localStorage|sessionStorage|getStorage|setStorage|cookie|tenantId|orgId|userId|role|permission|menu|captcha|sms|pay|upload|download" <target>
```

## Request/Response Reconstruction

For every important API, try to answer:

- What code calls it? Include page/component/module and business action.
- What wrapper sends it? Include method defaulting, base URL selection, interceptors, timeout, retries, and error handling.
- What headers are added? Include auth token, tenant/org/user IDs, content type, timestamp, nonce, sign, cookies, and app IDs.
- Where do query/body values come from? Inspect call-site object literals, form state, route params, storage values, constants, and function parameters.
- What response fields does the frontend read? Inspect `.then`, `await`, callbacks, `res.data`, table columns, form fills, stores, and success/error branches.
- If traffic packets are provided, what exact request/response was observed? Label it as observed and correlate to the static call site.
- If only static evidence exists, produce a cautious mock and mark it as inferred.

## Source Projects

For readable source projects:

- Start from `package.json`, framework config, router files, API directories, and request wrapper modules.
- Trace wrappers and interceptors before listing endpoints; many projects hide base URL, headers, token, tenant ID, and signature there.
- Use route/component names, UI text, and stores to group features.
- Inspect mock files, TypeScript interfaces, table schemas, and validation rules for response/request shape clues.

## WeChat Mini Program Source

For Mini Program source:

- Read `app.json`, `project.config.json`, `ext.json`, pages, subpackages, plugins, cloud env IDs, and domain config.
- Search `wx.request`, `wx.uploadFile`, `wx.downloadFile`, `wx.connectSocket`, `wx.getStorageSync`, and request wrappers.
- Treat page paths and `Page`/`Component` files as feature boundaries.
- Include Mini Program permissions, required private infos, plugin providers, webview URLs, and cloud functions when present.

## Unpacked Mini Programs

For unpacked Mini Programs:

- Identify runtime files such as `app-service.js`, `page-frame.html`, page service files, and split modules.
- Beautify mentally or with safe local tools, then search high-signal strings.
- Reconstruct page/feature names from embedded route strings, `Page(...)`, `Component(...)`, and object keys.
- Do not stop at direct `wx.request`; wrappers are often minified aliases.

## Webpack/Browserify Downloads

For downloaded frontend bundles:

- Locate chunks, runtime, `publicPath`, source-map comments, dynamic imports, and route chunks.
- Prefer `.map` `sourcesContent` over minified bundle text when available.
- Discover missing lazy chunks from `__webpack_require__.u`, `__webpack_require__.p`, chunk filename maps, `import()` URLs, script-loader code, and source-map comments.
- Discover missing source maps from `sourceMappingURL` and `.js.map` strings, then ask the user before downloading.
- If no source map exists, use string islands: URLs, route paths, permission codes, i18n text, SDK names, API prefixes, and wrapper call shapes.
- Do not stop at `axios/fetch/wx.request` regexes. Many minified bundles expose request helpers as `Object(g["a"])("/auth/getUserInfo", data)`, `s("/file/image", data)`, or `this.$ajaxRequest("/pageHits/savePageHits", data)`.
- Deduplicate repeated strings across chunks and preserve which chunk contained the evidence.

## Website and Intelligence Diagrams

Use Mermaid diagrams to compress findings when helpful:

- `website-flow.mmd`: routes/features to APIs/chunks/source maps.
- `intelligence-map.mmd`: domains, repos, people, operations systems, third-party services.
- `call-graph.mmd`: static caller/callee leads.
- `architecture.mmd`: modules, APIs, crypto, gateways, config centers, storage/CDN.

## Manual Review Triggers

Manually inspect when:

- API URL is dynamic and only partially resolved.
- `sign`, `encrypt`, `hash`, or `nonce` exists but canonicalization is unclear.
- A string could be a false positive, such as example docs or test data.
- Minified code contains multiple request wrappers with similar names.
- Script output is empty, too small, or inconsistent with visible code.
- Response shapes are inferred only from UI usage.

Put unresolved items in `uncertainties` with the next best file to inspect.
