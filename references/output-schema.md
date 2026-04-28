# Output Schema

`analysis.json` is an optional machine-readable representation of Codex's evidence-backed analysis. Use it when rendering Postman, OpenAPI, local Swagger-style HTML, diagrams, or resumable state. Do not let it replace the human Markdown report; keep both aligned when both exist.

## Evidence Rules

Every non-obvious finding must reference at least one `evidence` item. Evidence must include file path, line number when available, a short snippet, extraction method or review method, and confidence.

Confidence values:

- `0.95`: direct literal match in source, config, source map, or observed traffic supplied by the user.
- `0.85`: direct wrapper/request call with method and URL visible.
- `0.70`: inferred from nearby variables, call-site objects, response handling, route/file naming, or UI bindings.
- `0.50`: weak keyword or bundle/source-map inference.
- Below `0.50`: put in `uncertainties` instead of main findings unless it is still useful as a lead.

## Entity Conventions

Use stable IDs with readable prefixes:

- `module_*`
- `feature_*`
- `api_*`
- `crypto_*`
- `config_*`
- `account_*`
- `asset_*`
- `developer_*`
- `ops_*`
- `thirdparty_*`
- `evidence_*`

Store raw discovered values by default. Use a redaction flag only when redaction is explicitly requested.

## Chunk Discovery

`chunkDiscovery` records lazy-loaded script candidates:

- `publicPaths`: inferred webpack/Vite public paths and source files.
- `candidates`: complete or relative chunk URLs, source-map URLs, and filename hints.
- `downloaded`: chunks saved under local analysis output.
- `needsBaseUrl`: relative candidates requiring a user-provided origin.

Candidate status values: `candidate`, `needs_base_url`, `local_exists`, `downloaded`, `skipped`, `failed`.

## Source Map Discovery

`sourceMapDiscovery` records local, missing, downloadable, and downloaded source maps:

- `candidates`: source-map comments and `.js.map` strings.
- `downloaded`: maps saved under local analysis output.
- `needsBaseUrl`: relative source-map candidates requiring an origin.

Downloaded maps are analyzed as virtual source files through their `sourcesContent`.

## Supplement Discovery

`supplementDiscovery` records high-confidence ways to complete the current project without packet capture:

- `missingPlugins`: Mini Program plugin providers declared in app config but not present in the local tree.
- `localCacheSearches`: appid/provider search hints for local Mini Program cache or `.wxapkg` package locations.
- `h5Entries`: WebView/H5 URLs that appear directly in current project files and can reveal additional static JS.
- `downloadable`: remote JS, H5, manifest, and source-map candidates with resolved URLs.
- `downloaded`: supplemental files saved under local analysis output.

Download supplemental files only when the candidate is tied to current-project evidence and the user approves network access. Downloaded HTML/JS must be validated for project markers and then reviewed as additional source.

## Call Graph

`callGraph` stores static edges:

- `caller`, `callee`, `file`, `line`, `confidence`, `evidenceIds`.
- `metadata.mode` records extraction mode such as `manual-review`, `lightweight-ast`, or `source-map-review`.

These edges are review leads, not guaranteed runtime reachability.

## API Fields

For each API, store:

- `method`: HTTP method, default `GET` only when no stronger evidence exists.
- `url`: original value as found. Preserve dynamic template fragments.
- `baseUrl` and `path`: fill when they can be parsed or inferred.
- `headers`, `query`, `body`: extracted literal, observed traffic value, or clearly marked mock structures.
- `requestConstruction`: wrapper/interceptor/baseURL/signature/auth flow.
- `requestExample`: minimal request package that an engineer can inspect.
- `responseEvidence`: observed traffic response, frontend-read fields, mock/docs reference, or inferred response handling.
- `responseMock`: cautious example when no observed response exists.
- `cryptoIds`: references to shared crypto/signature findings.
- `confidence` and `uncertainties`: explicit caveats.

## External Assets

External assets are first-class output, not miscellaneous notes. Categorize as repository, download, config_center, api_docs, storage_cdn, ci_cd, monitoring, webhook, registry, service_discovery, gateway, third_party, websocket, graphql, or unknown.

## Progress Summary

Mirror the latest analysis status into `analysisState` so rendered reports show whether the result is complete, partial, manually reviewed, script-assisted, or blocked.
