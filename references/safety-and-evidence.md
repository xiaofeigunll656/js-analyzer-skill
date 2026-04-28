# Safety and Evidence

## Authorization

Use this skill only for projects the user is authorized to analyze. Do not help bypass access controls or attack third-party systems.

## Secret Handling

Default behavior is to preserve raw values in the local `project-report.md`. This is intentional for engineering handoff and authorized audits.

Use explicit redaction only for shareable output. Keep analysis output directories ignored by Git, and do not commit real-target `crypto-helper.mjs` files.

## Execution Safety

Do not execute target project code by default. Do not run unknown package scripts, `postinstall`, or production build commands as part of static analysis. Treat dynamic decoder evaluation as separate explicit work.

## Evidence Integrity

Do not invent APIs, parameters, or crypto details. Record uncertainty when the evidence is incomplete. Prefer a useful low-confidence lead in `uncertainties` over a confident false claim in the main report.
