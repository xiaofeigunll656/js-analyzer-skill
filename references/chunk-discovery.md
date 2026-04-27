# Lazy Chunk Discovery and Download

Modern JS projects often lazy-load route chunks. If a user downloaded only the first page or one runtime bundle, the analysis can miss important modules.

## Default Behavior

Discovery is safe and offline:

```bash
node scripts/js-analyzer.mjs discover-chunks --out analysis-output
```

It reads existing local files and writes:

- `analysis-output/analysis-state/chunk-candidates.json`
- `analysis-output/analysis-state/checkpoints/checkpoint-002b-chunk-discovery.json`

## Download Behavior

Downloading remote chunks is network activity and must be explicit. Codex must ask the user before running it, and the CLI asks for each candidate unless `--yes` is supplied.

```bash
node scripts/js-analyzer.mjs download-chunks --out analysis-output
node scripts/js-analyzer.mjs download-chunks --out analysis-output --base-url https://example.com/
node scripts/js-analyzer.mjs download-chunks --out analysis-output --yes
```

Downloaded files go under:

```text
analysis-output/downloaded-chunks/
```

Do not write downloaded chunks into the target source tree. After downloading, reset extraction/render tasks and run:

```bash
node scripts/js-analyzer.mjs resume --out analysis-output
```

## Candidate Types

- `remote_url`: complete `https://...chunk.js` or protocol-relative URL.
- `relative_url`: relative chunk path that can be resolved with `--base-url`.
- `webpack_public_path`: inferred public path.
- `source_map`: source-map URL/comment.
- `needs_base_url`: useful candidate but cannot be fetched without an origin.
- `local_exists`: a referenced chunk already exists in the local project.

## Review Rules

Prefer downloading chunks that contain route names, chunk maps, source-map comments, or webpack runtime references. Skip ad/tracker/vendor chunks unless they appear to contain project business logic.
