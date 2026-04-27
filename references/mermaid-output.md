# Mermaid Output

Markdown reports include Mermaid diagrams and the CLI writes standalone `.mmd` files under:

```text
analysis-output/diagrams/
```

Generated diagrams:

- `website-flow.mmd`: project, features/routes, APIs, chunks, and source maps.
- `intelligence-map.mmd`: external assets, developer signals, operations signals, and third-party services.
- `call-graph.mmd`: static call graph edges.
- `architecture.mmd`: modules, APIs, crypto, gateways, config centers, storage/CDN, and service-discovery assets.

Use these diagrams as review maps. They are intentionally compact and evidence-led, not exhaustive full-code graphs.
