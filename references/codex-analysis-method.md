# Codex Analysis Method

This skill should make Codex behave like an experienced JS reverse-engineering and project-handoff engineer. Codex chooses the analysis path; helper scripts only collect local evidence leads.

## Mental Model

Combine these views:

1. **File-system view**: project type from manifests, routes, pages, bundles, source maps, Mini Program files, and static assets.
2. **String-intelligence view**: URLs, domains, keys, accounts, routes, event names, permission codes, SDK names, and operations endpoints.
3. **Code-flow view**: page/component/business action to request wrapper, interceptor, headers, token, signature, and response handler.
4. **Bundle-runtime view**: webpack/browserify module systems, chunks, dynamic imports, public paths, aliases, and wrapper exports.
5. **Source-map view**: original source paths and `sourcesContent` as virtual source files.
6. **Traffic view**: user-provided HAR/request-response packets correlated with static source calls.
7. **Evidence view**: every conclusion tied to file, line, snippet summary, confidence, and uncertainty.

## Natural Prompt Workflow

When the user says "analyze the xxx project under the current directory":

1. Resolve `xxx` relative to the current working directory.
2. Inventory with `rg --files`, then read high-leverage files directly.
3. Optionally run the small lead helper when the project is large or minified:

   ```bash
   node scripts/codex-js-leads.mjs ./xxx --out ./analysis-output/xxx
   ```

4. Treat `codex-js-leads.md/json` as a reading checklist, not as the report.
5. Search API/request/config/crypto/ops terms and inspect nearby code slices.
6. Trace wrappers and request construction before writing the API list.
7. Reconstruct request and response packages with evidence.
8. Write the Markdown report in Chinese by default. It should read like a handoff report, not a raw extraction dump.

## High-Signal Search Terms

Use `rg` before broad reading:

```bash
rg -n "wx\\.request|uni\\.request|Taro\\.request|axios|fetch\\(|XMLHttpRequest|baseURL|baseUrl|Authorization|token|sign|signature|CryptoJS|createHmac|createHash|JSEncrypt|sm2|sm3|sm4" <target>
rg -n "Object\\([^)]{1,120}\\)\\s*\\(\\s*['\"]/(api|auth|authStaff|file|logout|pageHits|report)|\\b[a-zA-Z_$][\\w$]{0,40}\\s*\\(\\s*['\"]/(api|auth|authStaff|file|logout|pageHits|report)|\\$ajaxRequest" <target>
rg -n "password|passwd|pwd|secret|token|authorization|api[_-]?key|access[_-]?key|secret[_-]?key|appid|tenantId|orgId|account|username|phone|email" <target>
rg -n "nacos|apollo|consul|eureka|swagger|knife4j|yapi|apifox|gitlab|github|gitee|jenkins|harbor|sentry|bugly|oss|cos|s3|minio|apk|ipa" <target>
```

## Request/Response Reconstruction

For every important API, answer:

- What code calls it? Include page/component/module and business action.
- What wrapper sends it? Include method defaults, base URL selection, interceptors, timeout, retry, and error handling.
- What headers are added? Include auth token, tenant/org/user IDs, content type, timestamp, nonce, sign, cookies, and app IDs.
- Where do query/body values come from? Inspect call-site object literals, form state, route params, storage values, constants, and function parameters.
- What response fields does the frontend read? Inspect `.then`, `await`, callbacks, `res.data`, table columns, form fills, stores, and success/error branches.
- If traffic packets are provided, what exact request/response was observed? Label it as observed and correlate to the static call site.
- If only static evidence exists, produce a cautious mock and mark it as inferred.

## Manual Review Triggers

Manually inspect when:

- API URL is dynamic and only partially resolved.
- `sign`, `encrypt`, `hash`, or `nonce` exists but canonicalization is unclear.
- A string could be false positive docs or test data.
- Minified code contains multiple request wrappers with similar names.
- Helper output is empty, too small, or inconsistent with visible code.
- Response shapes are inferred only from UI usage.

Put unresolved items in `不确定项/待复核` with the next best file to inspect.
