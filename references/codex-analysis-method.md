# Codex Analysis Method

This skill should make Codex behave like an experienced JS reverse-engineering and project-handoff engineer, not just a regex runner.

## Mental Model

Codex usually succeeds on JS projects because it combines several views:

1. **File-system view**: infer project type from file names, directories, manifests, bundles, source maps, Mini Program files, and static assets.
2. **String-intelligence view**: find URLs, domains, keys, accounts, routes, event names, permission codes, SDK names, and operations endpoints.
3. **Code-flow view**: trace from page/component/business function to request wrapper, interceptor, headers, token, signature, and response handler.
4. **Bundle-runtime view**: identify webpack/browserify module systems, chunks, dynamic imports, public paths, and source maps.
5. **Source-map view**: recover original source paths and `sourcesContent`; use source-map files as virtual source files when available.
6. **Business-language view**: infer modules and features from route names, Chinese/English UI text, API prefixes, permission codes, i18n keys, and analytics events.
7. **Crypto-pattern view**: recognize known algorithms/libraries and separate shared crypto/signature helpers from the API features that call them.
8. **Evidence view**: keep every conclusion tied to file, line, snippet, confidence, and uncertainty.

## How To Analyze Common User Prompts

When the user says "analyze the xxx project under the current directory":

1. Resolve `xxx` relative to the current working directory.
2. Run or continue the resumable analyzer:

   ```bash
   node scripts/js-analyzer.mjs analyze ./xxx --out ./analysis-output/xxx
   ```

3. Read `analysis-output/xxx/analysis-state/run-summary.md`.
4. For web bundles, run chunk discovery. Ask the user before downloading remote chunks:

   ```bash
   node scripts/js-analyzer.mjs discover-chunks --out ./analysis-output/xxx
   node scripts/js-analyzer.mjs download-chunks --out ./analysis-output/xxx --base-url https://example.com/
   node scripts/js-analyzer.mjs discover-sourcemaps --out ./analysis-output/xxx
   node scripts/js-analyzer.mjs download-sourcemaps --out ./analysis-output/xxx --base-url https://example.com/
   ```

5. Inspect high-value artifacts manually when needed:
   - `analysis.json`
   - API shards under `analysis-state/shards/`
   - webpack `.map` files and recovered `sourcesContent`
   - Mermaid diagrams under `analysis-output/xxx/diagrams/`
   - `analysis.callGraph`
   - request wrapper files
   - config files and Mini Program manifests
6. Improve uncertain findings by targeted reads/searches, not by loading the whole project into context.

## High-Signal Search Terms

Use `rg` before broad reading:

```bash
rg -n "wx\\.request|uni\\.request|Taro\\.request|axios|fetch\\(|XMLHttpRequest|baseURL|baseUrl|Authorization|token|sign|signature|CryptoJS|createHmac|createHash|JSEncrypt|sm2|sm3|sm4" <target>
rg -n "Object\\([^)]{1,120}\\)\\s*\\(\\s*['\"]/(api|auth|authStaff|file|logout|pageHits|report)|\\b[a-zA-Z_$][\\w$]{0,40}\\s*\\(\\s*['\"]/(api|auth|authStaff|file|logout|pageHits|report)|\\$ajaxRequest" <target>
rg -n "nacos|apollo|consul|eureka|swagger|knife4j|gitlab|github|gitee|jenkins|harbor|sentry|bugly|oss|cos|s3|apk|ipa" <target>
```

## Source Projects

For readable source projects:

- Start from `package.json`, framework config, router files, API directories, and request wrapper modules.
- Trace wrappers and interceptors before listing endpoints; many projects hide base URL, headers, token, tenant ID, and signature there.
- Use route/component names to group features.

## WeChat Mini Program Source

For Mini Program source:

- Read `app.json`, `project.config.json`, `ext.json`, pages, subpackages, plugins, and cloud env ids.
- Search `wx.request`, `wx.uploadFile`, `wx.downloadFile`, `wx.connectSocket`, `wx.getStorageSync`, and request wrappers.
- Treat page paths as feature boundaries.

## Unpacked Mini Programs

For unpacked Mini Programs:

- Identify runtime files such as `app-service.js`, `page-frame.html`, page service files, and split modules.
- Beautify mentally or with tools, then search high-signal strings.
- Reconstruct page/feature names from embedded route strings, `Page(...)`, `Component(...)`, and object keys.

## Webpack/Browserify Downloads

For downloaded frontend bundles:

- Locate chunks, runtime, `publicPath`, source-map comments, dynamic imports, and route chunks.
- Prefer `.map` `sourcesContent` over minified bundle text when available.
- Discover missing lazy chunks from `__webpack_require__.u`, `__webpack_require__.p`, chunk filename maps, `import()` URLs, script-loader code, and source-map comments.
- Discover missing source maps from `sourceMappingURL` and `.js.map` strings, then ask the user before downloading.
- If no source map exists, use string islands: URLs, route paths, permission codes, i18n text, SDK names, and API prefixes.
- Do not stop at `axios/fetch/wx.request` regexes. Many minified bundles expose request helpers as `Object(g["a"])("/auth/getUserInfo", data)`, `s("/file/image", data)`, or `this.$ajaxRequest("/pageHits/savePageHits", data)`. When these paths are visible, trace the nearest wrapper and include them as static API candidates with lower confidence if the exact runtime method is not confirmed.
- Deduplicate repeated strings across chunks and preserve which chunk contained the evidence.

## Website and Intelligence Diagrams

Use Mermaid diagrams to compress findings:

- `website-flow.mmd`: routes/features to APIs/chunks/source maps.
- `intelligence-map.mmd`: domains, repos, people, operations systems, third-party services.
- `call-graph.mmd`: static caller/callee leads.
- `architecture.mmd`: modules, APIs, crypto, gateways, config centers, storage/CDN.

## Manual Review Rules

Codex should manually inspect when:

- API URL is dynamic and only partially resolved.
- `sign` or `encrypt` exists but exact canonicalization is unclear.
- A string could be a false positive, such as example docs or test data.
- Minified code contains multiple request wrappers with similar names.

Put unresolved items in `uncertainties` with the next best file to inspect.
