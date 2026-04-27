#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const stagedOnly = args.has("--staged");

const forbiddenPathRules = [
  { re: /^analysis-output\//, reason: "generated analysis output" },
  { re: /^reports\//, reason: "local reports may contain target data" },
  { re: /^evidence\//, reason: "local evidence may contain target data" },
  { re: /(^|\/)[^/]+\.analysis-output\//, reason: "generated analysis output" },
  { re: /^tests\//, reason: "local tests are private in this repo; use assets/synthetic-fixtures for public fixtures" },
  { re: /^node_modules\//, reason: "dependency cache" },
  { re: /(^|\/)\.env(?:\.|$)/, reason: "environment file" },
  { re: /\.(?:wxapkg|har|pcap|pcapng)$/i, reason: "captured or packaged target artifact" },
  { re: /\.(?:zip|7z|rar|tar|tgz|gz)$/i, reason: "archive may contain target data" }
];

const allowedRoots = [
  /^SKILL\.md$/,
  /^README(?:\.en)?\.md$/,
  /^package(?:-lock)?\.json$/,
  /^\.gitignore$/,
  /^AGENTS\.md$/,
  /^agents\//,
  /^assets\//,
  /^references\//,
  /^scripts\//
];

const secretRules = [
  { re: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, reason: "private key block" },
  { re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, reason: "AWS access key id" },
  { re: /\bAKID[A-Za-z0-9]{13,40}\b/, reason: "Tencent cloud secret id" },
  { re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,255}\b|\bgithub_pat_[A-Za-z0-9_]{20,255}\b/, reason: "GitHub token" },
  { re: /\bglpat-[A-Za-z0-9_-]{20,}\b/, reason: "GitLab token" },
  { re: /\bnpm_[A-Za-z0-9]{36,}\b/, reason: "npm token" },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{20,}\b/, reason: "Slack token" },
  { re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/, reason: "Stripe key" },
  { re: /\b(?:https?|wss?|ftp|mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^/\s"'`:@]{1,120}:[^@\s"'`]{3,300}@/i, reason: "credential URL" },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, reason: "JWT-like token" }
];

const files = stagedOnly ? await indexFiles() : await publicCandidateFiles();
const problems = [];

for (const file of files) {
  const normalized = slash(file);
  for (const rule of forbiddenPathRules) {
    if (rule.re.test(normalized)) {
      problems.push(`${normalized}: forbidden path (${rule.reason})`);
    }
  }
  if (!allowedRoots.some((rule) => rule.test(normalized))) {
    problems.push(`${normalized}: outside reusable skill allowlist`);
  }

  const absolute = path.join(repoRoot, normalized);
  let stat;
  try {
    stat = await fs.stat(absolute);
  } catch {
    continue;
  }
  if (!stat.isFile()) continue;
  if (stat.size > 1_000_000) {
    problems.push(`${normalized}: file is larger than 1 MB; review before publishing`);
    continue;
  }
  const text = await fs.readFile(absolute, "utf8").catch(() => "");
  for (const rule of secretRules) {
    if (rule.re.test(text)) {
      problems.push(`${normalized}: possible secret (${rule.reason})`);
    }
  }
  for (const reason of literalSecretFindings(text)) {
    problems.push(`${normalized}: possible secret (${reason})`);
  }
}

if (problems.length > 0) {
  console.error("Public safety check failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`Public safety check passed for ${files.length} file(s).`);

async function publicCandidateFiles() {
  const files = [];
  for (const topLevel of ["SKILL.md", "README.md", "README.en.md", "package.json", "package-lock.json", ".gitignore", "AGENTS.md"]) {
    if (await exists(path.join(repoRoot, topLevel))) files.push(topLevel);
  }
  for (const root of ["agents", "assets", "references", "scripts"]) {
    await walkPublicFiles(path.join(repoRoot, root), root, files);
  }
  return [...new Set(files.map(slash))];
}

async function walkPublicFiles(absoluteDir, relativeDir, out) {
  let entries;
  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const relative = slash(path.join(relativeDir, entry.name));
    const absolute = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "analysis-output", "tests", "output"].includes(entry.name)) continue;
      await walkPublicFiles(absolute, relative, out);
    } else if (entry.isFile()) {
      out.push(relative);
    }
  }
}

async function indexFiles() {
  const indexPath = await findGitIndexPath();
  const buffer = await fs.readFile(indexPath);
  if (buffer.slice(0, 4).toString("utf8") !== "DIRC") {
    throw new Error(`Unsupported git index at ${indexPath}`);
  }
  const version = buffer.readUInt32BE(4);
  if (version >= 4) {
    throw new Error(`Unsupported git index version ${version}; run the worktree safety check instead`);
  }
  const count = buffer.readUInt32BE(8);
  const files = [];
  let offset = 12;
  for (let i = 0; i < count; i += 1) {
    const entryStart = offset;
    const flags = buffer.readUInt16BE(entryStart + 60);
    offset = entryStart + 62;
    if (flags & 0x4000) offset += 2;
    let pathEnd = offset;
    while (pathEnd < buffer.length && buffer[pathEnd] !== 0) pathEnd += 1;
    files.push(buffer.slice(offset, pathEnd).toString("utf8"));
    offset = pathEnd + 1;
    while ((offset - entryStart) % 8 !== 0) offset += 1;
  }
  return [...new Set(files.map(slash))];
}

async function findGitIndexPath() {
  const dotGit = path.join(repoRoot, ".git");
  const stat = await fs.stat(dotGit);
  if (stat.isDirectory()) return path.join(dotGit, "index");
  const text = await fs.readFile(dotGit, "utf8");
  const match = /^gitdir:\s*(.+)$/i.exec(text.trim());
  if (!match) throw new Error("Unable to resolve .git directory");
  return path.resolve(repoRoot, match[1], "index");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function literalSecretFindings(text) {
  const findings = [];
  const re = /\b(password|passwd|pwd|secret|token|authorization|api[_-]?key|apikey|access[_-]?key|secret[_-]?key)\b\s*[:=]\s*["']([^"']{8,})["']/gi;
  for (const match of text.matchAll(re)) {
    const key = match[1];
    const value = match[2].trim();
    if (!looksLikePublishedSecretValue(value)) continue;
    findings.push(`literal ${key} assignment`);
  }
  return findings;
}

function looksLikePublishedSecretValue(value) {
  const text = String(value || "").trim();
  if (!text || /[{}]/.test(text)) return false;
  if (/^(?:bearer\s+)?(?:token|secret|password|passwd|pwd|example|sample|dummy|mock|fake|test|changeme|replace|your[_-]?)/i.test(text)) return false;
  if (/example\.test|example\.com|localhost|127\.0\.0\.1/i.test(text)) return false;
  if (text.length >= 32 && /^[A-Za-z0-9_./+=:-]+$/.test(text)) return true;
  if (text.length >= 20 && /[A-Z]/.test(text) && /[a-z]/.test(text) && /\d/.test(text) && /^[A-Za-z0-9_./+=:-]+$/.test(text)) return true;
  return false;
}
