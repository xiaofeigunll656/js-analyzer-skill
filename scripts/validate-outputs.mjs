#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const REQUIRED_ANALYSIS_KEYS = [
  "schemaVersion",
  "project",
  "inventory",
  "modules",
  "features",
  "apis",
  "crypto",
  "configs",
  "accounts",
  "externalAssets",
  "chunkDiscovery",
  "sourceMapDiscovery",
  "supplementDiscovery",
  "callGraph",
  "developerSignals",
  "operationsSignals",
  "thirdPartyServices",
  "evidence",
  "uncertainties"
];

function usage() {
  console.error("Usage: node scripts/validate-outputs.mjs <analysis-output-dir>");
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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function validate(outDir) {
  const out = path.resolve(outDir);
  const files = {
    analysis: path.join(out, "analysis.json"),
    markdown: path.join(out, "project-report.md"),
    postman: path.join(out, "postman_collection.json"),
    openapi: path.join(out, "openapi.json"),
    swagger: path.join(out, "swagger-ui.html"),
    plan: path.join(out, "analysis-state", "plan.json"),
    progress: path.join(out, "analysis-state", "progress.jsonl"),
    summary: path.join(out, "analysis-state", "run-summary.md")
  };

  for (const [name, filePath] of Object.entries(files)) {
    assert(await exists(filePath), `Missing ${name}: ${filePath}`);
  }

  const analysis = await readJson(files.analysis);
  for (const key of REQUIRED_ANALYSIS_KEYS) {
    assert(Object.prototype.hasOwnProperty.call(analysis, key), `analysis.json missing key: ${key}`);
  }
  for (const key of ["modules", "features", "apis", "crypto", "configs", "accounts", "externalAssets", "developerSignals", "operationsSignals", "thirdPartyServices", "evidence", "uncertainties"]) {
    assert(Array.isArray(analysis[key]), `analysis.${key} must be an array`);
  }
  assert(analysis.chunkDiscovery && typeof analysis.chunkDiscovery === "object", "analysis.chunkDiscovery must be an object");
  assert(analysis.sourceMapDiscovery && typeof analysis.sourceMapDiscovery === "object", "analysis.sourceMapDiscovery must be an object");
  assert(analysis.supplementDiscovery && typeof analysis.supplementDiscovery === "object", "analysis.supplementDiscovery must be an object");
  assert(Array.isArray(analysis.callGraph), "analysis.callGraph must be an array");

  const plan = await readJson(files.plan);
  assert(Array.isArray(plan.tasks), "plan.json tasks must be an array");
  assert(plan.tasks.length > 0, "plan.json must contain tasks");
  const invalidStatus = plan.tasks.find((task) => !["pending", "in_progress", "completed", "blocked", "failed", "skipped"].includes(task.status));
  assert(!invalidStatus, `Invalid task status in ${invalidStatus?.id}: ${invalidStatus?.status}`);

  const postman = await readJson(files.postman);
  assert(postman.info?.schema === "https://schema.getpostman.com/json/collection/v2.1.0/collection.json", "Postman schema must be v2.1");
  assert(Array.isArray(postman.item), "Postman collection item must be an array");

  const openapi = await readJson(files.openapi);
  assert(String(openapi.openapi || "").startsWith("3.1"), "OpenAPI version must be 3.1.x");
  assert(openapi.info?.title, "OpenAPI info.title is required");
  assert(openapi.paths && typeof openapi.paths === "object", "OpenAPI paths object is required");
  assert(openapi["x-js-analysis"], "OpenAPI x-js-analysis extension is required");

  const html = await fs.readFile(files.swagger, "utf8");
  assert(html.includes("analysis-data"), "swagger-ui.html must embed analysis-data JSON");
  assert(html.includes("sendApi"), "swagger-ui.html must include request sender");

  const progressText = await fs.readFile(files.progress, "utf8");
  assert(progressText.trim().length > 0, "progress.jsonl must not be empty");

  console.log(JSON.stringify({
    ok: true,
    outputDir: out,
    counts: {
      tasks: plan.tasks.length,
      apis: analysis.apis.length,
      configs: analysis.configs.length,
      externalAssets: analysis.externalAssets.length,
      evidence: analysis.evidence.length
    }
  }, null, 2));
}

const outDir = process.argv[2];
if (!outDir || outDir === "-h" || outDir === "--help") usage();

validate(outDir).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
