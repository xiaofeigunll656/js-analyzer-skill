# Source Map Completion

Source maps are high-value analysis inputs for downloaded web bundles. They reveal original source paths, module names, route files, and `sourcesContent`.

## Discovery

Use:

```bash
rg -n "sourceMappingURL|\\.js\\.map|\"sourcesContent\"|\"webpack://|/Users/|C:\\\\Users\\\\" <target>
```

The helper can surface source-map hints:

```bash
node scripts/codex-js-leads.mjs <target> --out analysis-output/<project-name> --json-only
```

## Review Rules

- Treat local `.map` files as virtual source directories.
- Analyze `sourcesContent` as normal JS/TS source.
- Preserve both the `.map` file path and original source name in evidence.
- Download missing source maps only after user approval.
- Do not write downloaded maps into the target source tree.
