# Output Schema

`analysis.json` is the only source used to render Markdown, Postman, OpenAPI, and the local Swagger-style UI. Do not maintain separate hand-written output state.

## Evidence Rules

Every non-obvious finding must reference at least one `evidence` item. Evidence must include file path, line number when available, a short snippet, extraction method, and confidence.

Confidence values:

- `0.95`: direct literal match in source or config.
- `0.85`: direct wrapper/request call with method and URL visible.
- `0.70`: inferred from nearby variables or route/file naming.
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

Store raw discovered values by default. Use the `metadata.redacted` flag only when `--redact-secrets` is requested.

## Chunk Discovery

`chunkDiscovery` records lazy-loaded script candidates:

- `publicPaths`: inferred webpack/Vite public paths and source files.
- `candidates`: complete or relative chunk URLs, source-map URLs, and filename hints.
- `downloaded`: chunks saved under `analysis-output/downloaded-chunks/`.
- `needsBaseUrl`: relative candidates requiring a user-provided origin.

Candidate status values: `candidate`, `needs_base_url`, `local_exists`, `downloaded`, `skipped`, `failed`.

## Source Map Discovery

`sourceMapDiscovery` records local, missing, downloadable, and downloaded source maps:

- `candidates`: source-map comments and `.js.map` strings.
- `downloaded`: maps saved under `analysis-output/downloaded-sourcemaps/`.
- `needsBaseUrl`: relative source-map candidates requiring an origin.

Downloaded maps are analyzed as virtual source files through their `sourcesContent`.

## Supplement Discovery

`supplementDiscovery` records high-confidence ways to complete the current project without packet capture:

- `missingPlugins`: Mini Program plugin providers declared in app config but not present in the local tree.
- `localCacheSearches`: appid/provider search hints for local Mini Program cache or `.wxapkg` package locations.
- `h5Entries`: WebView/H5 URLs that appear directly in current project files and can reveal additional static JS.
- `downloadable`: remote JS, H5, manifest, and source-map candidates with resolved URLs.
- `downloaded`: supplemental files saved under `analysis-output/downloaded-supplements/`.

Download supplemental files only when the candidate is tied to current-project evidence. Downloaded HTML/JS is validated for project markers and then included in later extraction batches.

## Call Graph

`callGraph` stores static edges:

- `caller`, `callee`, `file`, `line`, `confidence`, `evidenceIds`.
- `metadata.mode` records extraction mode such as `lightweight-ast`.

These edges are used for Mermaid diagrams and manual review. They are static leads, not guaranteed runtime reachability.

## Diagrams

`diagrams` lists generated Mermaid files under `analysis-output/diagrams/`.

## API Fields

For each API, store:

- `method`: HTTP method, default `GET` if only a URL literal is visible.
- `url`: original value as found. Preserve dynamic template fragments.
- `baseUrl` and `path`: fill when they can be parsed or inferred.
- `headers`, `query`, `body`: extracted literal or mock structures.
- `requestConstruction`: short explanation of wrapper/interceptor/baseURL/signature flow.
- `requestMock` and `responseMock`: practical examples for Postman/OpenAPI.
- `cryptoIds`: references to shared crypto/signature findings.

## External Assets

External assets are first-class output, not miscellaneous notes. Categorize as repository, download, config_center, api_docs, storage_cdn, ci_cd, monitoring, webhook, registry, service_discovery, gateway, third_party, websocket, graphql, or unknown.

## Progress Summary

Mirror the latest plan summary into `analysisState` so rendered reports show whether the result is complete or partial.
