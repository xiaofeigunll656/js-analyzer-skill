# Postman and OpenAPI Rules

Do not generate Postman, OpenAPI, or local HTML API workspaces during the default analysis. The default deliverable is `project-report.md`, with an optional `crypto-helper.mjs` only when confirmed crypto/signature reproduction is useful. Use these rules only when the user explicitly asks for these formats.

## Postman

- Use Postman Collection v2.1 schema.
- Group requests by `module -> feature -> API` when module/feature is known.
- Store raw discovered variables in collection variables.
- Put source file, line, request construction, crypto references, and confidence in request descriptions.
- Use pre-request scripts only when the crypto/signature logic can be expressed safely in Postman sandbox JavaScript.

## OpenAPI

- Use OpenAPI 3.1.
- Use `tags` for modules and features.
- Use `components.schemas` for request and response mocks.
- Populate `parameters` from static URL path/query inference and request parameter objects where possible; keep uncertain values as examples and preserve the evidence in `x-js-analysis`.
- Use `x-js-analysis` for source evidence, confidence, crypto pipeline, configs, accounts, external assets, and progress summary.
- Preserve dynamic or uncertain URLs as vendor extensions if they cannot be represented as stable OpenAPI paths.

## Local HTML

Codex may create local HTML API notes when the user asks, but this skill no longer bundles a Swagger proxy or generator. Keep any generated API workspace local and evidence-labeled so users can distinguish static reconstruction from observed traffic.
