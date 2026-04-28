#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await runFixture({
  name: "mini-program-wrapper",
  expectedApiValues: ["/api/coupon/list", "/api/member/profile", "/api/order/list"],
  assertions: (leads) => {
    assert.ok(hasRequestKind(leads, "wx.request"), "mini-program-wrapper: should flag wx.request");
    assert.ok(hasApiWithBodyKey(leads, "/api/coupon/list", "memberId"), "mini-program-wrapper: should preserve nearby request body keys");
  }
});

await runFixture({
  name: "api-literal-fallback",
  expectedApiValues: ["/api/wallet/balance", "/webapi/coupon/detail"],
  assertions: (leads) => {
    assert.ok(hasSensitiveKey(leads, "appSecret"), "api-literal-fallback: should flag appSecret");
    assert.ok(hasSensitiveKey(leads, "defaultPassword"), "api-literal-fallback: should flag defaultPassword");
    assert.ok(hasAccountKey(leads, "defaultAccount"), "api-literal-fallback: should flag defaultAccount");
    assert.ok(hasAccountKey(leads, "tenantId"), "api-literal-fallback: should flag tenantId");
  }
});

await runFixture({
  name: "webpack-object-wrapper",
  expectedApiValues: [
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
  assertions: (leads) => {
    assert.ok(hasRequestKind(leads, "$ajaxRequest"), "webpack-object-wrapper: should flag this.$ajaxRequest");
    assert.ok(hasApiWithBodyKey(leads, "/auth/getUserInfo", "userId"), "webpack-object-wrapper: should keep wrapper call body keys");
    assert.ok(hasApiWithBodyKey(leads, "/report/list", "pageNo"), "webpack-object-wrapper: should keep ajax body keys");
  }
});

async function runFixture({ name, expectedApiValues, assertions }) {
  const fixtureRoot = path.join(repoRoot, "assets", "synthetic-fixtures", name);
  const outputRoot = path.join(repoRoot, "analysis-output", `codex-leads-${name}`);

  await fs.rm(outputRoot, { recursive: true, force: true });
  await run(process.execPath, [
    path.join(repoRoot, "scripts", "codex-js-leads.mjs"),
    fixtureRoot,
    "--out",
    outputRoot,
    "--max-files",
    "100",
    "--max-bytes",
    "200000",
    "--json-only"
  ]);

  const leads = JSON.parse(await fs.readFile(path.join(outputRoot, "codex-js-leads.json"), "utf8"));
  const apiValues = new Set((leads.leads.apis || []).map((api) => api.value));
  for (const expected of expectedApiValues) {
    assert.ok(apiValues.has(expected), `${name}: expected API lead ${expected}`);
  }
  assert.ok((leads.evidence || []).length > 0, `${name}: should emit evidence records`);
  assert.ok(!(await exists(path.join(outputRoot, "codex-js-leads.md"))), `${name}: json-only mode should not emit Markdown lead index`);
  assertions(leads);
  await run(process.execPath, [
    path.join(repoRoot, "scripts", "validate-outputs.mjs"),
    outputRoot,
    "--json-only"
  ]);
  console.log(`${name}: ${expectedApiValues.length} expected API leads verified; counts=${JSON.stringify(leads.leadCounts)}`);
}

function hasRequestKind(leads, kind) {
  return (leads.leads.requestCalls || []).some((lead) => lead.value === kind);
}

function hasSensitiveKey(leads, key) {
  return (leads.leads.sensitiveConfigs || []).some((lead) => lead.key === key);
}

function hasAccountKey(leads, key) {
  return (leads.leads.accounts || []).some((lead) => lead.key === key);
}

function hasApiWithBodyKey(leads, value, bodyKey) {
  return (leads.leads.apis || []).some((lead) => lead.value === value && (lead.bodyKeys || []).includes(bodyKey));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
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
