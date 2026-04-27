# Source Map Auto-Completion

Source maps are high-value analysis inputs for downloaded web bundles. They can reveal original source paths, module names, route files, and `sourcesContent`.

## Discovery

Discovery is offline:

```bash
node scripts/js-analyzer.mjs discover-sourcemaps --out analysis-output
```

It writes:

- `analysis-output/analysis-state/source-map-candidates.json`
- `analysis-output/analysis-state/checkpoints/checkpoint-002c-source-map-discovery.json`

## Download

Downloading source maps is network activity. Ask the user first.

```bash
node scripts/js-analyzer.mjs download-sourcemaps --out analysis-output --base-url https://target.example.com/
node scripts/js-analyzer.mjs download-sourcemaps --out analysis-output --yes
node scripts/js-analyzer.mjs resume --out analysis-output
```

Downloaded maps go under:

```text
analysis-output/downloaded-sourcemaps/
```

Do not write downloaded maps into the target source tree.

## Analysis Rules

- Treat downloaded `.map` files as virtual source directories.
- Analyze `sourcesContent` as if it were normal JS/TS source.
- Preserve both the `.map` file path and original source name in evidence.
- Source-map candidates should record whether they are local, downloadable, downloaded, failed, or require a base URL.
