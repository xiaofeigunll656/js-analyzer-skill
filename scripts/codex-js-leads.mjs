#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const VERSION = "2.0.0";
const DEFAULT_OUT = "analysis-output/codex-js-leads";
const DEFAULT_MAX_FILES = 4000;
const DEFAULT_MAX_BYTES = 3_000_000;

const TEXT_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue",
  ".json", ".wxml", ".wxss", ".wxs", ".html", ".htm", ".css",
  ".map", ".txt", ".md", ".env", ".config"
]);

const SKIP_DIRS = new Set([
  ".git", ".svn", ".hg", "node_modules", ".pnpm", ".yarn",
  ".cache", ".next", ".nuxt", "coverage", "dist", "build"
]);

const REQUEST_RE = /\b(?:wx|uni|Taro)\.request\b|axios(?:\.[a-z]+)?\s*\(|fetch\s*\(|XMLHttpRequest|\$ajaxRequest|\$request|\$http|request\s*\(/i;
const API_PATH_RE = /(["'`])((?:\/(?:api|webapi|auth|authStaff|file|logout|pageHits|report|user|staff|resource|role|permission|upload|download|order|member|coupon|wallet|admin|login|oauth|pay|sms|captcha|graphql)\b[^\s"'`<>{}]*)|(?:https?:\/\/[^"'`\s<>{}]+(?:\/(?:api|webapi|auth|file|report|user|order|member|admin)[^"'`\s<>{}]*)?))\1/g;
const URL_RE = /\b(?:https?:\/\/|wss?:\/\/|ws:\/\/|\/\/)[^\s"'`<>)\\]+/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?86[- ]?)?\b1[3-9]\d{9}\b/g;
const SOURCE_PATH_RE = /(?:[A-Za-z]:\\(?:Users|workspace|work|jenkins|build)\\[^"'`\s]+|\/(?:Users|home|workspace|var\/lib\/jenkins|builds)\/[^"'`\s]+)/g;
const CRYPTO_RE = /\b(?:CryptoJS|createHmac|createHash|JSEncrypt|encrypt|decrypt|signature|sign|nonce|timestamp|md5|sha1|sha256|sha512|HmacSHA|AES|DES|RSA|SM2|SM3|SM4|sm2|sm3|sm4)\b/;
const OPS_RE = /\b(?:nacos|apollo|consul|eureka|swagger|knife4j|yapi|apifox|jenkins|gitlab|github|gitee|harbor|sonarqube|sentry|bugly|firebase|oss|cos|s3|minio|redis|mongodb|mysql|postgres|webhook)\b/i;
const SENSITIVE_KEY_RE = /(?:password|passwd|pwd|passphrase|secret|token|authorization|auth|bearer|cookie|session|jwt|credential|private[_-]?key|client[_-]?secret|app[_-]?secret|api[_-]?key|apikey|access[_-]?key|secret[_-]?key|ak|sk|secretid|secretkey|security[_-]?token|signature|signing[_-]?key|webhook|dsn|connection[_-]?string|jdbc|mongo(?:db)?[_-]?uri|redis[_-]?url|database[_-]?url|smtp|mch[_-]?key|pay[_-]?key|api[_-]?v3[_-]?key|merchant[_-]?key|github[_-]?token|gitlab[_-]?token|npm[_-]?token|sonar[_-]?token|sentry[_-]?auth[_-]?token|openai[_-]?api[_-]?key|anthropic[_-]?api[_-]?key|gemini[_-]?api[_-]?key|huggingface[_-]?token|hf[_-]?token)/i;
const ACCOUNT_KEY_RE = /(?:account|username|user[_-]?name|login[_-]?name|phone|mobile|email|password|passwd|pwd|tenant[_-]?id|org[_-]?id|appid|app[_-]?id)/i;
const ASSIGN_RE = /(?:^|[,{;\s])(["']?)([A-Za-z_$][\w$.-]{1,80})\1\s*[:=]\s*(["'`])([^"'`]{1,500})\3/g;

function usage() {
  console.error(`Usage: node scripts/codex-js-leads.mjs <target-project> [--out <dir>] [--max-files <n>] [--max-bytes <n>] [--json-only]`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) usage();
  const options = {
    target: "",
    out: DEFAULT_OUT,
    maxFiles: DEFAULT_MAX_FILES,
    maxBytes: DEFAULT_MAX_BYTES,
    jsonOnly: false
  };
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    if (arg === "--json-only") {
      options.jsonOnly = true;
      continue;
    }
    const key = arg.slice(2);
    const value = args[i + 1];
    if (!value || value.startsWith("--")) usage();
    i += 1;
    if (key === "out") options.out = value;
    else if (key === "max-files") options.maxFiles = Number(value);
    else if (key === "max-bytes") options.maxBytes = Number(value);
    else usage();
  }
  options.target = positionals[0];
  if (!options.target) usage();
  return options;
}

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function evidenceId(file, line, category, value) {
  return `ev_${crypto.createHash("sha1").update(`${file}:${line}:${category}:${value}`).digest("hex").slice(0, 12)}`;
}

function leadId(category, value, file, line) {
  return `${category}_${crypto.createHash("sha1").update(`${value}:${file}:${line}`).digest("hex").slice(0, 12)}`;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function scanFiles(root, maxFiles) {
  const files = [];
  async function walk(dir) {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      const stat = await fs.stat(full).catch(() => null);
      if (!stat) continue;
      files.push({
        abs: full,
        path: slash(path.relative(root, full)),
        ext,
        size: stat.size,
        kind: classifyFile(full)
      });
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function classifyFile(filePath) {
  const base = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  if (base === "package.json") return "package-manifest";
  if (["app.json", "project.config.json", "ext.json", "sitemap.json"].includes(base)) return "mini-program-manifest";
  if (ext === ".map") return "source-map";
  if (/\.min\.js$|bundle|chunk|app-service\.js/i.test(filePath)) return "bundle";
  if ([".vue", ".wxml", ".wxss", ".wxs"].includes(ext)) return "page-or-component";
  if ([".json", ".env", ".config"].includes(ext)) return "config";
  return "source";
}

async function readText(file, maxBytes) {
  if (file.size > maxBytes) {
    const buffer = await fs.readFile(file.abs);
    return buffer.subarray(0, maxBytes).toString("utf8");
  }
  return fs.readFile(file.abs, "utf8");
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function lineAt(lines, line) {
  return String(lines[line - 1] || "").trim().slice(0, 260);
}

function addEvidence(state, file, line, category, value, snippet) {
  const id = evidenceId(file, line, category, value);
  if (!state.evidenceById.has(id)) {
    state.evidenceById.set(id, { id, file, line, category, value, snippet });
  }
  return id;
}

function addLead(state, category, lead) {
  const normalized = `${category}:${lead.value || lead.key || ""}:${lead.file}:${lead.line}`;
  if (state.dedupe.has(normalized)) return;
  state.dedupe.add(normalized);
  state.leads[category].push({
    id: leadId(category, lead.value || lead.key || "", lead.file, lead.line),
    ...lead
  });
}

function inferMethod(text, index) {
  const near = text.slice(Math.max(0, index - 220), Math.min(text.length, index + 420));
  const methodMatch = /\bmethod\s*:\s*["'`](GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)["'`]/i.exec(near);
  if (methodMatch) return methodMatch[1].toUpperCase();
  const wrapperMatch = /\b(?:post|put|delete|patch|get)\s*\(/i.exec(near);
  if (wrapperMatch) return wrapperMatch[0].replace(/\W/g, "").toUpperCase();
  if (/axios\.post|apiPost|post[A-Z_]/.test(near)) return "POST";
  if (/axios\.get|apiGet|get[A-Z_]/.test(near)) return "GET";
  return "UNKNOWN";
}

function extractObjectKeysAfter(text, index) {
  const window = text.slice(index, Math.min(text.length, index + 900));
  const brace = window.indexOf("{");
  if (brace < 0 || brace > 180) return [];
  let depth = 0;
  let end = -1;
  for (let i = brace; i < window.length; i += 1) {
    const ch = window[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return [];
  const objectText = window.slice(brace, end + 1);
  const keys = [];
  const re = /(?:^|[,{]\s*)(["']?)([A-Za-z_$][\w$-]{0,80})\1\s*:/g;
  for (const match of objectText.matchAll(re)) {
    const key = match[2];
    if (!keys.includes(key)) keys.push(key);
    if (keys.length >= 30) break;
  }
  return keys;
}

function confidenceForSensitiveKey(key, value) {
  if (/password|passwd|pwd|secret|private|token|authorization|api[_-]?key|apikey|access[_-]?key|secret[_-]?key|jwt/i.test(key)) return 0.95;
  if (/appid|tenant|org|account|username|email|phone|mobile/i.test(key)) return 0.8;
  if (/AKIA|ASIA|glpat-|ghp_|github_pat_|eyJ[A-Za-z0-9_-]+\./.test(value)) return 0.98;
  return 0.65;
}

function kindForSensitiveKey(key) {
  if (/password|passwd|pwd|passphrase/i.test(key)) return "password";
  if (/token|authorization|jwt|bearer|session|cookie/i.test(key)) return "token";
  if (/secret|private|api[_-]?key|apikey|access[_-]?key|ak|sk|signature|signing/i.test(key)) return "secret_or_key";
  if (/appid|app[_-]?id/i.test(key)) return "app_id";
  if (/tenant|org/i.test(key)) return "tenant_or_org";
  return "sensitive_config";
}

function collectSourceMapVirtualFiles(file, text) {
  if (file.ext !== ".map") return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.sourcesContent)) return [];
    return parsed.sourcesContent.map((content, index) => ({
      file: `${file.path}::${parsed.sources?.[index] || `source-${index}`}`,
      text: String(content || "")
    })).filter((item) => item.text.trim());
  } catch {
    return [];
  }
}

function collectFromText(state, file, text) {
  const lines = text.split(/\r?\n/);
  const sourceFile = typeof file === "string" ? file : file.path;

  for (const match of text.matchAll(API_PATH_RE)) {
    const value = match[2];
    const line = lineNumberAt(text, match.index);
    const snippet = lineAt(lines, line);
    const evidenceId = addEvidence(state, sourceFile, line, "api", value, snippet);
    addLead(state, "apis", {
      value,
      method: inferMethod(text, match.index),
      bodyKeys: extractObjectKeysAfter(text, match.index + match[0].length),
      file: sourceFile,
      line,
      snippet,
      confidence: value.startsWith("http") ? 0.86 : 0.78,
      reason: "Backend-looking path or URL literal. Codex should trace the surrounding wrapper/call site.",
      evidenceIds: [evidenceId]
    });
  }

  lines.forEach((lineText, index) => {
    const line = index + 1;
    if (REQUEST_RE.test(lineText)) {
      const snippet = lineText.trim().slice(0, 260);
      const evidenceId = addEvidence(state, sourceFile, line, "request-call", "request", snippet);
      addLead(state, "requestCalls", {
        value: detectRequestKind(lineText),
        file: sourceFile,
        line,
        snippet,
        confidence: 0.82,
        reason: "Request primitive or likely request wrapper call. Codex should inspect wrapper behavior and interceptors.",
        evidenceIds: [evidenceId]
      });
    }
    if (CRYPTO_RE.test(lineText)) {
      const snippet = lineText.trim().slice(0, 260);
      const evidenceId = addEvidence(state, sourceFile, line, "crypto", "crypto-or-signature", snippet);
      addLead(state, "crypto", {
        value: firstMatch(lineText, CRYPTO_RE) || "crypto-or-signature",
        file: sourceFile,
        line,
        snippet,
        confidence: 0.74,
        reason: "Crypto/signature term near code. Codex should determine whether it affects API requests.",
        evidenceIds: [evidenceId]
      });
    }
    if (OPS_RE.test(lineText)) {
      const snippet = lineText.trim().slice(0, 260);
      const evidenceId = addEvidence(state, sourceFile, line, "operations", "ops-signal", snippet);
      addLead(state, "operations", {
        value: firstMatch(lineText, OPS_RE) || "ops-signal",
        file: sourceFile,
        line,
        snippet,
        confidence: 0.7,
        reason: "Operations, API-doc, repository, monitoring, storage, or service-discovery signal.",
        evidenceIds: [evidenceId]
      });
    }
  });

  for (const match of text.matchAll(URL_RE)) {
    const value = cleanUrl(match[0]);
    const line = lineNumberAt(text, match.index);
    const snippet = lineAt(lines, line);
    const category = /swagger|knife4j|yapi|apifox/i.test(value)
      ? "apiDocs"
      : /gitlab|github|gitee/i.test(value)
        ? "repositories"
        : "domains";
    const evidenceId = addEvidence(state, sourceFile, line, category, value, snippet);
    addLead(state, category, {
      value,
      file: sourceFile,
      line,
      snippet,
      confidence: 0.9,
      reason: "URL literal. Codex should classify whether this is API base, asset, docs, repo, monitoring, or test data.",
      evidenceIds: [evidenceId]
    });
  }

  for (const match of text.matchAll(ASSIGN_RE)) {
    const key = match[2];
    const value = match[4];
    if (!SENSITIVE_KEY_RE.test(key) && !ACCOUNT_KEY_RE.test(key)) continue;
    const line = lineNumberAt(text, match.index);
    const snippet = lineAt(lines, line);
    const category = SENSITIVE_KEY_RE.test(key) ? "sensitiveConfigs" : "accounts";
    const evidenceId = addEvidence(state, sourceFile, line, category, `${key}=${value}`, snippet);
    addLead(state, category, {
      key,
      value,
      kind: category === "sensitiveConfigs" ? kindForSensitiveKey(key) : "account_or_identity",
      file: sourceFile,
      line,
      snippet,
      confidence: confidenceForSensitiveKey(key, value),
      reason: category === "sensitiveConfigs"
        ? "Sensitive-looking key/value assignment. Codex should review whether it is real, default, mock, or build-time config."
        : "Account, identity, appid, tenant, or organization hint.",
      evidenceIds: [evidenceId]
    });
  }

  for (const match of text.matchAll(EMAIL_RE)) {
    const line = lineNumberAt(text, match.index);
    const snippet = lineAt(lines, line);
    const evidenceId = addEvidence(state, sourceFile, line, "developer", match[0], snippet);
    addLead(state, "developerSignals", {
      value: match[0],
      file: sourceFile,
      line,
      snippet,
      confidence: 0.78,
      reason: "Email address. Codex should decide whether it is developer, support, account, or fixture data.",
      evidenceIds: [evidenceId]
    });
  }

  for (const match of text.matchAll(PHONE_RE)) {
    const line = lineNumberAt(text, match.index);
    const snippet = lineAt(lines, line);
    const evidenceId = addEvidence(state, sourceFile, line, "account", match[0], snippet);
    addLead(state, "accounts", {
      value: match[0],
      kind: "phone_or_mobile",
      file: sourceFile,
      line,
      snippet,
      confidence: 0.72,
      reason: "Phone-like value. Codex should determine whether it is account, support, or sample data.",
      evidenceIds: [evidenceId]
    });
  }

  for (const match of text.matchAll(SOURCE_PATH_RE)) {
    const line = lineNumberAt(text, match.index);
    const snippet = lineAt(lines, line);
    const evidenceId = addEvidence(state, sourceFile, line, "developer", match[0], snippet);
    addLead(state, "developerSignals", {
      value: match[0],
      kind: "source_path",
      file: sourceFile,
      line,
      snippet,
      confidence: 0.76,
      reason: "Local build/source path. Codex should use it for source-map and build-owner context.",
      evidenceIds: [evidenceId]
    });
  }

  const sourceMapRe = /sourceMappingURL=([^\s"'`<>)]{1,500})/g;
  for (const match of text.matchAll(sourceMapRe)) {
    const value = match[1];
    const line = lineNumberAt(text, match.index);
    const snippet = lineAt(lines, line);
    const evidenceId = addEvidence(state, sourceFile, line, "source-map", value, snippet);
    addLead(state, "sourceMaps", {
      value,
      file: sourceFile,
      line,
      snippet,
      confidence: 0.92,
      reason: "Source map comment. Codex should inspect local map or ask before downloading remote maps.",
      evidenceIds: [evidenceId]
    });
  }

  const chunkRe = /(?:__webpack_require__\.u|webpackChunk|import\s*\(|["'`][^"'`]*\.(?:chunk\.)?js["'`])/g;
  for (const match of text.matchAll(chunkRe)) {
    const line = lineNumberAt(text, match.index);
    const snippet = lineAt(lines, line);
    const evidenceId = addEvidence(state, sourceFile, line, "chunk", match[0], snippet);
    addLead(state, "chunks", {
      value: match[0],
      file: sourceFile,
      line,
      snippet,
      confidence: 0.7,
      reason: "Bundle/chunk-loading signal. Codex should inspect route chunks and missing lazy assets.",
      evidenceIds: [evidenceId]
    });
  }
}

function detectRequestKind(text) {
  if (/\bwx\.request\b/.test(text)) return "wx.request";
  if (/\buni\.request\b/.test(text)) return "uni.request";
  if (/\bTaro\.request\b/.test(text)) return "Taro.request";
  if (/axios/.test(text)) return "axios";
  if (/fetch\s*\(/.test(text)) return "fetch";
  if (/XMLHttpRequest/.test(text)) return "XMLHttpRequest";
  if (/\$ajaxRequest/.test(text)) return "$ajaxRequest";
  if (/\$request/.test(text)) return "$request";
  if (/\$http/.test(text)) return "$http";
  return "request-wrapper";
}

function firstMatch(text, re) {
  const match = text.match(re);
  return match ? match[0] : "";
}

function cleanUrl(value) {
  return String(value || "").replace(/[),.;\]]+$/, "");
}

function emptyState() {
  return {
    dedupe: new Set(),
    evidenceById: new Map(),
    leads: {
      apis: [],
      requestCalls: [],
      sensitiveConfigs: [],
      accounts: [],
      domains: [],
      apiDocs: [],
      repositories: [],
      operations: [],
      crypto: [],
      sourceMaps: [],
      chunks: [],
      developerSignals: []
    }
  };
}

function summarizeProject(files) {
  const hasPackage = files.some((file) => file.path.endsWith("package.json"));
  const hasMiniProgram = files.some((file) => /(^|\/)(app|project\.config|ext)\.json$/.test(file.path)) ||
    files.some((file) => [".wxml", ".wxss", ".wxs"].includes(file.ext));
  const hasBundle = files.some((file) => file.kind === "bundle");
  const hasSourceMap = files.some((file) => file.ext === ".map");
  const typeHints = [];
  if (hasPackage) typeHints.push("source-js-or-web-project");
  if (hasMiniProgram) typeHints.push("wechat-mini-program");
  if (hasBundle) typeHints.push("bundle-or-unpacked-app");
  if (hasSourceMap) typeHints.push("source-map-available");
  return {
    typeHints,
    counts: {
      files: files.length,
      source: files.filter((file) => file.kind === "source").length,
      bundles: files.filter((file) => file.kind === "bundle").length,
      configs: files.filter((file) => file.kind === "config").length,
      sourceMaps: files.filter((file) => file.kind === "source-map").length,
      miniProgramManifests: files.filter((file) => file.kind === "mini-program-manifest").length
    },
    highValueFiles: files
      .filter((file) => ["package-manifest", "mini-program-manifest", "bundle", "source-map", "config"].includes(file.kind))
      .slice(0, 80)
      .map((file) => ({ path: file.path, kind: file.kind, size: file.size }))
  };
}

function compactLeadCounts(leads) {
  return Object.fromEntries(Object.entries(leads).map(([key, value]) => [key, value.length]));
}

function topItems(items, limit = 80) {
  return [...items]
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || String(a.file).localeCompare(String(b.file)))
    .slice(0, limit);
}

function renderMarkdown(result) {
  const lines = [];
  lines.push("# Codex JS Leads");
  lines.push("");
  lines.push("> This is not the final analysis report. It is a compact evidence index for Codex to read, verify, and reason from.");
  lines.push("");
  lines.push(`- Target: \`${slash(result.targetRoot)}\``);
  lines.push(`- Generated: ${result.generatedAt}`);
  lines.push(`- Files scanned: ${result.project.counts.files}`);
  lines.push(`- Type hints: ${result.project.typeHints.join(", ") || "unknown"}`);
  lines.push("");
  lines.push("## Lead Counts");
  lines.push("");
  lines.push("| Category | Count |");
  lines.push("| --- | ---: |");
  for (const [category, count] of Object.entries(result.leadCounts)) {
    lines.push(`| ${category} | ${count} |`);
  }
  lines.push("");

  appendLeadTable(lines, "API And Route-Like Paths", result.leads.apis, ["method", "bodyKeys"]);
  appendLeadTable(lines, "Request Calls And Wrappers", result.leads.requestCalls);
  appendLeadTable(lines, "Sensitive Configs", result.leads.sensitiveConfigs, ["key", "kind"]);
  appendLeadTable(lines, "Accounts And Identity Hints", result.leads.accounts, ["key", "kind"]);
  appendLeadTable(lines, "Domains And URLs", result.leads.domains);
  appendLeadTable(lines, "API Docs", result.leads.apiDocs);
  appendLeadTable(lines, "Repositories", result.leads.repositories);
  appendLeadTable(lines, "Operations Signals", result.leads.operations);
  appendLeadTable(lines, "Crypto And Signature Leads", result.leads.crypto);
  appendLeadTable(lines, "Source Maps", result.leads.sourceMaps);
  appendLeadTable(lines, "Chunks", result.leads.chunks);
  appendLeadTable(lines, "Developer Signals", result.leads.developerSignals);

  lines.push("## Codex Review Checklist");
  lines.push("");
  for (const item of result.codexReviewChecklist) lines.push(`- ${item}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function appendLeadTable(lines, title, leads, extra = []) {
  if (!leads.length) return;
  lines.push(`## ${title}`);
  lines.push("");
  lines.push("| Value | File | Line | Confidence | Why Codex should care |");
  lines.push("| --- | --- | ---: | ---: | --- |");
  for (const lead of topItems(leads, 60)) {
    const value = extra.length
      ? `${lead.value || lead.key || ""}${extraInfo(lead, extra)}`
      : `${lead.value || lead.key || ""}`;
    lines.push(`| ${escapeCell(value)} | \`${escapeCell(lead.file)}\` | ${lead.line || ""} | ${lead.confidence ?? ""} | ${escapeCell(lead.reason || "")} |`);
  }
  lines.push("");
}

function extraInfo(lead, keys) {
  const parts = [];
  for (const key of keys) {
    if (lead[key] === undefined || lead[key] === "" || (Array.isArray(lead[key]) && lead[key].length === 0)) continue;
    parts.push(`${key}: ${Array.isArray(lead[key]) ? lead[key].join(",") : lead[key]}`);
  }
  return parts.length ? ` (${parts.join("; ")})` : "";
}

function escapeCell(value) {
  return String(value || "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .slice(0, 220);
}

function buildChecklist(result) {
  const checklist = [
    "Start from request wrappers and interceptors before writing the API list.",
    "For every API path lead, inspect surrounding call-site objects to recover query/body/header fields.",
    "Treat sensitive config leads as evidence requiring review, not as automatically exploitable facts.",
    "Separate observed traffic, static source inference, mock data, and uncertainty in the final report."
  ];
  if (result.leads.sourceMaps.length) checklist.push("Inspect local source maps and sourcesContent as virtual source files.");
  if (result.leads.chunks.length) checklist.push("Check lazy chunk/runtime leads for missing route modules.");
  if (result.leads.sensitiveConfigs.length) checklist.push("Review sensitive config, account, token, appid, tenant, and key leads early.");
  if (!result.leads.apis.length) checklist.push("No API path leads were found by the scanner; Codex must manually inspect request wrappers and dynamic URL construction.");
  return checklist;
}

async function main() {
  const options = parseArgs(process.argv);
  const targetRoot = path.resolve(options.target);
  if (!(await exists(targetRoot))) throw new Error(`Target does not exist: ${targetRoot}`);
  const outputRoot = path.resolve(options.out);
  await fs.mkdir(outputRoot, { recursive: true });

  const files = await scanFiles(targetRoot, options.maxFiles);
  const state = emptyState();
  for (const file of files) {
    let text;
    try {
      text = await readText(file, options.maxBytes);
    } catch {
      continue;
    }
    collectFromText(state, file, text);
    for (const virtualFile of collectSourceMapVirtualFiles(file, text)) {
      collectFromText(state, virtualFile.file, virtualFile.text);
    }
  }

  const result = {
    schemaVersion: `codex-js-leads/${VERSION}`,
    generatedAt: new Date().toISOString(),
    targetRoot,
    purpose: "Codex-only evidence index. Use these leads to guide direct source review; do not treat them as final analysis.",
    project: summarizeProject(files),
    files: files.map(({ abs, ...rest }) => rest),
    leads: state.leads,
    leadCounts: compactLeadCounts(state.leads),
    evidence: [...state.evidenceById.values()],
    codexReviewChecklist: []
  };
  result.codexReviewChecklist = buildChecklist(result);

  const jsonPath = path.join(outputRoot, "codex-js-leads.json");
  const mdPath = path.join(outputRoot, "codex-js-leads.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  if (!options.jsonOnly) await fs.writeFile(mdPath, renderMarkdown(result), "utf8");

  console.log(JSON.stringify({
    ok: true,
    targetRoot,
    outputRoot,
    json: jsonPath,
    markdown: options.jsonOnly ? null : mdPath,
    leadCounts: result.leadCounts
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
