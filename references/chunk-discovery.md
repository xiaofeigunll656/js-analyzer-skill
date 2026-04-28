# Lazy Chunk Discovery

Modern JS projects often lazy-load route chunks. Codex should inspect runtime bundle code directly for chunk maps and public paths.

## Search Leads

Use:

```bash
rg -n "__webpack_require__\\.u|__webpack_require__\\.p|webpackChunk|import\\(|sourceMappingURL|\\.chunk\\.js|async chunk|publicPath" <target>
```

The helper can surface chunk hints:

```bash
node scripts/codex-js-leads.mjs <target> --out analysis-output/<project-name>
```

## Review Rules

- Prefer chunks tied to route names, business modules, source-map comments, or webpack runtime maps.
- Skip ad/tracker/vendor chunks unless they appear to contain project business logic.
- Do not write downloaded chunks into the target source tree.
- Download remote chunks only after user approval.
- After obtaining chunks, inspect them directly as additional source.
