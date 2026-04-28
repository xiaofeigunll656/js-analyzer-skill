#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await runFixture({
  name: "mini-program-wrapper",
  expectedPaths: ["/api/coupon/list", "/api/member/profile", "/api/order/list"],
  assertions: (byPath) => {
    assert.equal(byPath.get("/api/member/profile").method, "GET");
    assert.deepEqual(byPath.get("/api/member/profile").query, { memberId: "u001" });

    assert.equal(byPath.get("/api/order/list").method, "POST");
    assert.deepEqual(byPath.get("/api/order/list").body, { pageNo: 1, pageSize: 20 });

    assert.equal(byPath.get("/api/coupon/list").method, "POST");
    assert.deepEqual(byPath.get("/api/coupon/list").body, { memberId: "u001", status: "unused" });
  }
});

await runFixture({
  name: "api-literal-fallback",
  expectedPaths: ["/api/wallet/balance", "/webapi/coupon/detail"],
  assertions: (byPath) => {
    assert.equal(byPath.get("/api/wallet/balance").metadata.extractor, "api-path-literal-fallback");
    assert.equal(byPath.get("/webapi/coupon/detail").metadata.extractor, "api-path-literal-fallback");
  }
});

await runFixture({
  name: "webpack-object-wrapper",
  expectedPaths: [
    "/auth/getUserInfo",
    "/auth/getUserMenus",
    "/authStaff/getMenuNoAuthorize",
    "/authStaff/initWoegoRoleAndResource",
    "/file/image",
    "/logout",
    "/pageHits/getPageHitsCount",
    "/pageHits/savePageHits",
    "/report/list",
    "/user/profile"
  ],
  assertions: (byPath) => {
    assert.equal(byPath.get("/auth/getUserInfo").metadata.extractor, "bundle-wrapper-url-callsite");
    assert.equal(byPath.get("/auth/getUserInfo").method, "POST");
    assert.deepEqual(byPath.get("/auth/getUserInfo").body, { userId: "u001" });
    assert.deepEqual(byPath.get("/user/profile").body, { userId: "u002" });
    assert.equal(byPath.get("/report/list").metadata.extractor, "bundle-wrapper-url-callsite");
  }
});

async function runFixture({ name, expectedPaths, assertions }) {
  const fixtureRoot = path.join(repoRoot, "assets", "synthetic-fixtures", name);
  const outputRoot = path.join(repoRoot, "analysis-output", `synthetic-${name}`);

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

  for (const expectedPath of expectedPaths) {
    assert.ok(byPath.has(expectedPath), `${name}: expected ${expectedPath} to be extracted`);
  }
  assert.deepEqual(paths, expectedPaths, `${name}: wrapper internals should not create phantom APIs`);
  assertions(byPath);
  console.log(`${name}: ${(analysis.apis || []).length} API candidates extracted.`);
}

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
