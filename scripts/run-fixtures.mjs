#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(repoRoot, "assets", "synthetic-fixtures", "mini-program-wrapper");
const outputRoot = path.join(repoRoot, "analysis-output", "synthetic-mini-program-wrapper");

await fs.rm(outputRoot, { recursive: true, force: true });
await run(process.execPath, [
  path.join(repoRoot, "scripts", "js-analyzer.mjs"),
  "analyze",
  fixtureRoot,
  "--out",
  outputRoot,
  "--max-files-per-task",
  "20",
  "--max-bytes-per-task",
  "200000"
]);

const analysis = JSON.parse(await fs.readFile(path.join(outputRoot, "analysis.json"), "utf8"));
const byPath = new Map((analysis.apis || []).map((api) => [api.path, api]));
const paths = [...byPath.keys()].sort();

assert.ok(byPath.has("/api/member/profile"), "object-style request wrapper callsite should be extracted");
assert.equal(byPath.get("/api/member/profile").method, "GET");
assert.deepEqual(byPath.get("/api/member/profile").query, { memberId: "u001" });

assert.ok(byPath.has("/api/order/list"), "url-argument request wrapper callsite should be extracted");
assert.equal(byPath.get("/api/order/list").method, "POST");
assert.deepEqual(byPath.get("/api/order/list").body, { pageNo: 1, pageSize: 20 });
assert.deepEqual(paths, ["/api/member/profile", "/api/order/list"], "wrapper internals should not create base-only phantom APIs");

console.log(`Fixture tests passed: ${(analysis.apis || []).length} API candidates extracted.`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}
