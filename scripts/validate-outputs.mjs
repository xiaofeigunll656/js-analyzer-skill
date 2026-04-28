#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function usage() {
  console.error("Usage: node scripts/validate-outputs.mjs <codex-leads-output-dir>");
  process.exit(1);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function validate(outDir) {
  const out = path.resolve(outDir);
  const jsonPath = path.join(out, "codex-js-leads.json");
  const mdPath = path.join(out, "codex-js-leads.md");
  assert(await exists(jsonPath), `Missing Codex leads JSON: ${jsonPath}`);
  assert(await exists(mdPath), `Missing Codex leads Markdown: ${mdPath}`);

  const leads = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  assert(String(leads.schemaVersion || "").startsWith("codex-js-leads/"), "Invalid schemaVersion");
  assert(leads.project && typeof leads.project === "object", "Missing project summary");
  assert(leads.leads && typeof leads.leads === "object", "Missing leads object");
  assert(Array.isArray(leads.evidence), "evidence must be an array");

  const requiredCategories = [
    "apis",
    "requestCalls",
    "sensitiveConfigs",
    "accounts",
    "domains",
    "operations",
    "crypto",
    "sourceMaps",
    "chunks",
    "developerSignals"
  ];
  for (const category of requiredCategories) {
    assert(Array.isArray(leads.leads[category]), `leads.${category} must be an array`);
  }

  const md = await fs.readFile(mdPath, "utf8");
  assert(md.includes("Codex JS Leads"), "Markdown should identify the artifact");
  assert(md.includes("Codex Review Checklist"), "Markdown should include Codex review checklist");

  console.log(JSON.stringify({
    ok: true,
    outputDir: out,
    leadCounts: leads.leadCounts,
    evidence: leads.evidence.length
  }, null, 2));
}

const outDir = process.argv[2];
if (!outDir || outDir === "-h" || outDir === "--help") usage();

validate(outDir).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
