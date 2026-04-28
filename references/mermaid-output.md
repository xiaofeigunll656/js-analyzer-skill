# Mermaid Output

Do not generate Mermaid diagrams or standalone `.mmd` files during the default analysis. The default deliverable is `project-report.md`, with an optional `crypto-helper.mjs` only when confirmed crypto/signature reproduction is useful.

When the user explicitly asks for diagrams, Markdown reports may include compact Mermaid diagrams and Codex may write standalone `.mmd` files under:

```text
analysis-output/diagrams/
```

When explicitly requested, generated diagrams can include:

- `website-flow.mmd`: project, features/routes, APIs, chunks, and source maps.
- `intelligence-map.mmd`: external assets, developer signals, operations signals, and third-party services.
- `call-graph.mmd`: static call graph edges.
- `architecture.mmd`: modules, APIs, crypto, gateways, config centers, storage/CDN, and service-discovery assets.

Use these diagrams as review maps. They are intentionally compact and evidence-led, not exhaustive full-code graphs.
