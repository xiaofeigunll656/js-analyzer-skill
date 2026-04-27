#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const SCHEMA_VERSION = "1.0.0";
const STATE_VERSION = "1.0.0";
const DEFAULT_OUT = "analysis-output";
const DEFAULT_MAX_FILES_PER_TASK = 50;
const DEFAULT_MAX_BYTES_PER_TASK = 2_000_000;
const DEFAULT_MAX_FILE_READ_BYTES = 8_000_000;
const DEFAULT_LOCAL_SCAN_MAX_DEPTH = 6;
const DEFAULT_LOCAL_SCAN_MAX_ENTRIES = 5000;
const DEFAULT_LOCAL_SCAN_MAX_MS = 2500;
const CALL_GRAPH_LIMIT = 3000;
const TASK_STATUSES = new Set(["pending", "in_progress", "completed", "blocked", "failed", "skipped"]);

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".json",
  ".wxml",
  ".wxss",
  ".wxs",
  ".html",
  ".htm",
  ".css",
  ".map",
  ".txt",
  ".env",
  ".config"
]);

const SKIP_DIRS = new Set([
  ".git",
  ".svn",
  ".hg",
  "node_modules",
  ".pnpm",
  ".yarn",
  ".cache",
  ".next",
  ".nuxt",
  "coverage"
]);

const URL_RE = /\b(?:https?:\/\/|wss?:\/\/|ws:\/\/|\/\/)[^\s"'`<>)\\]+/gi;
const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?::\d{2,5})?(?:\/[^\s"'`<>)\\]*)?/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?86[- ]?)?\b1[3-9]\d{9}\b/g;
const SOURCE_PATH_RE = /(?:[A-Za-z]:\\(?:Users|workspace|work|jenkins|build)\\[^"'`\s]+|\/(?:Users|home|workspace|var\/lib\/jenkins|builds)\/[^"'`\s]+)/g;
const SENSITIVE_KEY_RE = /(?:password|passwd|pwd|passphrase|passcode|secret|token|authorization|auth|bearer|cookie|session|jwt|credential|private[_-]?key|client[_-]?secret|app[_-]?secret|api[_-]?key|apikey|x[_-]?api[_-]?key|access[_-]?key|secret[_-]?key|access[_-]?key[_-]?id|access[_-]?key[_-]?secret|ak|sk|secretid|secretkey|security[_-]?token|signature|signing[_-]?key|webhook|dsn|connection[_-]?string|connstr|jdbc|mongo(?:db)?[_-]?uri|redis[_-]?url|database[_-]?url|db[_-]?(?:user|username|password|passwd|pwd)|smtp[_-]?(?:user|username|password|passwd|pwd)|mail[_-]?password|mch[_-]?key|pay[_-]?key|api[_-]?v3[_-]?key|merchant[_-]?key|alipay[_-]?private[_-]?key|wechat[_-]?pay[_-]?key|github[_-]?token|gitlab[_-]?token|npm[_-]?token|sonar[_-]?token|sentry[_-]?auth[_-]?token|openai[_-]?api[_-]?key|anthropic[_-]?api[_-]?key|gemini[_-]?api[_-]?key|cohere[_-]?api[_-]?key|huggingface[_-]?token|hf[_-]?token|pinecone[_-]?api[_-]?key|langchain[_-]?api[_-]?key|account|username|user[_-]?name|phone|mobile|email|appid|app[_-]?id|tenant[_-]?id|org[_-]?id|bucket|region)/i;
const ACCOUNT_KEY_RE = /(?:account|username|user[_-]?name|login[_-]?name|phone|mobile|email|password|passwd|pwd|passphrase|passcode)/i;
const CREDENTIAL_VALUE_KEY_RE = /(?:password|passwd|pwd|passphrase|passcode|secret|token|authorization|auth|bearer|cookie|session|jwt|credential|private[_-]?key|client[_-]?secret|app[_-]?secret|api[_-]?key|apikey|x[_-]?api[_-]?key|access[_-]?key|secret[_-]?key|access[_-]?key[_-]?id|access[_-]?key[_-]?secret|ak|sk|secretid|secretkey|security[_-]?token|signature|signing[_-]?key|webhook|dsn|connection[_-]?string|connstr|jdbc|mongo(?:db)?[_-]?uri|redis[_-]?url|database[_-]?url|db[_-]?(?:user|username|password|passwd|pwd)|smtp[_-]?(?:user|username|password|passwd|pwd)|mail[_-]?password|mch[_-]?key|pay[_-]?key|api[_-]?v3[_-]?key|merchant[_-]?key|alipay[_-]?private[_-]?key|wechat[_-]?pay[_-]?key|github[_-]?token|gitlab[_-]?token|npm[_-]?token|sonar[_-]?token|sentry[_-]?auth[_-]?token|openai[_-]?api[_-]?key|anthropic[_-]?api[_-]?key|gemini[_-]?api[_-]?key|cohere[_-]?api[_-]?key|huggingface[_-]?token|hf[_-]?token|pinecone[_-]?api[_-]?key|langchain[_-]?api[_-]?key)/i;

function usage(exitCode = 0) {
  const text = `
JS Analyzer Skill CLI

Usage:
  node scripts/js-analyzer.mjs analyze <target-project> --out <output-dir>
  node scripts/js-analyzer.mjs resume --out <output-dir>
  node scripts/js-analyzer.mjs status --out <output-dir>
  node scripts/js-analyzer.mjs discover-chunks --out <output-dir>
  node scripts/js-analyzer.mjs download-chunks --out <output-dir> [--base-url <url>]
  node scripts/js-analyzer.mjs discover-sourcemaps --out <output-dir>
  node scripts/js-analyzer.mjs download-sourcemaps --out <output-dir> [--base-url <url>]
  node scripts/js-analyzer.mjs discover-supplements --out <output-dir>
  node scripts/js-analyzer.mjs download-supplements --out <output-dir> [--yes]
  node scripts/js-analyzer.mjs render --ir <output-dir>/analysis.json --out <output-dir>

Options:
  --profile auto
  --with-deobfuscation
  --redact-secrets
  --max-files-per-task <n>
  --max-bytes-per-task <n>
  --max-download-bytes <n>
  --local-cache-root <dir>[,<dir>]
  --local-scan-max-depth <n>
  --local-scan-max-entries <n>
  --local-scan-max-ms <n>
  --force-rebuild-task <task-id>
  --yes
`;
  console.log(text.trim());
  process.exit(exitCode);
}

function parseCli(argv) {
  const command = argv[2];
  if (!command || command === "-h" || command === "--help") usage(0);

  const positionals = [];
  const options = {};
  for (let i = 3; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const raw = token.slice(2);
    if (raw.includes("=")) {
      const [key, ...valueParts] = raw.split("=");
      options[toCamel(key)] = valueParts.join("=");
      continue;
    }

    const key = toCamel(raw);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      i += 1;
    }
  }

  return { command, positionals, options };
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeSlash(value) {
  return value.replace(/\\/g, "/");
}

function stableId(prefix, value) {
  const digest = crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 12);
  return `${prefix}_${digest}`;
}

function safeName(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== null) return fallback;
    throw new Error(`Failed to read JSON ${filePath}: ${error.message}`);
  }
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

async function writeText(filePath, text) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, text, "utf8");
}

async function appendJsonLine(filePath, event) {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify({ ts: nowIso(), ...event })}\n`, "utf8");
}

function pathsFor(outDir) {
  const out = path.resolve(outDir || DEFAULT_OUT);
  const state = path.join(out, "analysis-state");
  return {
    out,
    state,
    plan: path.join(state, "plan.json"),
    progress: path.join(state, "progress.jsonl"),
    summary: path.join(state, "run-summary.md"),
    checkpoints: path.join(state, "checkpoints"),
    shards: path.join(state, "shards"),
    analysis: path.join(out, "analysis.json"),
    markdown: path.join(out, "project-report.md"),
    postman: path.join(out, "postman_collection.json"),
    openapi: path.join(out, "openapi.json"),
    swaggerHtml: path.join(out, "swagger-ui.html"),
    chunkCandidates: path.join(state, "chunk-candidates.json"),
    downloadedChunks: path.join(out, "downloaded-chunks"),
    downloadedChunksManifest: path.join(state, "downloaded-chunks.json"),
    sourceMapCandidates: path.join(state, "source-map-candidates.json"),
    downloadedSourceMaps: path.join(out, "downloaded-sourcemaps"),
    downloadedSourceMapsManifest: path.join(state, "downloaded-sourcemaps.json"),
    supplementCandidates: path.join(state, "supplement-candidates.json"),
    downloadedSupplements: path.join(out, "downloaded-supplements"),
    downloadedSupplementsManifest: path.join(state, "downloaded-supplements.json"),
    diagrams: path.join(out, "diagrams"),
    cryptoNode: path.join(out, "crypto", "node"),
    cryptoPython: path.join(out, "crypto", "python")
  };
}

function normalizeOptions(options) {
  return {
    profile: options.profile || "auto",
    withDeobfuscation: Boolean(options.withDeobfuscation),
    redactSecrets: Boolean(options.redactSecrets),
    maxFilesPerTask: Number(options.maxFilesPerTask || DEFAULT_MAX_FILES_PER_TASK),
    maxBytesPerTask: Number(options.maxBytesPerTask || DEFAULT_MAX_BYTES_PER_TASK),
    maxDownloadBytes: Number(options.maxDownloadBytes || 10_000_000),
    baseUrl: options.baseUrl || "",
    localCacheRoots: parsePathList(options.localCacheRoot || options.localCacheRoots || ""),
    localScanMaxDepth: Number(options.localScanMaxDepth || DEFAULT_LOCAL_SCAN_MAX_DEPTH),
    localScanMaxEntries: Number(options.localScanMaxEntries || DEFAULT_LOCAL_SCAN_MAX_ENTRIES),
    localScanMaxMs: Number(options.localScanMaxMs || DEFAULT_LOCAL_SCAN_MAX_MS),
    yes: Boolean(options.yes),
    forceRebuildTask: options.forceRebuildTask || null
  };
}

function parsePathList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createEmptyAnalysis() {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: nowIso(),
    project: {},
    inventory: {},
    modules: [],
    features: [],
    apis: [],
    crypto: [],
    configs: [],
    accounts: [],
    externalAssets: [],
    chunkDiscovery: {
      publicPaths: [],
      candidates: [],
      downloaded: [],
      needsBaseUrl: []
    },
    sourceMapDiscovery: {
      candidates: [],
      downloaded: [],
      needsBaseUrl: []
    },
    supplementDiscovery: {
      candidates: [],
      downloaded: [],
      localCacheSearches: [],
      missingPlugins: [],
      h5Entries: [],
      nestedStaticAssets: [],
      sourceMapCandidates: [],
      foundLocalPackages: []
    },
    callGraph: [],
    callGraphStats: {
      rawEdges: 0,
      dedupedEdges: 0,
      retainedEdges: 0,
      limit: CALL_GRAPH_LIMIT,
      truncated: false
    },
    diagrams: [],
    developerSignals: [],
    operationsSignals: [],
    thirdPartyServices: [],
    evidence: [],
    uncertainties: [],
    analysisState: {}
  };
}

function initialTasks() {
  return [
    task("inventory.scan", "Scan project inventory"),
    task("classify.project", "Classify project type", ["inventory.scan"]),
    task("chunks.discover", "Discover missing lazy chunks", ["classify.project"]),
    task("sourcemaps.discover", "Discover missing source maps", ["chunks.discover"]),
    task("supplements.discover", "Discover high-confidence supplemental files", ["sourcemaps.discover"]),
    task("extract.plan-batches", "Plan recoverable extraction batches", ["supplements.discover"]),
    task("merge.shards", "Merge extraction shards", ["extract.plan-batches"]),
    task("render.markdown", "Render Markdown report", ["merge.shards"]),
    task("render.postman", "Render Postman collection", ["merge.shards"]),
    task("render.openapi", "Render OpenAPI document", ["merge.shards"]),
    task("render.swagger", "Render local Swagger-style UI", ["render.openapi"]),
    task("finalize", "Finalize run summary", ["render.markdown", "render.postman", "render.openapi", "render.swagger"])
  ];
}

function task(id, name, dependsOn = [], extra = {}) {
  return {
    id,
    name,
    status: "pending",
    progress: 0,
    dependsOn,
    inputFiles: [],
    outputFiles: [],
    ...extra
  };
}

function createPlan(targetPath, outputPath, options) {
  const runId = `run_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${crypto.randomBytes(3).toString("hex")}`;
  const createdAt = nowIso();
  return {
    schemaVersion: STATE_VERSION,
    runId,
    targetPath: path.resolve(targetPath),
    outputPath: path.resolve(outputPath),
    createdAt,
    updatedAt: createdAt,
    options,
    tasks: initialTasks()
  };
}

async function savePlan(plan, p) {
  plan.updatedAt = nowIso();
  await writeJson(p.plan, plan);
}

function findTask(plan, taskId) {
  return plan.tasks.find((candidate) => candidate.id === taskId);
}

function resetTaskAndDependents(plan, taskId) {
  const affected = new Set([taskId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of plan.tasks) {
      if (affected.has(candidate.id)) continue;
      if ((candidate.dependsOn || []).some((depId) => affected.has(depId))) {
        affected.add(candidate.id);
        changed = true;
      }
    }
  }

  for (const candidate of plan.tasks) {
    if (!affected.has(candidate.id)) continue;
    candidate.status = "pending";
    candidate.progress = 0;
    candidate.error = "";
    candidate.startedAt = "";
    candidate.endedAt = "";
    candidate.outputFiles = [];
  }
  return [...affected];
}

function dependenciesSatisfied(plan, current) {
  return (current.dependsOn || []).every((depId) => {
    const dep = findTask(plan, depId);
    return dep && (dep.status === "completed" || dep.status === "skipped");
  });
}

function nextRunnableTask(plan) {
  return plan.tasks.find((candidate) =>
    ["pending", "failed", "blocked"].includes(candidate.status) && dependenciesSatisfied(plan, candidate)
  );
}

async function markTask(plan, p, current, status, patch = {}) {
  if (!TASK_STATUSES.has(status)) throw new Error(`Invalid task status: ${status}`);
  Object.assign(current, patch, { status });
  if (status === "in_progress") {
    current.startedAt = current.startedAt || nowIso();
    current.error = "";
  }
  if (["completed", "failed", "blocked", "skipped"].includes(status)) {
    current.endedAt = nowIso();
  }
  await savePlan(plan, p);
  await appendJsonLine(p.progress, {
    runId: plan.runId,
    taskId: current.id,
    status,
    progress: current.progress,
    outputFiles: current.outputFiles,
    error: current.error || undefined
  });
  await writeRunSummary(plan, p);
}

async function executePlan(plan, p) {
  await ensureStateDirs(p);

  while (true) {
    const current = nextRunnableTask(plan);
    if (!current) break;

    await markTask(plan, p, current, "in_progress", { progress: Math.max(current.progress || 0, 1) });
    try {
      await runTask(plan, p, current);
      await markTask(plan, p, current, "completed", { progress: 100 });
    } catch (error) {
      await markTask(plan, p, current, "failed", {
        progress: current.progress || 0,
        error: error.stack || error.message
      });
      console.error(`Task failed: ${current.id}`);
      console.error(error.stack || error.message);
      break;
    }
  }

  await writeRunSummary(plan, p);
  const failed = plan.tasks.filter((candidate) => candidate.status === "failed");
  if (failed.length > 0) process.exitCode = 1;
}

async function ensureStateDirs(p) {
  await ensureDir(p.out);
  await ensureDir(p.state);
  await ensureDir(p.checkpoints);
  await ensureDir(p.shards);
  await ensureDir(p.downloadedChunks);
  await ensureDir(p.downloadedSourceMaps);
  await ensureDir(p.downloadedSupplements);
  await ensureDir(p.diagrams);
  await ensureDir(p.cryptoNode);
  await ensureDir(p.cryptoPython);
}

async function runTask(plan, p, current) {
  if (current.id === "inventory.scan") return runInventoryScan(plan, p, current);
  if (current.id === "classify.project") return runProjectClassification(plan, p, current);
  if (current.id === "chunks.discover") return runChunkDiscovery(plan, p, current);
  if (current.id === "sourcemaps.discover") return runSourceMapDiscovery(plan, p, current);
  if (current.id === "supplements.discover") return runSupplementDiscovery(plan, p, current);
  if (current.id === "extract.plan-batches") return runPlanBatches(plan, p, current);
  if (current.id.startsWith("extract.batch.")) return runExtractBatch(plan, p, current);
  if (current.id === "merge.shards") return runMergeShards(plan, p, current);
  if (current.id === "render.markdown") return runRenderMarkdown(plan, p, current);
  if (current.id === "render.postman") return runRenderPostman(plan, p, current);
  if (current.id === "render.openapi") return runRenderOpenApi(plan, p, current);
  if (current.id === "render.swagger") return runRenderSwagger(plan, p, current);
  if (current.id === "finalize") return runFinalize(plan, p, current);
  throw new Error(`No implementation for task ${current.id}`);
}

async function runInventoryScan(plan, p, current) {
  const inventory = await scanProject(plan.targetPath, p.out);
  const checkpoint = path.join(p.checkpoints, "checkpoint-001-inventory.json");
  await writeJson(checkpoint, inventory);

  const analysis = createEmptyAnalysis();
  analysis.inventory = inventory;
  analysis.analysisState = summarizePlan(plan);
  await writeJson(p.analysis, analysis);

  current.outputFiles = [checkpoint, p.analysis];
}

async function scanProject(targetPath, outputPath) {
  const root = path.resolve(targetPath);
  const outputResolved = path.resolve(outputPath);
  const files = [];
  const dirs = [];
  const stats = {
    totalFiles: 0,
    totalBytes: 0,
    analyzableFiles: 0,
    skippedFiles: 0
  };

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const resolved = path.resolve(fullPath);
      if (resolved === outputResolved || resolved.startsWith(`${outputResolved}${path.sep}`)) continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        dirs.push(normalizeSlash(path.relative(root, fullPath)) || ".");
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      stats.totalFiles += 1;

      let fileStat;
      try {
        fileStat = await fs.stat(fullPath);
      } catch {
        continue;
      }

      stats.totalBytes += fileStat.size;
      const ext = path.extname(entry.name).toLowerCase();
      const rel = normalizeSlash(path.relative(root, fullPath));
      const analyzable = isAnalyzableFile(rel);
      if (analyzable) stats.analyzableFiles += 1;
      else stats.skippedFiles += 1;

      files.push({
        path: rel,
        name: entry.name,
        ext,
        size: fileStat.size,
        kind: classifyFileKind(rel),
        analyzable,
        modifiedAt: fileStat.mtime.toISOString()
      });
    }
  }

  await walk(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  dirs.sort();

  return {
    root,
    scannedAt: nowIso(),
    stats,
    directories: dirs,
    files,
    routes: [],
    chunks: [],
    sourceMaps: files.filter((file) => file.ext === ".map").map((file) => file.path),
    configFiles: files.filter((file) => ["config", "manifest", "miniprogram", "package"].includes(file.kind)).map((file) => file.path)
  };
}

function isAnalyzableFile(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".min.js") || lower.endsWith(".bundle.js")) return true;
  const ext = path.extname(lower);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (["package.json", "app.json", "project.config.json", "ext.json", "sitemap.json"].includes(path.basename(lower))) return true;
  return false;
}

function classifyFileKind(filePath) {
  const lower = filePath.toLowerCase();
  const base = path.basename(lower);
  const ext = path.extname(lower);
  if (base === "package.json") return "package";
  if (["app.json", "project.config.json", "ext.json", "sitemap.json"].includes(base)) return "miniprogram";
  if (base.includes("config") || lower.includes("/config/") || lower.endsWith(".env")) return "config";
  if (ext === ".map") return "source_map";
  if ([".wxml", ".wxss", ".wxs"].includes(ext)) return "miniprogram";
  if ([".html", ".htm"].includes(ext)) return "markup";
  if ([".css"].includes(ext)) return "style";
  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue"].includes(ext)) {
    if (lower.includes("chunk") || lower.includes("bundle") || lower.endsWith(".min.js")) return "bundle_or_source";
    return "source";
  }
  if (ext === ".json") return "config";
  return "other";
}

async function runProjectClassification(plan, p, current) {
  const inventory = await readJson(path.join(p.checkpoints, "checkpoint-001-inventory.json"));
  const analysis = await readJson(p.analysis, createEmptyAnalysis());
  const project = await classifyProject(plan.targetPath, inventory);
  inventory.routes = project.routes || [];
  inventory.chunks = project.chunks || [];
  analysis.project = project;
  analysis.inventory = inventory;
  analysis.modules = deriveInitialModules(inventory, project);
  analysis.features = deriveInitialFeatures(inventory, project);
  analysis.analysisState = summarizePlan(plan);

  const checkpoint = path.join(p.checkpoints, "checkpoint-002-project-classification.json");
  await writeJson(checkpoint, project);
  await writeJson(p.analysis, analysis);
  current.outputFiles = [checkpoint, p.analysis];
}

async function classifyProject(targetPath, inventory) {
  const root = path.resolve(targetPath);
  const files = inventory.files || [];
  const fileSet = new Set(files.map((file) => file.path.replace(/\\/g, "/")));
  const evidence = [];
  const types = [];
  const frameworks = [];
  const routes = [];
  const chunks = [];
  const packageInfo = {};
  let name = path.basename(root);
  let packageManager = "unknown";
  let buildTool = "unknown";
  let language = "JavaScript";
  const miniprogram = await collectMiniProgramMetadata(root, files);

  const packageFile = files.find((file) => file.path.toLowerCase() === "package.json");
  if (packageFile) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(root, packageFile.path), "utf8"));
      name = pkg.name || name;
      packageInfo.name = pkg.name || "";
      packageInfo.version = pkg.version || "";
      packageInfo.description = pkg.description || "";
      packageInfo.author = pkg.author || "";
      packageInfo.maintainers = pkg.maintainers || [];
      packageInfo.dependencies = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }).sort();
      for (const dep of packageInfo.dependencies) {
        if (/vue/i.test(dep)) frameworks.push("Vue");
        if (/react/i.test(dep)) frameworks.push("React");
        if (/angular/i.test(dep)) frameworks.push("Angular");
        if (/taro/i.test(dep)) frameworks.push("Taro");
        if (/uni-app|@dcloudio/i.test(dep)) frameworks.push("uni-app");
        if (/webpack/i.test(dep)) buildTool = "webpack";
        if (/vite/i.test(dep)) buildTool = "vite";
        if (/rollup/i.test(dep)) buildTool = "rollup";
        if (/typescript/i.test(dep)) language = "TypeScript";
      }
      evidence.push("package.json");
    } catch {
      evidence.push("package.json-unreadable");
    }
  }

  if (fileSet.has("pnpm-lock.yaml")) packageManager = "pnpm";
  else if (fileSet.has("yarn.lock")) packageManager = "yarn";
  else if (fileSet.has("package-lock.json")) packageManager = "npm";
  else if (packageFile) packageManager = "npm-or-compatible";

  if (fileSet.has("app.json") || fileSet.has("project.config.json") || files.some((file) => file.ext === ".wxml")) {
    types.push("wechat-miniprogram-source");
    evidence.push("miniprogram-config-or-wxml");
    const appJson = await tryReadJson(path.join(root, "app.json"));
    if (appJson) {
      for (const page of appJson.pages || []) routes.push({ path: page, source: "app.json" });
      for (const pkg of appJson.subpackages || appJson.subPackages || []) {
        for (const page of pkg.pages || []) routes.push({ path: `${pkg.root}/${page}`.replace(/\/+/g, "/"), source: "app.json subpackage" });
      }
    }
  }

  if (miniprogram.routes.length > 0 || miniprogram.configFiles.length > 0) {
    if (!types.includes("wechat-miniprogram-source")) types.push("wechat-miniprogram-source");
    evidence.push(...miniprogram.configFiles.slice(0, 10));
    for (const route of miniprogram.routes) {
      routes.push(route);
    }
  }

  if (fileSet.has("app-service.js") || fileSet.has("page-frame.html") || files.some((file) => /app-service|page-frame|__wxAppCode__/.test(file.path))) {
    types.push("unpacked-wechat-miniprogram");
    evidence.push("unpacked-miniprogram-runtime-files");
  }

  for (const file of files.filter((candidate) => candidate.analyzable && [".js", ".mjs", ".cjs"].includes(candidate.ext))) {
    if (file.size > DEFAULT_MAX_FILE_READ_BYTES) continue;
    const full = path.join(root, file.path);
    let text = "";
    try {
      text = await fs.readFile(full, "utf8");
    } catch {
      continue;
    }
    if (/__webpack_require__|webpackJsonp|webpackChunk|browserify/i.test(text)) {
      if (!types.includes("webpack-or-browserify-bundle")) types.push("webpack-or-browserify-bundle");
      chunks.push({ path: file.path, size: file.size, evidence: "bundle runtime marker" });
      evidence.push(file.path);
    }
    if (/sourceMappingURL=/.test(text)) {
      chunks.push({ path: file.path, size: file.size, evidence: "sourceMappingURL" });
    }
  }

  if (files.some((file) => [".ts", ".tsx"].includes(file.ext))) language = "TypeScript";
  if (types.length === 0) types.push(packageFile ? "source-js-ts-project" : "javascript-artifact");

  const projectConfig = await tryReadJson(path.join(root, "project.config.json"));
  const appid = projectConfig?.appid || projectConfig?.appId || miniprogram.appid || "";
  if (miniprogram.appName) name = miniprogram.appName;
  else if (projectConfig?.projectname) name = projectConfig.projectname;

  const dedupedRoutes = dedupeBy(routes, (route) => route.path);

  return {
    name,
    root,
    detectedTypes: [...new Set(types)],
    primaryType: types[0],
    language,
    framework: [...new Set(frameworks)].join(", ") || "unknown",
    packageManager,
    buildTool,
    appid,
    packageInfo,
    routes: dedupedRoutes,
    chunks,
    evidence,
    miniprogram,
    classifiedAt: nowIso()
  };
}

async function tryReadJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function collectMiniProgramMetadata(root, files) {
  const configFiles = [];
  const routes = new Map();
  const pages = new Set();
  const subPackages = new Map();
  const packages = detectWechatPackages(files);
  const plugins = {};
  const ext = {};
  let entryPagePath = "";
  let tabBar = null;
  let networkTimeout = {};
  let requiredPrivateInfos = [];
  let appName = "";
  let appid = "";

  const candidateFiles = files.filter((file) => {
    const base = path.basename(file.path).toLowerCase();
    return ["app.json", "app-config.json"].includes(base);
  });

  for (const file of candidateFiles) {
    const json = await tryReadJson(path.join(root, file.path));
    if (!json || typeof json !== "object") continue;
    configFiles.push(file.path);

    const source = file.path;
    if (!entryPagePath && json.entryPagePath) entryPagePath = String(json.entryPagePath);

    for (const page of json.pages || []) {
      const route = normalizeMiniProgramPage(page);
      if (!route) continue;
      pages.add(route);
      routes.set(route, { path: route, source });
    }

    for (const pkg of json.subpackages || json.subPackages || []) {
      if (!pkg || typeof pkg !== "object") continue;
      const pkgRoot = normalizeMiniProgramPage(pkg.root || "");
      const pkgPages = Array.isArray(pkg.pages) ? pkg.pages : [];
      if (pkgRoot && !subPackages.has(pkgRoot)) {
        subPackages.set(pkgRoot, {
          root: pkgRoot,
          pageCount: pkgPages.length,
          source
        });
      }
      for (const page of pkgPages) {
        const route = normalizeMiniProgramPage(`${pkgRoot}/${page}`);
        if (!route) continue;
        pages.add(route);
        routes.set(route, { path: route, source: `${source} subpackage` });
      }
    }

    if (json.tabBar && typeof json.tabBar === "object") {
      tabBar = chooseBetterTabBar(tabBar, simplifyTabBar(json.tabBar));
    }
    if (json.plugins && typeof json.plugins === "object") Object.assign(plugins, simplifyPlugins(json.plugins));
    if (json.networkTimeout && typeof json.networkTimeout === "object") networkTimeout = { ...networkTimeout, ...json.networkTimeout };
    if (Array.isArray(json.requiredPrivateInfos)) requiredPrivateInfos = [...new Set([...requiredPrivateInfos, ...json.requiredPrivateInfos])];

    if (json.ext && typeof json.ext === "object") {
      Object.assign(ext, pickObject(json.ext, [
        "appName",
        "appVersion",
        "appid",
        "storeId",
        "env",
        "colorTheme",
        "colorFont",
        "codes"
      ]));
      if (!appName && json.ext.appName) appName = String(json.ext.appName);
      if (!appid && json.ext.appid) appid = String(json.ext.appid);
      if (Array.isArray(json.ext.tabBarList)) tabBar = chooseBetterTabBar(tabBar, { list: json.ext.tabBarList.map(simplifyTabBarItem) });
      if (json.ext.tabBarExt) tabBar = chooseBetterTabBar(tabBar, simplifyTabBar(json.ext.tabBarExt));
    }
  }

  const mainPackage = packages.find((item) => item.role === "app") || packages[0];
  if (!appid && mainPackage?.appid) appid = mainPackage.appid;

  return {
    appid,
    appName,
    appVersion: ext.appVersion || "",
    storeId: ext.storeId || "",
    env: ext.env || "",
    entryPagePath,
    pageCount: pages.size,
    subPackageCount: subPackages.size,
    pages: [...pages].slice(0, 1000),
    subPackages: [...subPackages.values()].slice(0, 300),
    tabBar,
    plugins,
    packages,
    configFiles,
    networkTimeout,
    requiredPrivateInfos,
    ext,
    routes: [...routes.values()]
  };
}

function detectWechatPackages(files) {
  const packages = new Map();
  for (const file of files || []) {
    const parts = normalizeSlash(file.path).split("/");
    const appid = parts.find((part) => /^wx[a-z0-9]{12,}$/i.test(part));
    if (!appid) continue;
    const existing = packages.get(appid) || {
      appid,
      role: parts.includes("__APP__") ? "app" : parts.includes("__PLUGINCODE__") ? "plugin" : "unknown",
      root: parts.slice(0, Math.max(1, parts.indexOf(appid) + 1)).join("/") || appid,
      fileCount: 0,
      configFiles: []
    };
    existing.fileCount += 1;
    if (parts.includes("__APP__")) existing.role = "app";
    else if (parts.includes("__PLUGINCODE__") && existing.role !== "app") existing.role = "plugin";
    if (["app.json", "app-config.json", "plugin.json"].includes(path.basename(file.path).toLowerCase())) {
      existing.configFiles.push(file.path);
    }
    packages.set(appid, existing);
  }
  return [...packages.values()].sort((a, b) => (a.role === "app" ? -1 : b.role === "app" ? 1 : a.appid.localeCompare(b.appid)));
}

function normalizeMiniProgramPage(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "");
}

function simplifyTabBar(tabBar = {}) {
  return {
    backgroundColor: tabBar.backgroundColor || "",
    selectedColor: tabBar.selectedColor || "",
    color: tabBar.color || "",
    custom: Boolean(tabBar.custom),
    customIcon: Boolean(tabBar.customIcon),
    list: Array.isArray(tabBar.list) ? tabBar.list.map(simplifyTabBarItem) : []
  };
}

function simplifyTabBarItem(item = {}) {
  return {
    text: item.text || "",
    pagePath: normalizeMiniProgramPage(item.pagePath || ""),
    code: item.code || "",
    linkText: item.link_text || item.linkText || ""
  };
}

function chooseBetterTabBar(current, candidate) {
  if (!candidate || !Array.isArray(candidate.list) || candidate.list.length === 0) return current;
  if (!current || !Array.isArray(current.list) || current.list.length === 0) return candidate;
  return tabBarScore(candidate) >= tabBarScore(current) ? { ...current, ...candidate } : current;
}

function tabBarScore(tabBar = {}) {
  return (tabBar.list || []).reduce((score, item) => {
    return score + (item.text ? 1 : 0) + (item.pagePath ? 1 : 0) + (item.code ? 3 : 0) + (item.linkText ? 2 : 0);
  }, 0);
}

function simplifyPlugins(value = {}) {
  return Object.fromEntries(Object.entries(value).map(([key, plugin]) => [
    key,
    typeof plugin === "object" && plugin ? pickObject(plugin, ["version", "provider", "subpackage"]) : plugin
  ]));
}

function pickObject(value = {}, keys = []) {
  return Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(value, key)).map((key) => [key, value[key]]));
}

function deriveInitialModules(inventory, project) {
  const modules = new Map();
  for (const route of project.routes || []) {
    const key = route.path.split("/")[0] || "pages";
    modules.set(key, {
      id: stableId("module", `route:${key}`),
      type: "module",
      name: key,
      description: `Mini Program route group ${key}`,
      files: [],
      relatedIds: [],
      evidenceIds: [],
      confidence: 0.7,
      metadata: { source: "routes" }
    });
  }

  for (const file of inventory.files || []) {
    if (!file.analyzable) continue;
    const parts = file.path.split("/");
    const first = parts.length > 1 ? parts[0] : path.dirname(file.path);
    if (!first || first === ".") continue;
    const module = modules.get(first) || {
      id: stableId("module", `dir:${first}`),
      type: "module",
      name: first,
      description: `Files under ${first}`,
      files: [],
      relatedIds: [],
      evidenceIds: [],
      confidence: 0.55,
      metadata: { source: "directory" }
    };
    module.files.push(file.path);
    modules.set(first, module);
  }

  return [...modules.values()].slice(0, 100);
}

function deriveInitialFeatures(inventory, project) {
  const features = [];
  for (const route of project.routes || []) {
    features.push({
      id: stableId("feature", `route:${route.path}`),
      type: "feature",
      name: route.path,
      description: `Feature/page route ${route.path}`,
      files: (inventory.files || []).filter((file) => file.path.startsWith(route.path)).map((file) => file.path),
      relatedIds: [],
      evidenceIds: [],
      confidence: 0.75,
      metadata: { source: route.source || "route" }
    });
  }
  return features.slice(0, 200);
}

async function runChunkDiscovery(plan, p, current) {
  const inventory = await readJson(path.join(p.checkpoints, "checkpoint-001-inventory.json"));
  const analysis = await readJson(p.analysis, createEmptyAnalysis());
  const discovery = await discoverLazyChunks(plan.targetPath, inventory, p, plan.options || {});
  inventory.chunkDiscovery = discovery;
  analysis.inventory = inventory;
  analysis.chunkDiscovery = discovery;
  analysis.analysisState = summarizePlan(plan);

  const checkpoint = path.join(p.checkpoints, "checkpoint-002b-chunk-discovery.json");
  await writeJson(p.chunkCandidates, discovery);
  await writeJson(checkpoint, discovery);
  await writeJson(p.analysis, analysis);
  current.outputFiles = [p.chunkCandidates, checkpoint, p.analysis];
}

async function runSourceMapDiscovery(plan, p, current) {
  const inventory = await readJson(path.join(p.checkpoints, "checkpoint-001-inventory.json"));
  const analysis = await readJson(p.analysis, createEmptyAnalysis());
  const discovery = await discoverSourceMaps(plan.targetPath, inventory, p, plan.options || {});
  inventory.sourceMapDiscovery = discovery;
  analysis.inventory = inventory;
  analysis.sourceMapDiscovery = discovery;
  analysis.analysisState = summarizePlan(plan);

  const checkpoint = path.join(p.checkpoints, "checkpoint-002c-source-map-discovery.json");
  await writeJson(p.sourceMapCandidates, discovery);
  await writeJson(checkpoint, discovery);
  await writeJson(p.analysis, analysis);
  current.outputFiles = [p.sourceMapCandidates, checkpoint, p.analysis];
}

async function runSupplementDiscovery(plan, p, current) {
  const inventory = await readJson(path.join(p.checkpoints, "checkpoint-001-inventory.json"));
  const project = await readJson(path.join(p.checkpoints, "checkpoint-002-project-classification.json"), {});
  const analysis = await readJson(p.analysis, createEmptyAnalysis());
  const discovery = await discoverSupplements(plan.targetPath, inventory, project, p, plan.options || {});
  inventory.supplementDiscovery = discovery;
  analysis.inventory = inventory;
  analysis.supplementDiscovery = discovery;
  analysis.analysisState = summarizePlan(plan);

  const checkpoint = path.join(p.checkpoints, "checkpoint-002d-supplement-discovery.json");
  await writeJson(p.supplementCandidates, discovery);
  await writeJson(checkpoint, discovery);
  await writeJson(p.analysis, analysis);
  current.outputFiles = [p.supplementCandidates, checkpoint, p.analysis];
}

async function discoverSupplements(targetPath, inventory, project, p, options = {}) {
  const root = path.resolve(targetPath);
  const localFiles = new Set((inventory.files || []).map((file) => normalizeSlash(file.path)));
  const localDirs = new Set(inventory.directories || []);
  const candidates = new Map();

  collectMissingPluginSupplements(candidates, project, localDirs, localFiles);
  await collectLocalCacheSearchSupplements(candidates, project, root, options);
  collectDeclaredPageGapSupplements(candidates, project, localFiles);

  for (const file of (inventory.files || []).filter((candidate) => candidate.analyzable)) {
    const ext = path.extname(file.path).toLowerCase();
    if (![".js", ".mjs", ".cjs", ".html", ".htm", ".json"].includes(ext)) continue;
    if (file.size > DEFAULT_MAX_FILE_READ_BYTES) continue;
    let text = "";
    try {
      text = await fs.readFile(path.join(root, file.path), "utf8");
    } catch {
      continue;
    }
    collectSupplementUrlsFromText(candidates, file.path, text, options);
  }

  const chunkDiscovery = await readJson(p.chunkCandidates, { candidates: [] });
  for (const candidate of chunkDiscovery.candidates || []) {
    if (!candidate.resolvedUrl || candidate.localExists || candidate.status === "downloaded") continue;
    if (!/\.js(?:\?|$)/i.test(candidate.resolvedUrl)) continue;
    addSupplementCandidate(candidates, {
      type: "remote_js",
      status: "candidate",
      value: candidate.value,
      resolvedUrl: candidate.resolvedUrl,
      file: candidate.file,
      line: candidate.line || 0,
      snippet: candidate.snippet || "",
      confidence: Math.max(0.75, candidate.confidence || 0.75),
      reason: "Remote JavaScript chunk already discovered from project code.",
      fetchRequiresApproval: true,
      expectedContentTypes: ["application/javascript", "text/javascript", "application/x-javascript", "text/plain"]
    });
  }

  const sourceMapDiscovery = await readJson(p.sourceMapCandidates, { candidates: [] });
  for (const candidate of sourceMapDiscovery.candidates || []) {
    if (!candidate.resolvedUrl || candidate.localExists || candidate.status === "downloaded") continue;
    addSupplementCandidate(candidates, {
      type: "source_map",
      status: "candidate",
      value: candidate.value,
      resolvedUrl: candidate.resolvedUrl,
      file: candidate.file,
      line: candidate.line || 0,
      snippet: candidate.snippet || "",
      confidence: Math.max(0.82, candidate.confidence || 0.82),
      reason: "Source map URL found in project JavaScript.",
      fetchRequiresApproval: true,
      expectedContentTypes: ["application/json", "text/plain", "application/octet-stream"]
    });
  }

  const manifest = await readJson(p.downloadedSupplementsManifest, { downloaded: [] });
  const downloadedByUrl = new Map((manifest.downloaded || []).map((item) => [item.url, item]));
  for (const candidate of candidates.values()) {
    if (candidate.resolvedUrl && downloadedByUrl.has(candidate.resolvedUrl)) {
      candidate.status = "downloaded";
      candidate.download = downloadedByUrl.get(candidate.resolvedUrl);
    }
  }

  const ordered = [...candidates.values()].sort((a, b) => supplementCandidateScore(b) - supplementCandidateScore(a));
  return {
    generatedAt: nowIso(),
    candidates: ordered,
    downloaded: manifest.downloaded || [],
    localCacheSearches: ordered.filter((item) => item.type === "local_cache_search"),
    missingPlugins: ordered.filter((item) => item.type === "missing_miniprogram_plugin"),
    h5Entries: ordered.filter((item) => item.type === "h5_entry"),
    nestedStaticAssets: ordered.filter((item) => item.type === "nested_static_asset"),
    sourceMapCandidates: ordered.filter((item) => item.type === "source_map"),
    foundLocalPackages: ordered.filter((item) => item.type === "local_cache_search" && item.status === "found_local_package"),
    downloadable: ordered.filter((item) => item.resolvedUrl && item.status === "candidate")
  };
}

function collectMissingPluginSupplements(candidates, project, localDirs, localFiles) {
  const mp = project?.miniprogram || {};
  const knownPackages = new Set((mp.packages || []).map((item) => item.appid).filter(Boolean));
  const knownPaths = new Set([...localDirs, ...localFiles]);
  for (const [pluginName, plugin] of Object.entries(mp.plugins || {})) {
    const provider = plugin?.provider || "";
    if (!provider || knownPackages.has(provider)) continue;
    const existsByPath = [...knownPaths].some((candidate) => candidate === provider || candidate.startsWith(`${provider}/`) || candidate.includes(`/${provider}/`));
    if (existsByPath) continue;
    addSupplementCandidate(candidates, {
      type: "missing_miniprogram_plugin",
      status: "needs_manual_source",
      value: provider,
      pluginName,
      provider,
      version: plugin?.version || "",
      subpackage: plugin?.subpackage || "",
      file: (mp.configFiles || [])[0] || "",
      confidence: 0.96,
      reason: "Declared in Mini Program plugin config but no matching plugin package directory was found locally.",
      fetchRequiresApproval: true,
      expectedContentTypes: ["wxapkg", "unpacked_plugin_directory"]
    });
  }
}

async function collectLocalCacheSearchSupplements(candidates, project, targetRoot, options = {}) {
  const mp = project?.miniprogram || {};
  const ids = new Set([project?.appid, mp.appid, ...(mp.packages || []).map((item) => item.appid), ...Object.values(mp.plugins || {}).map((item) => item?.provider)].filter(Boolean));
  const suggestedRoots = localCacheSearchRoots();
  const scanRoots = localCacheScanRoots(targetRoot, options, suggestedRoots);
  for (const id of ids) {
    const scan = await scanLocalPackageRoots(id, scanRoots, options);
    const found = scan.matches.length > 0;
    addSupplementCandidate(candidates, {
      type: "local_cache_search",
      status: found ? "found_local_package" : "not_found",
      value: id,
      provider: id,
      confidence: id === project?.appid || id === mp.appid ? 0.9 : 0.82,
      reason: found
        ? "Bounded local scan found a matching Mini Program package/cache artifact."
        : "Bounded local scan did not find a matching package artifact in the target, user-provided, or common WeChat DevTools cache roots.",
      fetchRequiresApproval: false,
      searchPatterns: [id, `${id}.wxapkg`, `${id}_`, `${id}/`],
      suggestedRoots,
      scannedRoots: scan.scannedRoots,
      scanLimits: scan.limits,
      scanStats: scan.stats,
      foundPaths: scan.matches,
      packagePath: scan.matches[0]?.path || "",
      packageKind: scan.matches[0]?.kind || ""
    });
  }
}

function localCacheSearchRoots() {
  const roots = [];
  const localAppData = process.env.LOCALAPPDATA || "";
  const appData = process.env.APPDATA || "";
  const home = process.env.USERPROFILE || process.env.HOME || "";
  for (const base of [localAppData, appData, home]) {
    if (!base) continue;
    for (const devtoolsDir of [
      path.join(base, "Tencent", "WeChat DevTools"),
      path.join(base, "WeChat DevTools"),
      path.join(base, "Tencent", "微信开发者工具"),
      path.join(base, "微信开发者工具")
    ]) {
      roots.push(devtoolsDir);
      roots.push(path.join(devtoolsDir, "WeappPackage"));
      roots.push(path.join(devtoolsDir, "Default", "WeappPackage"));
      roots.push(path.join(devtoolsDir, "User Data", "Default", "WeappPackage"));
      roots.push(path.join(devtoolsDir, "User Data", "Default", "Cache"));
    }
  }
  return [...new Set(roots.map(normalizeSlash))].slice(0, 32);
}

function localCacheScanRoots(targetRoot, options = {}, suggestedRoots = []) {
  const roots = [targetRoot, ...(options.localCacheRoots || []), ...suggestedRoots]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => path.resolve(item))
    .filter(Boolean);
  return [...new Set(roots)];
}

async function scanLocalPackageRoots(appid, roots, options = {}) {
  const limits = {
    maxDepth: Math.max(1, Number(options.localScanMaxDepth || DEFAULT_LOCAL_SCAN_MAX_DEPTH)),
    maxEntries: Math.max(100, Number(options.localScanMaxEntries || DEFAULT_LOCAL_SCAN_MAX_ENTRIES)),
    maxMs: Math.max(250, Number(options.localScanMaxMs || DEFAULT_LOCAL_SCAN_MAX_MS))
  };
  const started = Date.now();
  const deadline = started + limits.maxMs;
  const matches = [];
  const scannedRoots = [];
  const stats = {
    entriesVisited: 0,
    directoriesVisited: 0,
    rootsMissing: 0,
    stoppedByEntryLimit: false,
    stoppedByTimeLimit: false
  };
  const needle = String(appid || "").toLowerCase();
  if (!needle) return { limits, scannedRoots, matches, stats };

  for (const root of roots) {
    if (Date.now() >= deadline || stats.entriesVisited >= limits.maxEntries) break;
    let rootStat;
    try {
      rootStat = await fs.stat(root);
    } catch {
      stats.rootsMissing += 1;
      scannedRoots.push({ root: normalizeSlash(root), exists: false });
      continue;
    }
    if (!rootStat.isDirectory()) continue;
    const before = stats.entriesVisited;
    scannedRoots.push({ root: normalizeSlash(root), exists: true });
    await scanLocalPackageRoot(root, needle, limits, deadline, matches, stats);
    const current = scannedRoots[scannedRoots.length - 1];
    current.entriesVisited = stats.entriesVisited - before;
  }
  stats.stoppedByEntryLimit = stats.entriesVisited >= limits.maxEntries;
  stats.stoppedByTimeLimit = Date.now() >= deadline;
  stats.elapsedMs = Date.now() - started;
  return {
    limits,
    scannedRoots,
    matches: dedupeBy(matches, (item) => item.path).slice(0, 25),
    stats
  };
}

async function scanLocalPackageRoot(root, needle, limits, deadline, matches, stats) {
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    if (Date.now() >= deadline || stats.entriesVisited >= limits.maxEntries) return;
    const current = queue.shift();
    let entries;
    try {
      entries = await fs.readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    stats.directoriesVisited += 1;
    for (const entry of entries) {
      if (Date.now() >= deadline || stats.entriesVisited >= limits.maxEntries) return;
      stats.entriesVisited += 1;
      const name = entry.name;
      const full = path.join(current.dir, name);
      const lowerName = name.toLowerCase();
      if (entry.isFile() && lowerName.endsWith(".wxapkg") && lowerName.includes(needle)) {
        matches.push({
          kind: "wxapkg",
          path: normalizeSlash(full),
          name,
          root: normalizeSlash(root),
          confidence: lowerName === `${needle}.wxapkg` ? 0.96 : 0.88
        });
      } else if (entry.isDirectory()) {
        if (lowerName.includes(needle)) {
          matches.push({
            kind: "unpacked_directory",
            path: normalizeSlash(full),
            name,
            root: normalizeSlash(root),
            confidence: lowerName === needle ? 0.92 : 0.82
          });
        }
        if (current.depth < limits.maxDepth && !SKIP_DIRS.has(lowerName)) {
          queue.push({ dir: full, depth: current.depth + 1 });
        }
      }
    }
  }
}

function collectDeclaredPageGapSupplements(candidates, project, localFiles) {
  const mp = project?.miniprogram || {};
  const pages = mp.pages || [];
  let emitted = 0;
  for (const page of pages) {
    const probes = [`${page}.js`, `${page}.json`, `${page}.html`, `${page}.wxml`];
    if (probes.some((probe) => localFiles.has(probe))) continue;
    addSupplementCandidate(candidates, {
      type: "declared_route_without_materialized_file",
      status: "informational",
      value: page,
      confidence: 0.45,
      reason: "Declared Mini Program route has no standalone page files in the current unpacked tree. It may still be embedded in app-service.js.",
      fetchRequiresApproval: false
    });
    emitted += 1;
    if (emitted >= 60) break;
  }
}

function collectSupplementUrlsFromText(candidates, file, text, options = {}) {
  for (const match of findAll(URL_RE, text)) {
    const value = cleanUrl(match[0]);
    if (!value || !/^https?:\/\//i.test(value)) continue;
    if (isLikelyH5Entry(value)) {
      addSupplementCandidate(candidates, {
        type: "h5_entry",
        status: "candidate",
        value,
        resolvedUrl: value,
        file,
        line: lineNumberAt(text, match.index),
        snippet: snippetAt(text, match.index),
        confidence: /pth5|scrmh5|stdMarketingH5/i.test(value) ? 0.86 : 0.76,
        reason: "Project code references this WebView/H5 entry; downloading its static HTML/JS can reveal additional API wrappers.",
        fetchRequiresApproval: true,
        expectedContentTypes: ["text/html", "application/xhtml+xml", "text/plain"]
      });
      continue;
    }
    if (/\.js(?:\?|$)/i.test(value)) {
      addSupplementCandidate(candidates, {
        type: "remote_js",
        status: "candidate",
        value,
        resolvedUrl: resolveCandidateUrl(value, options.baseUrl) || value,
        file,
        line: lineNumberAt(text, match.index),
        snippet: snippetAt(text, match.index),
        confidence: 0.78,
        reason: "Project code references this remote JavaScript file.",
        fetchRequiresApproval: true,
        expectedContentTypes: ["application/javascript", "text/javascript", "text/plain"]
      });
    }
  }
}

function isLikelyH5Entry(value) {
  const url = String(value || "");
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.(?:js|css|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|json)(?:\?|$)/i.test(url)) return false;
  if (/webapi\.|sockets\.|\/callback\/|\/api\/|api-docs|swagger|knife4j/i.test(url)) return false;
  return /(?:pth5|scrmh5|webview|stdMarketingH5|\/h5\b|\/h5\/|\/pages?\/|\/activity)/i.test(url);
}

function addSupplementCandidate(candidates, candidate) {
  const normalized = {
    id: stableId("supplement", `${candidate.type}:${candidate.value}:${candidate.resolvedUrl || ""}:${candidate.file || ""}`),
    status: candidate.status || (candidate.resolvedUrl ? "candidate" : "informational"),
    fetchRequiresApproval: candidate.fetchRequiresApproval ?? Boolean(candidate.resolvedUrl),
    ...candidate
  };
  const key = `${normalized.type}:${normalized.value}:${normalized.resolvedUrl || ""}`;
  if (!candidates.has(key)) {
    candidates.set(key, normalized);
    return normalized;
  }
  const existing = candidates.get(key);
  existing.confidence = Math.max(existing.confidence || 0, normalized.confidence || 0);
  existing.sources = [...new Set([...(existing.sources || []), normalized.file].filter(Boolean))];
  if (!existing.snippet && normalized.snippet) existing.snippet = normalized.snippet;
  if (!existing.line && normalized.line) existing.line = normalized.line;
  return existing;
}

function supplementCandidateScore(candidate) {
  let score = candidate.confidence || 0;
  if (candidate.status === "candidate" && candidate.resolvedUrl) score += 0.35;
  if (candidate.status === "found_local_package") score += 0.4;
  if (candidate.type === "missing_miniprogram_plugin") score += 0.3;
  if (candidate.type === "h5_entry") score += 0.2;
  if (candidate.type === "nested_static_asset") score += 0.18;
  if (candidate.type === "local_cache_search") score += 0.12;
  if (candidate.status === "not_found") score -= 0.1;
  if (candidate.status === "informational") score -= 0.35;
  return score;
}

async function discoverLazyChunks(targetPath, inventory, p, options = {}) {
  const root = path.resolve(targetPath);
  const localFiles = new Set((inventory.files || []).map((file) => normalizeSlash(file.path)));
  const candidates = new Map();
  const publicPaths = new Map();

  for (const file of (inventory.files || []).filter((candidate) => candidate.analyzable)) {
    const ext = path.extname(file.path).toLowerCase();
    if (![".js", ".mjs", ".cjs", ".html", ".htm", ".css", ".map", ".json"].includes(ext)) continue;
    if (file.size > DEFAULT_MAX_FILE_READ_BYTES) continue;

    let text = "";
    try {
      text = await fs.readFile(path.join(root, file.path), "utf8");
    } catch {
      continue;
    }

    collectChunkPublicPaths(publicPaths, file.path, text);
    collectChunkCandidates(candidates, file.path, text, localFiles, options);
    collectChunkCandidatesFromSourceMap(candidates, publicPaths, file.path, text, localFiles, options);
  }

  const remotePublicPaths = [...publicPaths.values()]
    .map((item) => item.value)
    .filter((value) => /^(?:https?:)?\/\//i.test(value));
  for (const candidate of candidates.values()) {
    if (candidate.resolvedUrl || candidate.localExists) continue;
    for (const publicPathValue of remotePublicPaths) {
      const resolved = resolveCandidateUrl(candidate.value, publicPathValue);
      if (resolved) {
        candidate.resolvedUrl = resolved;
        candidate.status = "candidate";
        candidate.resolvedVia = "public_path";
        break;
      }
    }
  }

  const downloadedManifest = await readJson(p.downloadedChunksManifest, { downloaded: [] });
  const downloadedByUrl = new Map((downloadedManifest.downloaded || []).map((item) => [item.url, item]));
  for (const candidate of candidates.values()) {
    if (downloadedByUrl.has(candidate.resolvedUrl || candidate.value)) {
      candidate.status = "downloaded";
      candidate.download = downloadedByUrl.get(candidate.resolvedUrl || candidate.value);
    }
  }

  const orderedCandidates = [...candidates.values()].sort((a, b) => {
    const aScore = chunkCandidateScore(a);
    const bScore = chunkCandidateScore(b);
    return bScore - aScore || a.value.localeCompare(b.value);
  });

  return {
    generatedAt: nowIso(),
    publicPaths: [...publicPaths.values()],
    candidates: orderedCandidates,
    downloaded: downloadedManifest.downloaded || [],
    needsBaseUrl: orderedCandidates.filter((item) => item.status === "needs_base_url")
  };
}

async function discoverSourceMaps(targetPath, inventory, p, options = {}) {
  const root = path.resolve(targetPath);
  const localFiles = new Set((inventory.files || []).map((file) => normalizeSlash(file.path)));
  for (const file of await loadDownloadedChunkFiles(p)) localFiles.add(file.path);
  for (const file of await loadDownloadedSourceMapFiles(p)) localFiles.add(file.path);
  for (const file of await loadDownloadedSupplementFiles(p)) localFiles.add(file.path);

  const candidates = new Map();
  const scanFiles = [...(inventory.files || []), ...(await loadDownloadedChunkFiles(p)), ...(await loadDownloadedSupplementFiles(p))]
    .filter((file) => file.analyzable)
    .filter((file) => [".js", ".mjs", ".cjs", ".css", ".html", ".htm"].includes(path.extname(file.path).toLowerCase()));

  for (const file of scanFiles) {
    if (file.size > DEFAULT_MAX_FILE_READ_BYTES) continue;
    const full = resolveInputFilePath(root, p.out, file.path, file);
    let text = "";
    try {
      text = await fs.readFile(full, "utf8");
    } catch {
      continue;
    }
    collectSourceMapCandidates(candidates, file.path, text, localFiles, options);
    collectSourceMapGuessCandidates(candidates, file, localFiles, options);
  }

  const chunkDiscovery = await readJson(p.chunkCandidates, { publicPaths: [] });
  const publicPaths = (chunkDiscovery.publicPaths || []).map((item) => item.value).filter(Boolean);
  for (const candidate of candidates.values()) {
    if (candidate.resolvedUrl || candidate.localExists) continue;
    for (const publicPathValue of publicPaths) {
      const resolved = resolveCandidateUrl(candidate.value, publicPathValue);
      if (resolved) {
        candidate.resolvedUrl = resolved;
        candidate.status = "candidate";
        candidate.resolvedVia = "public_path";
        break;
      }
    }
  }

  const downloadedManifest = await readJson(p.downloadedSourceMapsManifest, { downloaded: [] });
  const downloadedByUrl = new Map((downloadedManifest.downloaded || []).map((item) => [item.url, item]));
  for (const candidate of candidates.values()) {
    if (downloadedByUrl.has(candidate.resolvedUrl || candidate.value)) {
      candidate.status = "downloaded";
      candidate.download = downloadedByUrl.get(candidate.resolvedUrl || candidate.value);
    }
  }

  const ordered = [...candidates.values()].sort((a, b) => sourceMapCandidateScore(b) - sourceMapCandidateScore(a));
  return {
    generatedAt: nowIso(),
    candidates: ordered,
    downloaded: downloadedManifest.downloaded || [],
    needsBaseUrl: ordered.filter((item) => item.status === "needs_base_url")
  };
}

function collectSourceMapCandidates(candidates, file, text, localFiles, options = {}) {
  const sourceMapRe = /sourceMappingURL=([^\s"'`<>)]{1,500})/g;
  for (const match of findAll(sourceMapRe, text)) {
    const value = cleanChunkValue(match[1]);
    if (!value || /^data:/i.test(value)) continue;
    addSourceMapCandidate(candidates, {
      value,
      type: "source_mapping_url",
      file,
      line: lineNumberAt(text, match.index),
      snippet: snippetAt(text, match.index),
      confidence: 0.9,
      localExists: sourceMapExistsLocally(value, file, localFiles),
      resolvedUrl: resolveCandidateUrl(value, options.baseUrl)
    });
  }

  const jsFileMapRe = /(['"`])([^'"`]+?\.js\.map(?:\?[^'"`]*)?)\1/gi;
  for (const match of findAll(jsFileMapRe, text)) {
    const value = cleanChunkValue(match[2]);
    addSourceMapCandidate(candidates, {
      value,
      type: "map_string",
      file,
      line: lineNumberAt(text, match.index),
      snippet: snippetAt(text, match.index),
      confidence: 0.7,
      localExists: sourceMapExistsLocally(value, file, localFiles),
      resolvedUrl: resolveCandidateUrl(value, options.baseUrl)
    });
  }
}

function collectSourceMapGuessCandidates(candidates, fileMeta, localFiles, options = {}) {
  const file = normalizeSlash(fileMeta.path || "");
  const ext = path.extname(file).toLowerCase();
  if (![".js", ".mjs", ".cjs"].includes(ext)) return;

  for (const guess of sourceMapGuessValues(file)) {
    const baseUrl = fileMeta.sourceUrl || options.baseUrl || "";
    addSourceMapCandidate(candidates, {
      value: guess.value,
      type: "guess_js_map",
      file,
      line: 0,
      snippet: `Guessed source map for ${file}`,
      confidence: guess.kind === "file_js_map" ? 0.64 : 0.56,
      localExists: sourceMapExistsLocally(guess.value, file, localFiles),
      resolvedUrl: resolveCandidateUrl(path.basename(guess.value), fileMeta.sourceUrl) || resolveCandidateUrl(guess.value, baseUrl),
      metadata: {
        guessKind: guess.kind,
        sourceJsFile: file,
        sourceUrl: fileMeta.sourceUrl || "",
        needsBaseUrlWhenUnresolved: !baseUrl
      }
    });
  }
}

function sourceMapGuessValues(file) {
  const clean = normalizeSlash(file.split("?")[0].split("#")[0]);
  const withoutExt = clean.replace(/\.[^.\/]+$/, "");
  return dedupeBy([
    { value: `${clean}.map`, kind: "file_js_map" },
    { value: `${withoutExt}.map`, kind: "same_path_file_map" }
  ], (item) => item.value);
}

function addSourceMapCandidate(candidates, candidate) {
  const status = candidate.localExists ? "local_exists" : candidate.resolvedUrl ? "candidate" : "needs_base_url";
  const normalized = {
    id: stableId("sourcemap", `${candidate.value}:${candidate.file}`),
    status,
    ...candidate
  };
  const key = `${normalized.value}:${normalized.resolvedUrl || ""}`;
  if (!candidates.has(key)) candidates.set(key, normalized);
}

function sourceMapExistsLocally(value, file, localFiles) {
  const clean = normalizeSlash(value.split("?")[0].split("#")[0]).replace(/^\.?\//, "");
  if (localFiles.has(clean)) return true;
  const sibling = normalizeSlash(path.join(path.dirname(file), clean));
  if (localFiles.has(sibling)) return true;
  const base = path.basename(clean);
  return [...localFiles].some((candidate) => path.basename(candidate) === base);
}

function sourceMapCandidateScore(candidate) {
  let score = candidate.confidence || 0;
  if (candidate.status === "candidate") score += 0.4;
  if (/\.js\.map(?:\?|$)/i.test(candidate.value)) score += 0.2;
  if (candidate.localExists) score -= 0.5;
  return score;
}

function collectChunkPublicPaths(publicPaths, file, text) {
  const patterns = [
    /\b(?:__webpack_require__|[A-Za-z_$][\w$]*)\.p\s*=\s*(['"`])([^'"`]{1,500})\1/g,
    /\bpublicPath\s*[:=]\s*(['"`])([^'"`]{1,500})\1/g,
    /\bwebpackPublicPath\s*[:=]\s*(['"`])([^'"`]{1,500})\1/g,
    /\bassetsDir\s*[:=]\s*(['"`])([^'"`]{1,500})\1/g
  ];
  for (const pattern of patterns) {
    for (const match of findAll(pattern, text)) {
      const value = match[2];
      const id = stableId("public_path", `${file}:${value}`);
      publicPaths.set(id, {
        id,
        value,
        file,
        line: lineNumberAt(text, match.index),
        confidence: /^(?:https?:)?\/\//.test(value) ? 0.9 : 0.7
      });
    }
  }
}

function collectChunkCandidates(candidates, file, text, localFiles, options = {}) {
  const patterns = [
    { re: /\b(?:import\s*\(|importScripts\s*\()\s*(['"`])([^'"`]+?\.js(?:\?[^'"`]*)?)\1/g, group: 2, type: "dynamic_import", confidence: 0.9 },
    { re: /sourceMappingURL=([^\s"'`<>)]{1,500})/g, group: 1, type: "source_map", confidence: 0.8 },
    { re: /(['"`])([^'"`]*?(?:chunk|static\/js|assets\/|js\/|\/js\/)[^'"`]*?\.js(?:\?[^'"`]*)?)\1/gi, group: 2, type: "chunk_string", confidence: 0.7 },
    { re: /(['"`])([^'"`]+?\.[a-f0-9]{6,}\.js(?:\?[^'"`]*)?)\1/gi, group: 2, type: "hashed_js", confidence: 0.75 },
    { re: /\b(?:https?:)?\/\/[^\s"'`<>)\\]+?\.js(?:\?[^\s"'`<>)\\]+)?/gi, group: 0, type: "remote_js", confidence: 0.85 }
  ];

  for (const pattern of patterns) {
    for (const match of findAll(pattern.re, text)) {
      const value = cleanChunkValue(match[pattern.group]);
      if (!value || isLikelyCurrentFile(value, file)) continue;
      addChunkCandidate(candidates, {
        value,
        type: pattern.type,
        file,
        line: lineNumberAt(text, match.index),
        snippet: snippetAt(text, match.index),
        confidence: pattern.confidence,
        localExists: chunkExistsLocally(value, file, localFiles),
        resolvedUrl: resolveCandidateUrl(value, options.baseUrl)
      });
    }
  }

  const webpackIdRe = /\b(?:__webpack_require__|[A-Za-z_$][\w$]*)\.e\s*\(\s*(\d{1,8})\s*\)/g;
  for (const match of findAll(webpackIdRe, text)) {
    const value = `${match[1]}.js`;
    addChunkCandidate(candidates, {
      value,
      type: "webpack_chunk_id",
      file,
      line: lineNumberAt(text, match.index),
      snippet: snippetAt(text, match.index),
      confidence: 0.45,
      localExists: chunkExistsLocally(value, file, localFiles),
      resolvedUrl: resolveCandidateUrl(value, options.baseUrl)
    });
  }
}

function collectChunkCandidatesFromSourceMap(candidates, publicPaths, file, text, localFiles, options = {}) {
  if (!file.toLowerCase().endsWith(".map")) return;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }

  for (const source of parsed.sources || []) {
    if (!/chunk|route|views?|pages?|src\//i.test(source)) continue;
    const id = stableId("public_path", `${file}:source:${source}`);
    publicPaths.set(id, {
      id,
      value: source,
      file,
      line: 0,
      confidence: 0.5,
      metadata: { kind: "source_map_source" }
    });
  }

  for (const [index, sourceText] of (parsed.sourcesContent || []).entries()) {
    if (typeof sourceText !== "string") continue;
    collectChunkCandidates(candidates, `${file}#${parsed.sources?.[index] || `source-${index + 1}`}`, sourceText, localFiles, options);
  }
}

function addChunkCandidate(candidates, candidate) {
  const status = candidate.localExists ? "local_exists" : candidate.resolvedUrl ? "candidate" : "needs_base_url";
  const normalized = {
    id: stableId("chunk", `${candidate.value}:${candidate.file}`),
    status,
    ...candidate
  };
  const key = `${normalized.value}:${normalized.resolvedUrl || ""}`;
  if (!candidates.has(key)) {
    candidates.set(key, normalized);
    return;
  }
  const existing = candidates.get(key);
  existing.confidence = Math.max(existing.confidence || 0, normalized.confidence || 0);
  existing.sources = [...new Set([...(existing.sources || []), normalized.file])];
}

function cleanChunkValue(value) {
  return String(value || "")
    .trim()
    .replace(/[),.;\]}]+$/g, "")
    .replace(/^["'`]|["'`]$/g, "");
}

function isLikelyCurrentFile(value, file) {
  const clean = value.split("?")[0].split("#")[0];
  return path.basename(clean) === path.basename(file);
}

function chunkExistsLocally(value, file, localFiles) {
  const clean = normalizeSlash(value.split("?")[0].split("#")[0]).replace(/^\.?\//, "");
  if (localFiles.has(clean)) return true;
  const sibling = normalizeSlash(path.join(path.dirname(file), clean));
  if (localFiles.has(sibling)) return true;
  const base = path.basename(clean);
  return [...localFiles].some((candidate) => path.basename(candidate) === base);
}

function resolveCandidateUrl(value, baseUrl = "") {
  const clean = cleanChunkValue(value);
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^\/\//.test(clean)) return `https:${clean}`;
  if (!baseUrl) return "";
  try {
    return new URL(clean, baseUrl).href;
  } catch {
    return "";
  }
}

function chunkCandidateScore(candidate) {
  let score = candidate.confidence || 0;
  if (candidate.status === "candidate") score += 0.4;
  if (/chunk|route|pages?|views?|static\/js/i.test(candidate.value)) score += 0.2;
  if (/vendor|common|runtime/i.test(candidate.value)) score -= 0.1;
  if (candidate.localExists) score -= 0.5;
  return score;
}

async function runPlanBatches(plan, p, current) {
  const inventory = await readJson(path.join(p.checkpoints, "checkpoint-001-inventory.json"));
  const options = plan.options || {};
  const maxFiles = Number(options.maxFilesPerTask || DEFAULT_MAX_FILES_PER_TASK);
  const maxBytes = Number(options.maxBytesPerTask || DEFAULT_MAX_BYTES_PER_TASK);
  const downloadedChunkFiles = await loadDownloadedChunkFiles(p);
  const downloadedSourceMapFiles = await loadDownloadedSourceMapFiles(p);
  const downloadedSupplementFiles = await loadDownloadedSupplementFiles(p);
  const relevantFiles = [...(inventory.files || []), ...downloadedChunkFiles, ...downloadedSourceMapFiles, ...downloadedSupplementFiles]
    .filter((file) => file.analyzable)
    .filter((file) => !/package-lock\.json$|yarn\.lock$|pnpm-lock\.yaml$/i.test(file.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  const batches = [];
  let currentBatch = [];
  let currentBytes = 0;
  for (const file of relevantFiles) {
    const wouldOverflow = currentBatch.length >= maxFiles || (currentBytes > 0 && currentBytes + file.size > maxBytes);
    if (wouldOverflow) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBytes = 0;
    }
    currentBatch.push(file);
    currentBytes += file.size;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  const insertAfter = plan.tasks.findIndex((candidate) => candidate.id === current.id);
  const existingIds = new Set(plan.tasks.map((candidate) => candidate.id));
  const batchIds = [];
  const newTasks = [];
  batches.forEach((batch, index) => {
    const id = `extract.batch.${String(index + 1).padStart(3, "0")}`;
    batchIds.push(id);
    if (!existingIds.has(id)) {
      newTasks.push(task(id, `Extract JS intelligence batch ${index + 1}`, ["extract.plan-batches"], {
        inputFiles: batch.map((file) => file.path),
        scope: {
          batchNumber: index + 1,
          fileCount: batch.length,
          totalBytes: batch.reduce((sum, file) => sum + file.size, 0)
        }
      }));
    }
  });

  if (newTasks.length > 0) {
    plan.tasks.splice(insertAfter + 1, 0, ...newTasks);
  }

  const merge = findTask(plan, "merge.shards");
  if (merge) merge.dependsOn = batchIds.length > 0 ? batchIds : ["extract.plan-batches"];

  const checkpoint = path.join(p.checkpoints, "checkpoint-003-batch-plan.json");
  await writeJson(checkpoint, {
    generatedAt: nowIso(),
    maxFilesPerTask: maxFiles,
    maxBytesPerTask: maxBytes,
    batchCount: batches.length,
    batches: batches.map((batch, index) => ({
      id: `extract.batch.${String(index + 1).padStart(3, "0")}`,
      files: batch.map((file) => file.path),
      totalBytes: batch.reduce((sum, file) => sum + file.size, 0)
    }))
  });
  current.outputFiles = [checkpoint];
  await savePlan(plan, p);
}

async function runExtractBatch(plan, p, current) {
  const inventory = await readJson(path.join(p.checkpoints, "checkpoint-001-inventory.json"));
  const project = await readJson(path.join(p.checkpoints, "checkpoint-002-project-classification.json"));
  const downloadedChunkFiles = await loadDownloadedChunkFiles(p);
  const downloadedSourceMapFiles = await loadDownloadedSourceMapFiles(p);
  const downloadedSupplementFiles = await loadDownloadedSupplementFiles(p);
  const fileMeta = [...(inventory.files || []), ...downloadedChunkFiles, ...downloadedSourceMapFiles, ...downloadedSupplementFiles];
  const files = current.inputFiles || [];
  const shard = createShard(current.id);
  const root = plan.targetPath;

  for (const rel of files) {
    const meta = fileMeta.find((file) => file.path === rel) || { size: 0, ext: path.extname(rel) };
    const full = resolveInputFilePath(root, p.out, rel, meta);
    if (meta.size > DEFAULT_MAX_FILE_READ_BYTES && meta.ext !== ".map") {
      shard.uncertainties.push(entity("uncertainty", `Large file skipped for full text extraction: ${rel}`, {
        category: "large_file",
        value: rel,
        files: [rel],
        confidence: 0.6
      }));
      continue;
    }

    let text = "";
    try {
      text = await fs.readFile(full, "utf8");
    } catch (error) {
      shard.uncertainties.push(entity("uncertainty", `Unreadable file: ${rel}`, {
        category: "read_error",
        value: error.message,
        files: [rel],
        confidence: 0.8
      }));
      continue;
    }

    extractFromText(shard, rel, text, project, plan.options || {});
    extractVirtualSourcesFromSourceMap(shard, rel, text, project, plan.options || {});
  }

  const shardPath = path.join(p.shards, `${current.id}.json`);
  await writeJson(shardPath, shard);
  current.outputFiles = [shardPath];
}

async function loadDownloadedChunkFiles(p) {
  const manifest = await readJson(p.downloadedChunksManifest, { downloaded: [] });
  const files = [];
  for (const item of manifest.downloaded || []) {
    if (!item.localPath || !(await exists(item.localPath))) continue;
    const stat = await fs.stat(item.localPath);
    files.push({
      path: normalizeSlash(path.relative(p.out, item.localPath)),
      name: path.basename(item.localPath),
      ext: path.extname(item.localPath).toLowerCase(),
      size: stat.size,
      kind: "downloaded_chunk",
      analyzable: true,
      modifiedAt: stat.mtime.toISOString(),
      absolutePath: item.localPath,
      sourceUrl: item.url
    });
  }
  return files;
}

async function loadDownloadedSourceMapFiles(p) {
  const manifest = await readJson(p.downloadedSourceMapsManifest, { downloaded: [] });
  const files = [];
  for (const item of manifest.downloaded || []) {
    if (!item.localPath || !(await exists(item.localPath))) continue;
    const stat = await fs.stat(item.localPath);
    files.push({
      path: normalizeSlash(path.relative(p.out, item.localPath)),
      name: path.basename(item.localPath),
      ext: ".map",
      size: stat.size,
      kind: "downloaded_source_map",
      analyzable: true,
      modifiedAt: stat.mtime.toISOString(),
      absolutePath: item.localPath,
      sourceUrl: item.url
    });
  }
  return files;
}

async function loadDownloadedSupplementFiles(p) {
  const manifest = await readJson(p.downloadedSupplementsManifest, { downloaded: [] });
  const files = [];
  for (const item of manifest.downloaded || []) {
    if (!item.localPath || !(await exists(item.localPath))) continue;
    const stat = await fs.stat(item.localPath);
    const ext = path.extname(item.localPath).toLowerCase();
    files.push({
      path: normalizeSlash(path.relative(p.out, item.localPath)),
      name: path.basename(item.localPath),
      ext,
      size: stat.size,
      kind: "downloaded_supplement",
      analyzable: isAnalyzableFile(item.localPath) || [".js", ".mjs", ".cjs", ".html", ".htm", ".json", ".map", ".css"].includes(ext),
      modifiedAt: stat.mtime.toISOString(),
      absolutePath: item.localPath,
      sourceUrl: item.url,
      supplementType: item.type || item.candidateType || ""
    });
  }
  return files;
}

function resolveInputFilePath(targetRoot, outputRoot, rel, meta = {}) {
  if (meta.absolutePath) return meta.absolutePath;
  const targetCandidate = path.join(targetRoot, rel);
  if (fsSync.existsSync(targetCandidate)) return targetCandidate;
  return path.join(outputRoot, rel);
}

function createShard(taskId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    taskId,
    generatedAt: nowIso(),
    apis: [],
    crypto: [],
    configs: [],
    accounts: [],
    externalAssets: [],
    callGraph: [],
    developerSignals: [],
    operationsSignals: [],
    thirdPartyServices: [],
    modules: [],
    features: [],
    evidence: [],
    uncertainties: []
  };
}

function entity(type, name, extra = {}) {
  const baseValue = extra.value ?? name;
  return {
    id: extra.id || stableId(type, `${name}:${JSON.stringify(baseValue).slice(0, 300)}`),
    type,
    name,
    value: baseValue,
    category: extra.category || type,
    description: extra.description || "",
    files: extra.files || [],
    relatedIds: extra.relatedIds || [],
    evidenceIds: extra.evidenceIds || [],
    confidence: extra.confidence ?? 0.7,
    metadata: extra.metadata || {}
  };
}

function evidence(file, text, index, method, confidence) {
  const line = lineNumberAt(text, index);
  const snippet = snippetAt(text, index);
  return {
    id: stableId("evidence", `${file}:${line}:${method}:${snippet}`),
    file,
    line,
    snippet,
    method,
    confidence
  };
}

function addEvidence(shard, item, ev) {
  shard.evidence.push(ev);
  item.evidenceIds = [...new Set([...(item.evidenceIds || []), ev.id])];
  if (item.files && !item.files.includes(ev.file)) item.files.push(ev.file);
}

function lineNumberAt(text, index) {
  if (index <= 0) return 1;
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function lineStartIndex(text, targetLine = 1) {
  const wanted = Math.max(1, Number(targetLine || 1));
  if (wanted <= 1) return 0;
  let line = 1;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      if (line === wanted) return i + 1;
    }
  }
  return 0;
}

function snippetAt(text, index) {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 220);
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 300);
}

function snippetWindow(text, index, before = 80, after = 800) {
  const start = Math.max(0, index - before);
  const end = Math.min(text.length, index + after);
  return text.slice(start, end);
}

function cleanUrl(value) {
  return String(value || "")
    .replace(/[),.;\]}]+$/g, "")
    .replace(/^\/\//, "https://");
}

function extractFromText(shard, file, text, project, options) {
  extractUrlsAndAssets(shard, file, text, options);
  extractApis(shard, file, text, options);
  extractCallGraphHints(shard, file, text, options);
  extractConfigsAccounts(shard, file, text, options);
  extractDeveloperSignals(shard, file, text, options);
  extractOperationsSignals(shard, file, text, options);
  extractThirdPartyServices(shard, file, text, options);
  extractCrypto(shard, file, text, options);
  extractSourceMapSignals(shard, file, text, project, options);
  extractFeatureHints(shard, file, text);
}

function extractVirtualSourcesFromSourceMap(shard, file, text, project, options) {
  if (!file.toLowerCase().endsWith(".map")) return;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }

  const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
  const contents = Array.isArray(parsed.sourcesContent) ? parsed.sourcesContent : [];
  contents.forEach((sourceText, index) => {
    if (typeof sourceText !== "string" || !sourceText.trim()) return;
    const sourceName = sources[index] || `source-${index + 1}`;
    const virtualFile = `${file}#${normalizeSlash(sourceName)}`;
    const beforeEvidenceCount = shard.evidence.length;
    extractFromText(shard, virtualFile, sourceText, project, {
      ...options,
      sourceMapParent: file,
      virtualSource: sourceName
    });
    for (const ev of shard.evidence.slice(beforeEvidenceCount)) {
      ev.sourceMapParent = file;
      ev.virtualSource = sourceName;
    }
  });
}

function maybeRedact(value, category, options) {
  if (!options.redactSecrets) return value;
  if (!/(secret|token|password|passwd|pwd|passphrase|passcode|ak|sk|key|appid|account|phone|mobile|email|authorization|cookie|session|credential|private|webhook|dsn|connection|string|jwt|bearer|basic|smtp|db|database|mongo|redis|mch|merchant|pay)/i.test(category)) {
    return value;
  }
  const str = String(value ?? "");
  if (str.length <= 4) return "***";
  return `${str.slice(0, 2)}***${str.slice(-2)}`;
}

function extractUrlsAndAssets(shard, file, text, options) {
  for (const match of findAll(URL_RE, text)) {
    const value = cleanUrl(match[0]);
    if (!value || value.length < 6) continue;
    const category = categorizeExternalAsset(value);
    const item = entity("externalAsset", value, {
      category,
      value: maybeRedact(value, category, options),
      files: [file],
      confidence: 0.95,
      metadata: { originalKind: "url" }
    });
    addEvidence(shard, item, evidence(file, text, match.index, "url-regex", 0.95));
    shard.externalAssets.push(item);
  }

  for (const match of findAll(IP_RE, text)) {
    const value = match[0];
    const category = /:8848\b/.test(value) ? "config_center" : "ip_endpoint";
    const item = entity("externalAsset", value, {
      category,
      value: maybeRedact(value, category, options),
      files: [file],
      confidence: 0.85,
      metadata: { originalKind: "ip" }
    });
    addEvidence(shard, item, evidence(file, text, match.index, "ip-endpoint-regex", 0.85));
    shard.externalAssets.push(item);
  }

  const keywordUrlRe = /\b(?:gitlab|github|gitee|nacos|apollo|consul|eureka|jenkins|harbor|sonarqube|swagger|knife4j|yapi|apifox|sentry|bugly)[\w.-]*(?::\d{2,5})?(?:\/[^\s"'`<>)\\]*)?/gi;
  for (const match of findAll(keywordUrlRe, text)) {
    const value = match[0];
    if (value.length < 5) continue;
    const category = categorizeExternalAsset(value);
    const item = entity("externalAsset", value, {
      category,
      value: maybeRedact(value, category, options),
      files: [file],
      confidence: 0.65,
      metadata: { originalKind: "keyword-endpoint" }
    });
    addEvidence(shard, item, evidence(file, text, match.index, "asset-keyword-regex", 0.65));
    shard.externalAssets.push(item);
  }
}

function categorizeExternalAsset(value) {
  const v = value.toLowerCase();
  if (/gitlab|github|gitee|bitbucket/.test(v)) return "repository";
  if (/\.(apk|ipa|wgt|zip)(?:\?|$|#)|appstore|apps\.apple|play\.google|fir\.im|pgyer/.test(v)) return "download";
  if (/nacos|apollo|consul|etcd|config/.test(v)) return "config_center";
  if (/eureka|discovery|registry/.test(v)) return "service_discovery";
  if (/swagger|knife4j|openapi|redoc|yapi|apifox|api-docs|v2\/api-docs|v3\/api-docs/.test(v)) return "api_docs";
  if (/oss-|aliyuncs|cos\.|myqcloud|s3\.|amazonaws|qiniu|clouddn|minio|upyun|cdn/.test(v)) return "storage_cdn";
  if (/jenkins|gitlab-ci|githubactions|harbor|sonar/.test(v)) return "ci_cd";
  if (/sentry|bugly|firebase|grafana|prometheus|logrocket|trace|monitor/.test(v)) return "monitoring";
  if (/webhook|dingtalk|feishu|larksuite|wecom|qyapi|slack/.test(v)) return "webhook";
  if (/npm|registry|verdaccio|nexus|artifactory/.test(v)) return "registry";
  if (/^wss?:\/\//.test(v)) return "websocket";
  if (/graphql/.test(v)) return "graphql";
  if (/api|gateway|gw|service/.test(v)) return "api";
  return "unknown";
}

function extractApis(shard, file, text, options) {
  const stringConstants = extractStringConstants(text);
  const clientBaseUrls = extractClientBaseUrls(text, stringConstants);
  const functionRanges = collectNamedFunctionRanges(text);
  const webpackDataFlow = collectWebpackModuleDataFlow(text, functionRanges);
  const requestWrappers = collectRequestWrapperFunctions(text, functionRanges, stringConstants);
  const apiMatches = [];
  collectApiMatches(apiMatches, text, /\baxios\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*(['"`])([^'"`]{1,600})\2/gi, null, 3, "axios-method", 1, stringConstants);
  collectApiMatches(apiMatches, text, /\bXMLHttpRequest\s*\(\s*\)[\s\S]{0,500}?\.open\s*\(\s*(['"`])([A-Z]+)\1\s*,\s*(['"`])([^'"`]{1,600})\3/gi, null, 4, "xhr-open", 2, stringConstants);

  const fetchCallRe = /\bfetch\s*\(/gi;
  for (const match of findAll(fetchCallRe, text)) {
    const call = splitCallArguments(text, match.index + match[0].length - 1, 2400);
    if (!call || call.args.length === 0) continue;
    const resolved = resolveUrlExpression(call.args[0], stringConstants);
    if (!resolved || !looksLikeApiUrl(resolved)) continue;
    const optionsBlock = call.args[1] || "";
    const method = extractObjectString(optionsBlock, ["method"]) || "GET";
    const requestInference = optionsBlock.trim().startsWith("{") ? inferRequestFromObjectBlock(optionsBlock, method, text, match.index, functionRanges, webpackDataFlow) : {};
    const responseInference = inferResponseFromSnippet(responseSnippetAfterCall(text, call.end));
    apiMatches.push({
      method: method.toUpperCase(),
      url: resolved,
      index: match.index,
      extractor: "fetch-call",
      confidence: resolved.includes("${") ? 0.7 : 0.85,
      metadata: {
        rawExpression: call.args[0].trim(),
        optionsExpression: optionsBlock.trim(),
        ...requestInference,
        ...responseInference
      }
    });
  }

  const wrapperMethodRe = /\b((?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(/gi;
  for (const match of findAll(wrapperMethodRe, text)) {
    const objectChain = match[1];
    const objectName = objectChain.split(".").pop();
    const method = match[2];
    if (objectName === "console" || objectName === "Math" || objectName === "JSON") continue;
    const call = splitCallArguments(text, match.index + match[0].length - 1, 2400);
    if (!call || call.args.length === 0) continue;
    const resolved = resolveUrlExpression(call.args[0], stringConstants);
    if (!resolved || !looksLikeApiUrl(resolved)) continue;
    const base = clientBaseUrls[objectName] || "";
    const requestInference = inferRequestFromMethodArgs(method, call.args, text, match.index, functionRanges, webpackDataFlow);
    const responseInference = inferResponseFromSnippet(responseSnippetAfterCall(text, call.end));
    apiMatches.push({
      method: method.toUpperCase(),
      url: joinBaseUrl(base, resolved),
      index: match.index,
      extractor: base ? "request-wrapper-method-with-base" : "request-wrapper-method",
      confidence: base ? 0.82 : 0.68,
      metadata: {
        objectChain,
        wrapperObject: objectName,
        rawExpression: call.args[0].trim(),
        secondArgument: (call.args[1] || "").trim(),
        inferredBaseUrl: base,
        ...requestInference,
        ...responseInference
      }
    });
  }

  const objectCallRe = /\b(?:axios|request|http|ajax|service|client|wx\.request|uni\.request|Taro\.request)\s*\(\s*\{([\s\S]{0,1800}?)\}\s*\)/gi;
  for (const match of findAll(objectCallRe, text)) {
    const block = match[1];
    const url = extractObjectUrl(block, stringConstants, ["url", "uri", "path"]);
    if (!url || !looksLikeApiUrl(url)) continue;
    const method = extractObjectString(block, ["method", "type"]) || "GET";
    const requestInference = inferRequestFromObjectBlock(block, method, text, match.index, functionRanges, webpackDataFlow);
    const responseInference = inferResponseFromSnippet(block);
    apiMatches.push({
      method: method.toUpperCase(),
      url,
      index: match.index,
      extractor: "request-object",
      confidence: 0.85,
      metadata: {
        ...requestInference,
        ...responseInference,
        headerKeys: extractObjectKeys(block, ["headers", "header"])
      }
    });
  }

  const wxCallRe = /\b(?:wx|uni|Taro)\.request\s*\(\s*\{([\s\S]{0,1800}?)\}\s*\)/gi;
  for (const match of findAll(wxCallRe, text)) {
    const block = match[1];
    const url = extractObjectUrl(block, stringConstants, ["url", "uri", "path"]);
    if (!url || !looksLikeApiUrl(url)) continue;
    const method = extractObjectString(block, ["method"]) || "GET";
    const requestInference = inferRequestFromObjectBlock(block, method, text, match.index, functionRanges, webpackDataFlow);
    const responseInference = inferResponseFromSnippet(block);
    apiMatches.push({
      method: method.toUpperCase(),
      url,
      index: match.index,
      extractor: "mini-program-request",
      confidence: 0.9,
      metadata: {
        ...requestInference,
        ...responseInference,
        headerKeys: extractObjectKeys(block, ["header", "headers"])
      }
    });
  }

  for (const wrapper of requestWrappers) {
    const callRe = new RegExp(`\\b${escapeRegex(wrapper.name)}\\s*\\(`, "g");
    for (const match of findAll(callRe, text)) {
      if (match.index >= wrapper.start && match.index <= wrapper.end) continue;
      const call = splitCallArguments(text, match.index + match[0].length - 1, 3200);
      if (!call || call.args.length === 0) continue;

      if (wrapper.mode === "url-arg") {
        const rawUrlArg = call.args[wrapper.paramIndex ?? 0] || "";
        const url = resolveUrlExpression(rawUrlArg, stringConstants);
        if (!url || !looksLikeApiUrl(url)) continue;
        const method = resolveWrapperCallMethod(wrapper, call, stringConstants);
        const requestInference = inferRequestFromWrapperCallArgs(wrapper, call, method, text, match.index, functionRanges, webpackDataFlow);
        const responseInference = inferResponseFromSnippet(responseSnippetAfterCall(text, call.end));
        apiMatches.push({
          method,
          url: joinBaseUrl(wrapper.baseUrl, url),
          index: match.index,
          extractor: "request-wrapper-url-callsite",
          confidence: wrapper.baseUrl ? 0.86 : 0.8,
          metadata: {
            wrapperFunction: wrapper.name,
            wrapperParam: wrapper.param,
            wrapperMode: wrapper.mode,
            inferredBaseUrl: wrapper.baseUrl,
            rawExpression: rawUrlArg.trim().slice(0, 1000),
            ...requestInference,
            ...responseInference
          }
        });
        continue;
      }

      const objectArg = call.args.find((arg) => arg.trim().startsWith("{"));
      if (!objectArg) continue;
      const url = extractObjectUrl(objectArg, stringConstants, ["url", "uri", "path", "api", "apiUrl"]);
      if (!url || !looksLikeApiUrl(url)) continue;
      const method = extractObjectString(objectArg, ["method", "type", "meth"]) || wrapper.defaultMethod || "GET";
      const requestInference = inferRequestFromObjectBlock(objectArg, method, text, match.index, functionRanges, webpackDataFlow);
      const responseInference = inferResponseFromSnippet(responseSnippetAfterCall(text, call.end));
      apiMatches.push({
        method: method.toUpperCase(),
        url: joinBaseUrl(wrapper.baseUrl, url),
        index: match.index,
        extractor: "request-wrapper-object-callsite",
        confidence: wrapper.baseUrl ? 0.88 : 0.84,
        metadata: {
          wrapperFunction: wrapper.name,
          wrapperParam: wrapper.param,
          inferredBaseUrl: wrapper.baseUrl,
          rawExpression: objectArg.trim().slice(0, 1000),
          ...requestInference,
          ...responseInference
        }
      });
    }
  }

  for (const wrapper of requestWrappers) {
    if (wrapper.mode === "url-arg") continue;
    const fn = functionRanges.find((candidate) => candidate.name === wrapper.name && candidate.start === wrapper.start);
    const paramIndex = wrapper.paramIndex ?? 0;
    const callsiteMock = webpackParamMockForFunction(webpackDataFlow, fn, paramIndex);
    const url = callsiteMock.url || callsiteMock.uri || callsiteMock.path || callsiteMock.api || callsiteMock.apiUrl || "";
    if (!url || !looksLikeApiUrl(url)) continue;
    const method = callsiteMock.method || callsiteMock.type || callsiteMock.meth || wrapper.defaultMethod || "GET";
    const body = { ...callsiteMock };
    for (const key of ["url", "uri", "path", "api", "apiUrl", "method", "type", "meth", "headers", "header", "params", "query"]) delete body[key];
    const dataBody = callsiteMock.data && isPlainObject(callsiteMock.data) ? callsiteMock.data : body;
    apiMatches.push({
      method: String(method).toUpperCase(),
      url: joinBaseUrl(wrapper.baseUrl, url),
      index: wrapper.start,
      extractor: "request-wrapper-webpack-callsite",
      confidence: wrapper.baseUrl ? 0.86 : 0.82,
      metadata: {
        wrapperFunction: wrapper.name,
        wrapperParam: wrapper.param,
        inferredBaseUrl: wrapper.baseUrl,
        query: mergeMockObjects(callsiteMock.params || {}, callsiteMock.query || {}),
        body: dataBody,
        bodyKeys: Object.keys(dataBody),
        bodyInferenceSources: webpackDataFlow?.sources?.get(webpackParamMockKey(fn?.scopeId, fn?.name, paramIndex)) || []
      }
    });
  }

  for (const found of apiMatches) {
    const parsed = parseApiUrl(found.url);
    const metadataQuery = found.metadata?.query && typeof found.metadata.query === "object" ? found.metadata.query : {};
    const metadataBody = found.metadata?.body && typeof found.metadata.body === "object" ? found.metadata.body : {};
    const query = mergeMockObjects(parsed.query || {}, metadataQuery);
    const body = Object.keys(metadataBody).length > 0 ? metadataBody : found.metadata?.bodyKeys ? mockObjectFromKeys(found.metadata.bodyKeys) : {};
    const headers = mockHeadersFromSnippet(snippetAt(text, found.index));
    const responseMock = found.metadata?.responseMock || genericResponseMock();
    const api = {
      id: stableId("api", `${found.method}:${found.url}:${file}:${found.index}`),
      moduleId: "",
      featureId: "",
      name: `${found.method} ${parsed.path || found.url}`,
      method: found.method.toUpperCase(),
      url: maybeRedact(found.url, "api_url", options),
      baseUrl: maybeRedact(parsed.baseUrl, "api_base_url", options),
      path: parsed.path || found.url,
      headers,
      query,
      body,
      auth: inferAuthFromSnippet(snippetAt(text, found.index)),
      contentType: inferContentType(snippetAt(text, found.index)),
      requestMock: {
        method: found.method.toUpperCase(),
        url: maybeRedact(found.url, "api_url", options),
        headers,
        query,
        body
      },
      responseMock,
      cryptoIds: [],
      evidenceIds: [],
      confidence: found.confidence,
      metadata: {
        extractor: found.extractor,
        requestConstruction: "Static call-site extraction. Review wrapper/interceptor evidence for exact runtime construction.",
        ...found.metadata
      }
    };
    const ev = evidence(file, text, found.index, found.extractor, found.confidence);
    addEvidence(shard, api, ev);
    shard.apis.push(api);
  }
}

function extractCallGraphHints(shard, file, text, options) {
  const functions = collectFunctionBlocks(text);
  for (const fn of functions.slice(0, 300)) {
    const calls = collectCalls(fn.body)
      .filter((callee) => callee && callee !== fn.name)
      .filter((callee) => !["if", "for", "while", "switch", "return", "function", "console.log"].includes(callee));

    for (const callee of [...new Set(calls)].slice(0, 50)) {
      const edge = {
        id: stableId("call", `${file}:${fn.name}->${callee}:${fn.line}`),
        type: "callEdge",
        caller: fn.name,
        callee,
        file,
        files: [file],
        line: fn.line,
        evidenceIds: [],
        confidence: fn.mode === "function-body" ? 0.72 : 0.58,
        metadata: {
          mode: "lightweight-ast",
          sourceMapParent: options.sourceMapParent || "",
          virtualSource: options.virtualSource || ""
        }
      };
      const ev = evidence(file, text, fn.index, "call-graph-lightweight-ast", edge.confidence);
      addEvidence(shard, edge, ev);
      shard.callGraph.push(edge);
    }
  }

  const webpackFlow = collectWebpackModuleDataFlow(text, collectNamedFunctionRanges(text));
  for (const edgeInfo of webpackFlow.exportEdges || []) {
    const edge = {
      id: stableId("call", `${file}:module:${edgeInfo.moduleId}:export:${edgeInfo.exportAlias}:${edgeInfo.localName}`),
      type: "webpackExportEdge",
      caller: `webpack:${edgeInfo.moduleId}:export.${edgeInfo.exportAlias}`,
      callee: `webpack:${edgeInfo.moduleId}:${edgeInfo.localName}`,
      file,
      files: [file],
      line: edgeInfo.line || 0,
      evidenceIds: [],
      confidence: edgeInfo.confidence || 0.82,
      metadata: {
        mode: "webpack-module-export-alias",
        moduleId: edgeInfo.moduleId,
        exportAlias: edgeInfo.exportAlias,
        localName: edgeInfo.localName,
        sourceMapParent: options.sourceMapParent || "",
        virtualSource: options.virtualSource || ""
      }
    };
    const ev = evidence(file, text, Math.max(0, lineStartIndex(text, edge.line)), "webpack-module-export-alias", edge.confidence);
    addEvidence(shard, edge, ev);
    shard.callGraph.push(edge);
  }

  for (const edgeInfo of webpackFlow.importEdges || []) {
    const edge = {
      id: stableId("call", `${file}:module:${edgeInfo.fromModuleId}:import:${edgeInfo.importAlias}.${edgeInfo.exportAlias}->${edgeInfo.toModuleId}:${edgeInfo.localName}:${edgeInfo.line}`),
      type: "webpackImportEdge",
      caller: `webpack:${edgeInfo.fromModuleId}:${edgeInfo.importAlias}.${edgeInfo.exportAlias}`,
      callee: `webpack:${edgeInfo.toModuleId}:${edgeInfo.localName}`,
      file,
      files: [file],
      line: edgeInfo.line || 0,
      evidenceIds: [],
      confidence: edgeInfo.confidence || 0.86,
      metadata: {
        mode: "webpack-module-import-alias",
        fromModuleId: edgeInfo.fromModuleId,
        importAlias: edgeInfo.importAlias,
        toModuleId: edgeInfo.toModuleId,
        exportAlias: edgeInfo.exportAlias,
        localName: edgeInfo.localName,
        sourceMapParent: options.sourceMapParent || "",
        virtualSource: options.virtualSource || ""
      }
    };
    const ev = evidence(file, text, Math.max(0, lineStartIndex(text, edge.line)), "webpack-module-import-alias", edge.confidence);
    addEvidence(shard, edge, ev);
    shard.callGraph.push(edge);
  }
}

function collectFunctionBlocks(text) {
  const found = [];
  const patterns = [
    { re: /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g, group: 1 },
    { re: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\([^)]*\)\s*\{/g, group: 1 },
    { re: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g, group: 1 },
    { re: /\b([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function\s*\([^)]*\)\s*\{/g, group: 1 },
    { re: /\b([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g, group: 1 }
  ];

  for (const pattern of patterns) {
    for (const match of findAll(pattern.re, text)) {
      const bodyStart = text.indexOf("{", match.index);
      const bodyEnd = findMatchingBrace(text, bodyStart);
      if (bodyStart < 0 || bodyEnd <= bodyStart) continue;
      found.push({
        name: match[pattern.group],
        index: match.index,
        line: lineNumberAt(text, match.index),
        body: text.slice(bodyStart + 1, bodyEnd),
        mode: "function-body"
      });
    }
  }

  return dedupeBy(found, (item) => `${item.name}:${item.index}`);
}

function findMatchingBrace(text, openIndex) {
  if (openIndex < 0 || text[openIndex] !== "{") return -1;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function collectCalls(body) {
  const calls = [];
  const callRe = /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/g;
  for (const match of findAll(callRe, body)) calls.push(match[1]);
  return calls;
}

function dedupeBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function collectApiMatches(target, text, regex, defaultMethod, urlGroup, extractor, methodGroup = null, stringConstants = {}) {
  for (const match of findAll(regex, text)) {
    const url = resolveUrlExpression(match[urlGroup], stringConstants);
    if (!url || !looksLikeApiUrl(url)) continue;
    const method = methodGroup ? match[methodGroup] : defaultMethod;
    target.push({
      method: String(method || "GET").toUpperCase(),
      url,
      index: match.index,
      extractor,
      confidence: 0.85,
      metadata: {}
    });
  }
}

function extractStringConstants(text) {
  const constants = {};
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`]{1,1000})\2/g;
  for (const match of findAll(re, text)) constants[match[1]] = match[3];
  return constants;
}

function extractClientBaseUrls(text, constants) {
  const clients = {};
  const createRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*axios\.create\s*\(\s*\{([\s\S]{0,1200}?)\}\s*\)/gi;
  for (const match of findAll(createRe, text)) {
    const name = match[1];
    const block = match[2];
    let base = extractObjectUrl(block, constants, ["baseURL", "baseUrl", "base_url", "host", "domain"]);
    if (!base) {
      for (const key of ["baseURL", "baseUrl", "base_url", "host", "domain"]) {
        if (new RegExp(`(?:^|[,\\s])${escapeRegex(key)}(?:[,\\s}]|$)`).test(block) && constants[key]) {
          base = constants[key];
          break;
        }
      }
    }
    if (base) clients[name] = base;
  }

  const assignmentRe = /\b([A-Za-z_$][\w$]*)\.defaults\.baseURL\s*=\s*([^;\n]{1,500})/gi;
  for (const match of findAll(assignmentRe, text)) {
    const base = resolveUrlExpression(match[2], constants);
    if (base) clients[match[1]] = base;
  }
  return clients;
}

function collectRequestWrapperFunctions(text, functionRanges, constants) {
  const wrappers = [];
  for (const fn of functionRanges || []) {
    if (!fn.name || !fn.params?.length) continue;
    const body = text.slice(fn.bodyStart, fn.end);
    if (!/\b(?:wx|uni|Taro)\.request\s*\(|\bfetch\s*\(|\b(?:axios|request|http|ajax|service|client)\s*\(/.test(body)) continue;
    const objectParam = fn.params.find((name) => new RegExp(`\\b${escapeRegex(name)}\\s*\\.\\s*(?:url|uri|path|api|apiUrl|method|type|meth|data|params|header|headers)\\b`).test(body));
    if (objectParam && new RegExp(`\\b${escapeRegex(objectParam)}\\s*\\.\\s*(?:url|uri|path|api|apiUrl)\\b`).test(body)) {
      const baseUrl =
        inferWrapperBaseUrl(body, objectParam, constants, "object") ||
        inferWrapperBaseUrl(text.slice(Math.max(0, fn.scopeStart), Math.min(text.length, fn.scopeEnd)), objectParam, constants, "object");
      const defaultMethod = inferWrapperDefaultMethod(body, objectParam) || inferMethodFromWrapperName(fn.name);
      wrappers.push({
        name: fn.name,
        param: objectParam,
        paramIndex: fn.params.indexOf(objectParam),
        mode: "object",
        scopeId: fn.scopeId || "",
        start: fn.start,
        end: fn.end,
        baseUrl,
        defaultMethod,
        confidence: baseUrl ? 0.88 : 0.82
      });
      continue;
    }

    const urlParamInfo = inferWrapperUrlParam(body, fn.params);
    if (!urlParamInfo) continue;
    const methodParam = inferWrapperParamForProperty(body, fn.params, ["method", "type", "meth"], [urlParamInfo.param]);
    const dataParam = inferWrapperParamForProperty(body, fn.params, ["data", "body", "payload"], [urlParamInfo.param, methodParam?.param].filter(Boolean));
    const queryParam = inferWrapperParamForProperty(body, fn.params, ["params", "query"], [urlParamInfo.param, methodParam?.param, dataParam?.param].filter(Boolean));
    const baseUrl =
      inferWrapperBaseUrl(body, urlParamInfo.param, constants, "url-arg", urlParamInfo.expression) ||
      inferWrapperBaseUrl(text.slice(Math.max(0, fn.scopeStart), Math.min(text.length, fn.scopeEnd)), urlParamInfo.param, constants, "url-arg", urlParamInfo.expression);
    const defaultMethod = inferWrapperDefaultMethod(body, methodParam?.param || "") || inferMethodFromWrapperName(fn.name);
    wrappers.push({
      name: fn.name,
      param: urlParamInfo.param,
      paramIndex: fn.params.indexOf(urlParamInfo.param),
      mode: "url-arg",
      methodParam: methodParam?.param || "",
      methodParamIndex: methodParam ? fn.params.indexOf(methodParam.param) : undefined,
      dataParam: dataParam?.param || "",
      dataParamIndex: dataParam ? fn.params.indexOf(dataParam.param) : undefined,
      queryParam: queryParam?.param || "",
      queryParamIndex: queryParam ? fn.params.indexOf(queryParam.param) : undefined,
      scopeId: fn.scopeId || "",
      start: fn.start,
      end: fn.end,
      baseUrl,
      defaultMethod,
      confidence: baseUrl ? 0.86 : 0.78
    });
  }
  return dedupeBy(wrappers, (item) => `${item.name}:${item.mode}:${item.param}:${item.start}`);
}

function inferWrapperUrlParam(body, params) {
  const urlExpression = extractObjectPropertyExpression(body, ["url", "uri", "path", "api", "apiUrl"]);
  if (urlExpression) {
    for (const param of params || []) {
      if (expressionMentionsIdentifier(urlExpression, param)) {
        return { param, expression: urlExpression };
      }
    }
  }

  for (const param of params || []) {
    const directCallPattern = new RegExp(`\\b(?:fetch|axios|request|http|ajax|service|client)\\s*\\(\\s*${escapeRegex(param)}\\b|\\b(?:axios|request|http|ajax|service|client)\\s*\\.\\s*(?:get|post|put|patch|delete|head|options)\\s*\\(\\s*${escapeRegex(param)}\\b`);
    if (directCallPattern.test(body)) return { param, expression: param };
  }

  return null;
}

function inferWrapperParamForProperty(body, params, keys, excluded = []) {
  const expr = extractObjectPropertyExpression(body, keys);
  if (!expr) return null;
  const excludedSet = new Set(excluded);
  for (const param of params || []) {
    if (excludedSet.has(param)) continue;
    if (expressionMentionsIdentifier(expr, param)) return { param, expression: expr };
  }
  return null;
}

function expressionMentionsIdentifier(expression, name) {
  return new RegExp(`\\b${escapeRegex(name)}\\b`).test(String(expression || ""));
}

function inferWrapperBaseUrl(body, param, constants, mode = "object", urlExpression = "") {
  const propertyPattern = mode === "url-arg"
    ? `\\b${escapeRegex(param)}\\b`
    : `\\b${escapeRegex(param)}\\s*\\.\\s*(?:url|uri|path|api|apiUrl)\\b`;
  const haystack = urlExpression || body;
  const patterns = [
    new RegExp(`([^;\\n]{0,500})\\+\\s*${propertyPattern}`, "i"),
    new RegExp(`${propertyPattern}\\s*\\+\\s*([^;\\n]{0,500})`, "i")
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(haystack);
    if (!match) continue;
    const resolved = resolveUrlExpression(match[1], constants);
    if (resolved && /^(?:https?:\/\/|\/\/|\$\{)/i.test(resolved)) return resolved;
  }
  return "";
}

function inferWrapperDefaultMethod(body, param) {
  const methodProperty = param ? new RegExp(`\\b${escapeRegex(param)}\\s*\\.\\s*(?:method|type|meth)\\b`, "i") : null;
  if (methodProperty && methodProperty.test(body)) return "";
  const methodLiteral = /\bmethod\s*:\s*(?:[A-Za-z_$][\w$]*\s*(?:\|\||\?\?)\s*)?(['"`])([A-Z]+)\1/i.exec(body);
  return methodLiteral?.[2]?.toUpperCase() || "";
}

function inferMethodFromWrapperName(name) {
  const match = /(?:^|[_$.-])(get|post|put|patch|delete|head|options)(?:$|[A-Z_$.:-])/i.exec(String(name || ""));
  return match ? match[1].toUpperCase() : "";
}

function resolveWrapperCallMethod(wrapper, call, constants) {
  let method = wrapper.defaultMethod || inferMethodFromWrapperName(wrapper.name) || "GET";
  if (Number.isInteger(wrapper.methodParamIndex)) {
    const resolved = resolveUrlExpression(call.args[wrapper.methodParamIndex] || "", constants);
    if (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(resolved)) method = resolved;
  }
  return String(method || "GET").toUpperCase();
}

function inferRequestFromWrapperCallArgs(wrapper, call, method, text, index, functionRanges, dataFlow = null) {
  const upperMethod = String(method || "GET").toUpperCase();
  const query = {};
  let body = {};
  const inferenceSources = [];

  if (Number.isInteger(wrapper.queryParamIndex)) {
    const queryArg = call.args[wrapper.queryParamIndex] || "";
    const queryMock = inferMockFromArgument(queryArg, text, index, functionRanges, dataFlow);
    Object.assign(query, queryMock);
    inferenceSources.push(...webpackParamInferenceSources(dataFlow, text, index, functionRanges, [queryArg]));
  }

  if (Number.isInteger(wrapper.dataParamIndex)) {
    const dataArg = call.args[wrapper.dataParamIndex] || "";
    const dataMock = inferMockFromArgument(dataArg, text, index, functionRanges, dataFlow);
    if (["GET", "HEAD"].includes(upperMethod)) Object.assign(query, dataMock);
    else body = mergeMockObjects(body, dataMock);
    inferenceSources.push(...webpackParamInferenceSources(dataFlow, text, index, functionRanges, [dataArg]));
  }

  if (!Number.isInteger(wrapper.queryParamIndex) && !Number.isInteger(wrapper.dataParamIndex)) {
    const fallbackArg = call.args.find((arg, argIndex) =>
      argIndex !== wrapper.paramIndex &&
      argIndex !== wrapper.methodParamIndex &&
      arg.trim().startsWith("{")
    );
    if (fallbackArg) {
      const fallbackMock = inferMockFromArgument(fallbackArg, text, index, functionRanges, dataFlow);
      if (["GET", "HEAD"].includes(upperMethod)) Object.assign(query, fallbackMock);
      else body = mergeMockObjects(body, fallbackMock);
      inferenceSources.push(...webpackParamInferenceSources(dataFlow, text, index, functionRanges, [fallbackArg]));
    }
  }

  return {
    query,
    body,
    queryKeys: Object.keys(query),
    bodyKeys: Object.keys(body),
    bodyInferenceSources: inferenceSources
  };
}

function resolveUrlExpression(expression, constants) {
  const expr = String(expression || "").trim();
  if (!expr) return "";

  const literal = /^(['"`])([\s\S]{0,1000})\1$/.exec(expr);
  if (literal) return resolveTemplateLiteral(literal[2], constants);

  const bare = /^([A-Za-z_$][\w$]*)$/.exec(expr);
  if (bare && constants[bare[1]]) return constants[bare[1]];
  if (bare) return "";

  const varPlusLiteral = /^([A-Za-z_$][\w$]*)\s*\+\s*(['"`])([^'"`]{0,800})\2$/.exec(expr);
  if (varPlusLiteral) return `${constants[varPlusLiteral[1]] || `\${${varPlusLiteral[1]}}`}${varPlusLiteral[3]}`;

  const literalPlusVar = /^(['"`])([^'"`]{0,800})\1\s*\+\s*([A-Za-z_$][\w$]*)$/.exec(expr);
  if (literalPlusVar) return `${literalPlusVar[2]}${constants[literalPlusVar[3]] || `\${${literalPlusVar[3]}}`}`;

  const multiPart = expr.split("+").map((part) => part.trim()).filter(Boolean);
  if (multiPart.length > 1 && multiPart.length <= 8) {
    let hasUnresolvedPart = false;
    let hasConcretePathPart = false;
    const resolved = multiPart.map((part) => {
      const partLiteral = /^(['"`])([\s\S]{0,800})\1$/.exec(part);
      if (partLiteral) {
        const value = resolveTemplateLiteral(partLiteral[2], constants);
        if (hasConcreteApiPath(value)) hasConcretePathPart = true;
        return value;
      }
      const partBare = /^([A-Za-z_$][\w$]*)$/.exec(part);
      if (partBare) {
        if (constants[partBare[1]]) {
          const value = constants[partBare[1]];
          if (hasConcreteApiPath(value)) hasConcretePathPart = true;
          return value;
        }
        hasUnresolvedPart = true;
        return `\${${partBare[1]}}`;
      }
      const memberExpr = /^([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)+)$/.exec(part);
      if (memberExpr) {
        hasUnresolvedPart = true;
        return `\${${memberExpr[1].replace(/\s+/g, "")}}`;
      }
      hasUnresolvedPart = true;
      return "";
    }).join("");
    if (hasUnresolvedPart && !hasConcretePathPart) return "";
    if (resolved) return resolved;
  }

  if (/^(?:https?:\/\/|wss?:\/\/|ws:\/\/|\/\/|\/|\$\{)/i.test(expr) || /^`/.test(expr) || /['"]/.test(expr)) {
    return resolveTemplateLiteral(expr, constants);
  }
  return "";
}

function resolveTemplateLiteral(value, constants) {
  return String(value || "").replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (_, name) => constants[name] || `\${${name}}`);
}

function looksLikeApiUrl(value) {
  return /^(?:https?:\/\/|wss?:\/\/|ws:\/\/|\/\/|\/|\$\{)/i.test(value) || /\/[A-Za-z0-9_-]+/.test(value);
}

function hasConcreteApiPath(value) {
  const text = String(value || "");
  if (/^\/(?!\/)[A-Za-z0-9_.~-]/.test(text)) return true;
  try {
    const parsed = new URL(text);
    return Boolean(parsed.pathname && parsed.pathname !== "/");
  } catch {
    return /\/(?:api|webapi|gateway|service|v\d+|pages?|rest|graphql)\b/i.test(text);
  }
}

function joinBaseUrl(base, url) {
  if (!base || /^(?:https?:)?\/\//i.test(url)) return url;
  if (!url.startsWith("/")) return url;
  return `${base.replace(/\/+$/, "")}${url}`;
}

function extractObjectUrl(block, constants, keys) {
  for (const key of keys) {
    const expr = extractObjectPropertyExpression(block, [key]);
    if (!expr) continue;
    const resolved = resolveUrlExpression(expr, constants);
    if (resolved) return resolved;
  }
  return "";
}

function extractObjectString(block, keys) {
  for (const key of keys) {
    const expr = extractObjectPropertyExpression(block, [key]);
    if (!expr) continue;
    const match = /^(['"`])([^'"`]{1,800})\1$/.exec(expr.trim());
    if (match) return match[2];
  }
  return "";
}

function splitCallArguments(text, openParenIndex, maxChars = 2400) {
  if (text[openParenIndex] !== "(") return null;
  const args = [];
  let start = openParenIndex + 1;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quote = "";
  let escaped = false;
  const maxIndex = Math.min(text.length, openParenIndex + maxChars);

  for (let i = openParenIndex + 1; i < maxIndex; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }

    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      parenDepth += 1;
      continue;
    }
    if (ch === "[") {
      bracketDepth += 1;
      continue;
    }
    if (ch === "{") {
      braceDepth += 1;
      continue;
    }
    if (ch === ")" && parenDepth > 0) {
      parenDepth -= 1;
      continue;
    }
    if (ch === "]" && bracketDepth > 0) {
      bracketDepth -= 1;
      continue;
    }
    if (ch === "}" && braceDepth > 0) {
      braceDepth -= 1;
      continue;
    }
    if (ch === "," && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
      continue;
    }
    if (ch === ")" && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      const last = text.slice(start, i).trim();
      if (last || args.length > 0) args.push(last);
      return { args, end: i };
    }
  }

  return null;
}

function collectNamedFunctionRanges(text) {
  const moduleRanges = collectModuleRanges(text);
  const ranges = [];
  const declarationRe = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  for (const match of findAll(declarationRe, text)) {
    const open = match.index + match[0].length - 1;
    const end = findMatchingBrace(text, open);
    if (end === -1) continue;
    const moduleScope = findEnclosingModule(moduleRanges, match.index);
    ranges.push({
      name: match[1],
      params: splitParamNames(match[2]),
      start: match.index,
      bodyStart: open + 1,
      end,
      scopeStart: moduleScope?.bodyStart ?? 0,
      scopeEnd: moduleScope?.end ?? text.length,
      scopeKind: moduleScope ? "bundle-module" : "file",
      scopeId: moduleScope?.id || ""
    });
  }

  const arrowRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>\s*\{/g;
  for (const match of findAll(arrowRe, text)) {
    const open = match.index + match[0].length - 1;
    const end = findMatchingBrace(text, open);
    if (end === -1) continue;
    const moduleScope = findEnclosingModule(moduleRanges, match.index);
    ranges.push({
      name: match[1],
      params: splitParamNames(match[2] || match[3] || ""),
      start: match.index,
      bodyStart: open + 1,
      end,
      scopeStart: moduleScope?.bodyStart ?? 0,
      scopeEnd: moduleScope?.end ?? text.length,
      scopeKind: moduleScope ? "bundle-module" : "file",
      scopeId: moduleScope?.id || ""
    });
  }

  const expressionRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\(([^)]*)\)\s*\{/g;
  for (const match of findAll(expressionRe, text)) {
    const open = match.index + match[0].length - 1;
    const end = findMatchingBrace(text, open);
    if (end === -1) continue;
    const moduleScope = findEnclosingModule(moduleRanges, match.index);
    ranges.push({
      name: match[1],
      params: splitParamNames(match[2] || ""),
      start: match.index,
      bodyStart: open + 1,
      end,
      scopeStart: moduleScope?.bodyStart ?? 0,
      scopeEnd: moduleScope?.end ?? text.length,
      scopeKind: moduleScope ? "bundle-module" : "file",
      scopeId: moduleScope?.id || ""
    });
  }

  return ranges.sort((a, b) => a.start - b.start);
}

function collectModuleRanges(text) {
  const ranges = [];
  const patterns = [
    { re: /(?:^|[,{])\s*([A-Za-z_$][\w$]*|\d+)\s*:\s*function\s*\([^)]*\)\s*\{/g, group: 1, kind: "webpack-object-function" },
    { re: /(?:^|[,{])\s*([A-Za-z_$][\w$]*|\d+)\s*:\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g, group: 1, kind: "webpack-object-arrow" },
    { re: /\bdefine\s*\(\s*(['"`])([^'"`]{1,240})\1\s*,\s*function\s*\([^)]*\)\s*\{/g, group: 2, kind: "amd-define" },
    { re: /(?:^|[,\[])\s*(\d+)\s*:\s*\[\s*function\s*\([^)]*\)\s*\{/g, group: 1, kind: "browserify-module" }
  ];

  for (const pattern of patterns) {
    for (const match of findAll(pattern.re, text)) {
      const open = match.index + match[0].lastIndexOf("{");
      const end = findMatchingBrace(text, open);
      if (open < 0 || end <= open) continue;
      ranges.push({
        id: `${pattern.kind}:${match[pattern.group]}`,
        kind: pattern.kind,
        start: match.index,
        bodyStart: open + 1,
        end
      });
    }
  }

  return dedupeBy(ranges, (item) => `${item.id}:${item.start}`)
    .sort((a, b) => a.start - b.start || b.end - a.end);
}

function findEnclosingModule(moduleRanges, index) {
  let found = null;
  for (const candidate of moduleRanges || []) {
    if (candidate.start <= index && index <= candidate.end) {
      if (!found || candidate.start >= found.start) found = candidate;
    }
  }
  return found;
}

function splitParamNames(raw) {
  return String(raw || "")
    .split(",")
    .map((part) => part.trim().replace(/=.*/, "").trim())
    .filter((part) => /^[A-Za-z_$][\w$]*$/.test(part));
}

function findEnclosingFunction(functionRanges, index) {
  let found = null;
  for (const fn of functionRanges || []) {
    if (fn.start <= index && index <= fn.end) {
      if (!found || fn.start >= found.start) found = fn;
    }
  }
  return found;
}

function inferRequestFromMethodArgs(method, args, text, index, functionRanges, dataFlow = null) {
  const upperMethod = String(method || "GET").toUpperCase();
  const second = args[1] || "";
  const third = args[2] || "";
  const secondMock = inferMockFromArgument(second, text, index, functionRanges, dataFlow);
  const thirdMock = inferMockFromArgument(third, text, index, functionRanges, dataFlow);
  const query = {};
  let body = {};
  const inferenceSources = [];

  if (Object.keys(secondMock).length > 0) {
    if (secondMock.params && isPlainObject(secondMock.params)) {
      Object.assign(query, secondMock.params);
      const remaining = { ...secondMock };
      delete remaining.params;
      delete remaining.headers;
      if (!["GET", "HEAD"].includes(upperMethod) && Object.keys(remaining).length > 0) body = mergeMockObjects(body, remaining);
    } else if (secondMock.data && isPlainObject(secondMock.data)) {
      body = mergeMockObjects(body, secondMock.data);
    } else if (["GET", "HEAD"].includes(upperMethod)) {
      Object.assign(query, secondMock);
    } else {
      body = mergeMockObjects(body, secondMock);
    }
  }

  if (thirdMock.params && isPlainObject(thirdMock.params)) Object.assign(query, thirdMock.params);
  const flowSources = webpackParamInferenceSources(dataFlow, text, index, functionRanges, [second, third]);
  inferenceSources.push(...flowSources);

  return {
    query,
    body,
    queryKeys: Object.keys(query),
    bodyKeys: Object.keys(body),
    bodyInferenceSources: inferenceSources
  };
}

function inferRequestFromObjectBlock(block, method, text = "", index = 0, functionRanges = [], dataFlow = null) {
  const upperMethod = String(method || "GET").toUpperCase();
  const paramsExpr = extractObjectPropertyExpression(block, ["params", "query"]);
  const dataExpr = extractObjectPropertyExpression(block, ["data", "body", "payload"]);
  const paramsMock = inferMockFromArgument(paramsExpr, text, index, functionRanges, dataFlow);
  const dataMock = inferMockFromArgument(dataExpr, text, index, functionRanges, dataFlow);
  const query = { ...paramsMock };
  let body = {};
  const inferenceSources = webpackParamInferenceSources(dataFlow, text, index, functionRanges, [paramsExpr, dataExpr]);

  if (Object.keys(dataMock).length > 0) {
    if (["GET", "HEAD"].includes(upperMethod)) Object.assign(query, dataMock);
    else body = dataMock;
  }

  return {
    query,
    body,
    queryKeys: Object.keys(query),
    bodyKeys: Object.keys(body),
    bodyInferenceSources: inferenceSources
  };
}

function inferMockFromArgument(rawArg, text, index, functionRanges, dataFlow = null) {
  const expr = String(rawArg || "").trim();
  if (!expr) return {};
  const literal = extractObjectMockFromExpression(expr);
  if (Object.keys(literal).length > 0) return literal;

  const jsonIdentifier = /^JSON\.stringify\s*\(\s*([A-Za-z_$][\w$]*)\s*\)$/.exec(expr);
  if (jsonIdentifier) return inferIdentifierMockFromCallsites(jsonIdentifier[1], text, index, functionRanges, dataFlow);

  const identifier = /^([A-Za-z_$][\w$]*)$/.exec(expr);
  if (!identifier) return {};
  return inferIdentifierMockFromCallsites(identifier[1], text, index, functionRanges, dataFlow);
}

function inferIdentifierMockFromCallsites(identifier, text, index, functionRanges, dataFlow = null) {
  const fn = findEnclosingFunction(functionRanges, index);
  if (!fn || !fn.name) return {};
  const paramIndex = fn.params.indexOf(identifier);
  if (paramIndex === -1) return {};

  const merged = {};
  const callRe = new RegExp(`\\b${escapeRegex(fn.name)}\\s*\\(`, "g");
  let inspected = 0;
  const scopeStart = Number.isFinite(fn.scopeStart) ? fn.scopeStart : 0;
  const scopeEnd = Number.isFinite(fn.scopeEnd) ? fn.scopeEnd : text.length;
  for (const match of findAll(callRe, text)) {
    if (match.index < scopeStart || match.index > scopeEnd) continue;
    if (match.index >= fn.start && match.index <= fn.end) continue;
    const caller = findEnclosingFunction(functionRanges, match.index);
    if (caller?.scopeId && fn.scopeId && caller.scopeId !== fn.scopeId) continue;
    const call = splitCallArguments(text, match.index + match[0].length - 1, 2200);
    if (!call || !call.args[paramIndex]) continue;
    const mock = extractObjectMockFromExpression(call.args[paramIndex]);
    if (Object.keys(mock).length === 0) continue;
    Object.assign(merged, mock);
    inspected += 1;
    if (inspected >= 20) break;
  }
  const crossModuleMock = webpackParamMockForFunction(dataFlow, fn, paramIndex);
  if (Object.keys(crossModuleMock).length > 0) Object.assign(merged, crossModuleMock);
  return merged;
}

function collectWebpackModuleDataFlow(text, functionRanges = []) {
  const moduleRanges = collectModuleRanges(text)
    .filter((range) => /webpack|browserify/.test(range.kind))
    .map((range) => ({
      ...range,
      rawId: rawModuleId(range.id),
      params: parseModuleFactoryParams(text, range),
      body: text.slice(range.bodyStart, range.end)
    }))
    .filter((range) => range.rawId);
  if (moduleRanges.length < 2) {
    return { modules: new Map(), functionParamMocks: new Map(), sources: new Map(), exportEdges: [], importEdges: [] };
  }

  const modules = new Map();
  for (const moduleRange of moduleRanges) {
    const moduleInfo = {
      id: moduleRange.rawId,
      scopeId: moduleRange.id,
      start: moduleRange.start,
      bodyStart: moduleRange.bodyStart,
      end: moduleRange.end,
      body: moduleRange.body,
      params: moduleRange.params,
      moduleParam: moduleRange.params[0] || "",
      exportsParam: moduleRange.params[1] || "",
      requireParam: moduleRange.params[2] || "__webpack_require__",
      exports: new Map(),
      imports: new Map(),
      importAliases: new Map()
    };
    collectWebpackExports(text, moduleRange, moduleInfo);
    collectWebpackImports(text, moduleRange, moduleInfo);
    modules.set(moduleInfo.id, moduleInfo);
  }

  const functionParamMocks = new Map();
  const sources = new Map();
  const importEdges = [];
  const exportEdges = [];
  for (const moduleInfo of modules.values()) {
    for (const [alias, exported] of moduleInfo.exports.entries()) {
      exportEdges.push({
        moduleId: moduleInfo.id,
        exportAlias: alias,
        localName: exported.localName,
        line: exported.line,
        confidence: exported.confidence
      });
    }

    const importNames = [...moduleInfo.imports.keys(), ...moduleInfo.importAliases.keys()];
    for (const importName of importNames) {
      const importedModuleId = resolveWebpackImportModule(moduleInfo, importName);
      const targetModule = modules.get(importedModuleId);
      if (!targetModule) continue;
      const callRe = new RegExp(`\\b${escapeRegex(importName)}\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(`, "g");
      const bodyOffset = moduleInfo.bodyStart;
      for (const match of findAll(callRe, moduleInfo.body)) {
        const exportAlias = match[1];
        const exported = targetModule.exports.get(exportAlias);
        if (!exported?.localName) continue;
        const callOpen = bodyOffset + match.index + match[0].length - 1;
        const call = splitCallArguments(text, callOpen, 3000);
        if (!call) continue;
        const targetFn = findWebpackFunction(functionRanges, targetModule.scopeId, exported.localName);
        if (!targetFn) continue;
        importEdges.push({
          fromModuleId: moduleInfo.id,
          importAlias: importName,
          toModuleId: targetModule.id,
          exportAlias,
          localName: exported.localName,
          line: lineNumberAt(text, callOpen),
          confidence: 0.86
        });
        for (let paramIndex = 0; paramIndex < Math.min(call.args.length, targetFn.params.length); paramIndex += 1) {
          const mock = extractObjectMockFromExpression(call.args[paramIndex]);
          if (Object.keys(mock).length === 0) continue;
          const key = webpackParamMockKey(targetFn.scopeId, targetFn.name, paramIndex);
          functionParamMocks.set(key, mergeMockObjects(functionParamMocks.get(key) || {}, mock));
          const source = {
            fromModuleId: moduleInfo.id,
            importAlias: importName,
            toModuleId: targetModule.id,
            exportAlias,
            localName: exported.localName,
            param: targetFn.params[paramIndex] || "",
            paramIndex,
            bodyKeys: Object.keys(mock),
            line: lineNumberAt(text, callOpen),
            mode: "webpack-export-import-alias"
          };
          const existing = sources.get(key) || [];
          existing.push(source);
          sources.set(key, existing);
        }
      }
    }
  }

  return { modules, functionParamMocks, sources, exportEdges, importEdges };
}

function collectWebpackExports(text, moduleRange, moduleInfo) {
  const reqNames = [moduleInfo.requireParam, "__webpack_require__"].filter(Boolean);
  for (const reqName of reqNames) {
    const exportCallRe = new RegExp(`\\b${escapeRegex(reqName)}\\.d\\s*\\(`, "g");
    for (const match of findAll(exportCallRe, moduleInfo.body)) {
      const open = moduleRange.bodyStart + match.index + match[0].length - 1;
      const call = splitCallArguments(text, open, 3500);
      if (!call || call.args.length < 2) continue;
      const firstArg = call.args[0].trim();
      if (moduleInfo.exportsParam && firstArg !== moduleInfo.exportsParam) continue;
      for (const exported of parseWebpackExportObject(call.args[1])) {
        moduleInfo.exports.set(exported.alias, {
          ...exported,
          line: lineNumberAt(text, open),
          confidence: 0.88
        });
      }
    }
  }

  if (moduleInfo.exportsParam) {
    const assignRe = new RegExp(`\\b${escapeRegex(moduleInfo.exportsParam)}\\.([A-Za-z_$][\\w$]*)\\s*=\\s*([A-Za-z_$][\\w$]*)`, "g");
    for (const match of findAll(assignRe, moduleInfo.body)) {
      moduleInfo.exports.set(match[1], {
        alias: match[1],
        localName: match[2],
        line: lineNumberAt(text, moduleRange.bodyStart + match.index),
        confidence: 0.8
      });
    }
  }
}

function parseWebpackExportObject(rawObject) {
  let expr = String(rawObject || "").trim();
  if (!expr.startsWith("{")) return [];
  const end = findMatchingBrace(expr, 0);
  if (end === -1) return [];
  expr = expr.slice(1, end);
  const out = [];
  for (const part of splitTopLevel(expr, ",")) {
    const colon = findTopLevelColon(part);
    if (colon === -1) continue;
    const alias = cleanObjectKey(part.slice(0, colon));
    const getter = part.slice(colon + 1).trim();
    const localName =
      /\breturn\s+([A-Za-z_$][\w$]*)\b/.exec(getter)?.[1] ||
      /=>\s*\(?\s*([A-Za-z_$][\w$]*)\b/.exec(getter)?.[1] ||
      /^([A-Za-z_$][\w$]*)$/.exec(getter)?.[1] ||
      "";
    if (alias && localName) out.push({ alias, localName });
  }
  return out;
}

function collectWebpackImports(text, moduleRange, moduleInfo) {
  const reqNames = [moduleInfo.requireParam, "__webpack_require__"].filter(Boolean);
  const reqPattern = reqNames.map(escapeRegex).join("|");
  if (!reqPattern) return;

  const declarationRe = /\b(?:var|let|const)\s+([^;]{1,2500})/g;
  for (const match of findAll(declarationRe, moduleInfo.body)) {
    for (const part of splitTopLevel(match[1], ",")) {
      const importMatch = new RegExp(`^\\s*([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${reqPattern})\\s*\\(\\s*(['"]?)([A-Za-z0-9_$.-]+)\\2\\s*\\)`).exec(part);
      if (importMatch) {
        moduleInfo.imports.set(importMatch[1], importMatch[3]);
        continue;
      }
      const aliasMatch = /^\s*([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*$/.exec(part);
      if (aliasMatch && moduleInfo.imports.has(aliasMatch[2])) {
        moduleInfo.importAliases.set(aliasMatch[1], aliasMatch[2]);
      }
    }
  }
}

function parseModuleFactoryParams(text, range) {
  const header = text.slice(range.start, range.bodyStart);
  const open = header.lastIndexOf("(");
  const close = header.lastIndexOf(")");
  if (open === -1 || close === -1 || close <= open) return [];
  return splitParamNames(header.slice(open + 1, close));
}

function rawModuleId(scopeId) {
  return String(scopeId || "").split(":").pop() || "";
}

function findWebpackFunction(functionRanges, scopeId, name) {
  return (functionRanges || []).find((fn) => fn.scopeId === scopeId && fn.name === name);
}

function resolveWebpackImportModule(moduleInfo, importName) {
  if (moduleInfo.imports.has(importName)) return moduleInfo.imports.get(importName);
  const aliasTarget = moduleInfo.importAliases.get(importName);
  return aliasTarget ? moduleInfo.imports.get(aliasTarget) : "";
}

function webpackParamMockKey(scopeId, functionName, paramIndex) {
  return `${scopeId}:${functionName}:${paramIndex}`;
}

function webpackParamMockForFunction(dataFlow, fn, paramIndex) {
  if (!dataFlow?.functionParamMocks || !fn?.scopeId || !fn.name) return {};
  return cloneMockValue(dataFlow.functionParamMocks.get(webpackParamMockKey(fn.scopeId, fn.name, paramIndex)) || {});
}

function webpackParamInferenceSources(dataFlow, text, index, functionRanges, rawArgs = []) {
  const fn = findEnclosingFunction(functionRanges, index);
  if (!dataFlow?.sources || !fn?.scopeId || !fn.name) return [];
  const out = [];
  rawArgs.forEach((rawArg) => {
    const identifier = /^([A-Za-z_$][\w$]*)$/.exec(String(rawArg || "").trim())?.[1] ||
      /^JSON\.stringify\s*\(\s*([A-Za-z_$][\w$]*)\s*\)$/.exec(String(rawArg || "").trim())?.[1] ||
      "";
    if (!identifier) return;
    const paramIndex = fn.params.indexOf(identifier);
    if (paramIndex === -1) return;
    out.push(...(dataFlow.sources.get(webpackParamMockKey(fn.scopeId, fn.name, paramIndex)) || []));
  });
  return dedupeBy(out, (item) => `${item.fromModuleId}:${item.importAlias}:${item.toModuleId}:${item.exportAlias}:${item.paramIndex}:${item.line}`);
}

function extractObjectPropertyExpression(block, keys) {
  for (const key of keys) {
    const re = new RegExp(`(?:^|[,{\\s])(?:${escapeRegex(key)}|["']${escapeRegex(key)}["'])\\s*:\\s*`, "gi");
    for (const match of findAll(re, block)) {
      const expr = readExpressionUntilSeparator(block, match.index + match[0].length);
      if (expr) return expr;
    }
  }
  return "";
}

function readExpressionUntilSeparator(text, start) {
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quote = "";
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") parenDepth += 1;
    else if (ch === ")" && parenDepth > 0) parenDepth -= 1;
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]" && bracketDepth > 0) bracketDepth -= 1;
    else if (ch === "{") braceDepth += 1;
    else if (ch === "}" && braceDepth > 0) braceDepth -= 1;
    else if ((ch === "," || ch === "\n" || ch === "\r") && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      return text.slice(start, i).trim();
    } else if (ch === "}" && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      return text.slice(start, i).trim();
    }
  }
  return text.slice(start).trim();
}

function extractObjectMockFromExpression(expression, depth = 0) {
  if (depth > 3) return {};
  let expr = String(expression || "").trim();
  if (!expr) return {};

  const jsonMatch = /^JSON\.stringify\s*\(([\s\S]+)\)$/.exec(expr);
  if (jsonMatch) expr = jsonMatch[1].trim();

  const paramsMatch = /^(?:new\s+URLSearchParams|qs\.stringify|querystring\.stringify)\s*\(([\s\S]+)\)$/.exec(expr);
  if (paramsMatch) expr = paramsMatch[1].trim();

  while (expr.startsWith("(") && expr.endsWith(")")) expr = expr.slice(1, -1).trim();
  if (!expr.startsWith("{")) return {};

  const end = findMatchingBrace(expr, 0, expr.length + 1);
  if (end === -1) return {};
  const inner = expr.slice(1, end);
  const out = {};
  for (const property of splitTopLevel(inner, ",")) {
    const prop = property.trim();
    if (!prop || prop.startsWith("...")) continue;
    const colonIndex = findTopLevelColon(prop);
    if (colonIndex === -1) {
      const key = cleanObjectKey(prop);
      if (key) out[key] = mockValueForKey(key);
      continue;
    }

    const key = cleanObjectKey(prop.slice(0, colonIndex));
    if (!key) continue;
    const valueExpr = prop.slice(colonIndex + 1).trim();
    out[key] = mockValueFromExpression(key, valueExpr, depth + 1);
  }
  return out;
}

function splitTopLevel(text, separator = ",") {
  const parts = [];
  let start = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quote = "";
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") parenDepth += 1;
    else if (ch === ")" && parenDepth > 0) parenDepth -= 1;
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]" && bracketDepth > 0) bracketDepth -= 1;
    else if (ch === "{") braceDepth += 1;
    else if (ch === "}" && braceDepth > 0) braceDepth -= 1;
    else if (ch === separator && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function findTopLevelColon(text) {
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quote = "";
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") parenDepth += 1;
    else if (ch === ")" && parenDepth > 0) parenDepth -= 1;
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]" && bracketDepth > 0) bracketDepth -= 1;
    else if (ch === "{") braceDepth += 1;
    else if (ch === "}" && braceDepth > 0) braceDepth -= 1;
    else if (ch === ":" && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) return i;
  }
  return -1;
}

function cleanObjectKey(raw) {
  let key = String(raw || "").trim();
  if (!key || key.includes("(")) return "";
  key = key.replace(/^\s*["'`]|["'`]\s*$/g, "");
  if (key.startsWith("[") && key.endsWith("]")) key = key.slice(1, -1).replace(/^\s*["'`]|["'`]\s*$/g, "");
  return /^[A-Za-z_$][\w$-]*$/.test(key) ? key : "";
}

function mockValueFromExpression(key, expression, depth) {
  const expr = String(expression || "").trim();
  if (!expr) return mockValueForKey(key);
  if (expr.startsWith("{")) return extractObjectMockFromExpression(expr, depth);
  if (expr.startsWith("[")) return [];
  const stringLiteral = /^(['"`])([\s\S]*)\1$/.exec(expr);
  if (stringLiteral) return stringLiteral[2];
  if (/^-?\d+(?:\.\d+)?$/.test(expr)) return Number(expr);
  if (expr === "true") return true;
  if (expr === "false") return false;
  if (expr === "null") return null;
  return mockValueForKey(key);
}

function extractObjectKeys(block, keys) {
  const found = [];
  for (const key of keys) {
    const expr = extractObjectPropertyExpression(block, [key]);
    const mock = extractObjectMockFromExpression(expr);
    for (const keyName of Object.keys(mock)) found.push(keyName);
  }
  return [...new Set(found)].slice(0, 30);
}

function mockObjectFromKeys(keys) {
  const out = {};
  for (const key of keys || []) out[key] = mockValueForKey(key);
  return out;
}

function genericResponseMock() {
  return {
    code: 0,
    message: "mock response inferred from JavaScript analysis",
    data: {}
  };
}

function inferResponseFromSnippet(snippet) {
  const responseKeys = new Set();
  const nestedDataRe = /\.data(?:\?\.|\.)data(?:\?\.|\.)([A-Za-z_$][\w$]*)/g;
  for (const match of findAll(nestedDataRe, snippet)) responseKeys.add(match[1]);

  const dataRe = /\.data(?:\?\.|\.)([A-Za-z_$][\w$]*)/g;
  for (const match of findAll(dataRe, snippet)) {
    if (match[1] !== "data") responseKeys.add(match[1]);
  }

  const rootKeys = new Set();
  for (const key of ["code", "message", "msg", "errMsg", "status", "success"]) {
    if (new RegExp(`\\.${escapeRegex(key)}\\b|["']${escapeRegex(key)}["']\\s*:`, "i").test(snippet)) rootKeys.add(key);
  }

  const responseMock = genericResponseMock();
  if (rootKeys.has("message") || rootKeys.has("msg")) responseMock.message = "message_mock";
  if (rootKeys.has("errMsg")) responseMock.errMsg = "errMsg_mock";
  if (rootKeys.has("status")) responseMock.status = "status_mock";
  if (rootKeys.has("success")) responseMock.success = true;
  for (const key of responseKeys) responseMock.data[key] = mockValueForKey(key);

  return {
    responseMock,
    responseKeys: [...responseKeys],
    responseRootKeys: [...rootKeys]
  };
}

function responseSnippetAfterCall(text, callEnd) {
  if (callEnd < 0) return "";
  const after = text.slice(callEnd + 1, Math.min(text.length, callEnd + 900));
  const trimmed = after.trimStart();
  if (!trimmed.startsWith(".then") && !trimmed.startsWith(".catch") && !trimmed.startsWith(".finally")) return "";
  const semicolon = trimmed.search(/[;\n\r]/);
  return semicolon === -1 ? trimmed.slice(0, 900) : trimmed.slice(0, semicolon);
}

function mockValueForKey(key) {
  if (/id$/i.test(key)) return "10001";
  if (/phone|mobile/i.test(key)) return "13800138000";
  if (/email/i.test(key)) return "user@example.com";
  if (/name/i.test(key)) return "example";
  if (/time|date/i.test(key)) return "2026-01-01T00:00:00Z";
  if (/token|sign|key|secret/i.test(key)) return `${key}_mock`;
  if (/page|size|count|num/i.test(key)) return 1;
  return `${key}_mock`;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeMockObjects(...objects) {
  const out = {};
  for (const object of objects) {
    if (!isPlainObject(object)) continue;
    for (const [key, value] of Object.entries(object)) {
      if (isPlainObject(out[key]) && isPlainObject(value)) out[key] = mergeMockObjects(out[key], value);
      else out[key] = value;
    }
  }
  return out;
}

function parseApiUrl(raw) {
  const value = String(raw || "");
  try {
    const parsed = new URL(value.startsWith("//") ? `https:${value}` : value);
    return {
      baseUrl: `${parsed.protocol}//${parsed.host}`,
      path: parsed.pathname || "/",
      query: parseQueryParameters(parsed.search)
    };
  } catch {
    const [withoutHash] = value.split("#");
    const queryIndex = withoutHash.indexOf("?");
    const rawPath = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
    const rawQuery = queryIndex === -1 ? "" : withoutHash.slice(queryIndex + 1);
    const slash = rawPath.startsWith("/") ? rawPath : "";
    return { baseUrl: "", path: slash || rawPath || value, query: parseQueryParameters(rawQuery) };
  }
}

function parseQueryParameters(rawQuery) {
  const query = {};
  const value = String(rawQuery || "").replace(/^\?/, "");
  if (!value) return query;
  for (const part of value.split("&")) {
    if (!part) continue;
    const [rawKey, ...rawValueParts] = part.split("=");
    const key = safeDecodeURIComponent(rawKey).replace(/\[\]$/, "");
    if (!key || !/^[A-Za-z_$][\w$.-]*$/.test(key)) continue;
    const rawValue = safeDecodeURIComponent(rawValueParts.join("="));
    query[key] = rawValue || mockValueForKey(key);
  }
  return query;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(String(value || "").replace(/\+/g, " "));
  } catch {
    return String(value || "");
  }
}

function mockHeadersFromSnippet(snippet) {
  const headers = {};
  if (/authorization|bearer/i.test(snippet)) headers.Authorization = "Bearer {{token}}";
  if (/content-type|application\/json/i.test(snippet)) headers["Content-Type"] = "application/json";
  if (/appid|app-id/i.test(snippet)) headers.appid = "{{appid}}";
  if (/sign|signature/i.test(snippet)) headers.sign = "{{signature}}";
  if (/timestamp/i.test(snippet)) headers.timestamp = "{{timestamp}}";
  return headers;
}

function inferAuthFromSnippet(snippet) {
  if (/bearer|authorization|token|jwt/i.test(snippet)) return { type: "bearer-or-token", source: "snippet" };
  if (/cookie|session/i.test(snippet)) return { type: "cookie-or-session", source: "snippet" };
  return {};
}

function inferContentType(snippet) {
  if (/multipart|formData/i.test(snippet)) return "multipart/form-data";
  if (/x-www-form-urlencoded/i.test(snippet)) return "application/x-www-form-urlencoded";
  if (/application\/json|JSON\.stringify|data\s*:/.test(snippet)) return "application/json";
  return "";
}

function extractConfigsAccounts(shard, file, text, options) {
  const configRe = /(?:^|[,{;\s])(['"]?)([A-Za-z_$][\w$.-]{0,120})\1\s*[:=]\s*(['"`])([^'"`]{1,2000})\3/g;
  for (const match of findAll(configRe, text)) {
    const key = match[2];
    const rawValue = match[4];
    if (!isSensitiveConfigKey(key) && !looksLikeSecretValue(rawValue)) continue;
    if (!shouldRecordConfigLiteral(key, rawValue)) continue;
    const category = categorizeConfigKey(key, rawValue);
    const item = entity("config", key, {
      category,
      value: maybeRedact(rawValue, `${key}:${category}`, options),
      files: [file],
      confidence: 0.9,
      metadata: { key, rawKind: "literal-assignment" }
    });
    addEvidence(shard, item, evidence(file, text, match.index, "config-literal-regex", 0.9));
    shard.configs.push(item);

    if (ACCOUNT_KEY_RE.test(key) && shouldRecordCredentialLiteral(key, rawValue)) {
      const account = entity("account", key, {
        category,
        value: maybeRedact(rawValue, `${key}:${category}`, options),
        files: [file],
        confidence: /password|passwd|pwd|passphrase|passcode/i.test(key) ? 0.9 : 0.86,
        metadata: { key, sourceConfigId: item.id }
      });
      addEvidence(shard, account, evidence(file, text, match.index, "account-literal-regex", 0.85));
      shard.accounts.push(account);
    }
  }

  extractValuePatternSecrets(shard, file, text, options);

  const storageRe = /\b(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\s*\(\s*(['"`])([^'"`]{1,200})\1|\b(?:wx|uni)\.(?:getStorageSync|setStorageSync|removeStorageSync)\s*\(\s*(['"`])([^'"`]{1,200})\3/g;
  for (const match of findAll(storageRe, text)) {
    const key = match[2] || match[4];
    if (!key) continue;
    const item = entity("config", key, {
      category: "storage_key",
      value: maybeRedact(key, "storage_key", options),
      files: [file],
      confidence: 0.85,
      metadata: { key, rawKind: "storage-key" }
    });
    addEvidence(shard, item, evidence(file, text, match.index, "storage-key-regex", 0.85));
    shard.configs.push(item);
  }
}

function extractValuePatternSecrets(shard, file, text, options) {
  const patterns = [
    { name: "private_key", category: "private_key", re: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]{20,4000}?-----END (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, confidence: 0.98 },
    { name: "authorization_header", category: "token", re: /\bAuthorization\b\s*[:=]\s*(['"`])\s*(?:Bearer|Basic)\s+([A-Za-z0-9._~+/=-]{12,2000})\1/gi, group: 2, confidence: 0.88 },
    { name: "jwt", category: "token", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, confidence: 0.9 },
    { name: "aws_access_key_id", category: "cloud_secret", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, confidence: 0.9 },
    { name: "tencent_secret_id", category: "cloud_secret", re: /\bAKID[A-Za-z0-9]{13,40}\b/g, confidence: 0.88 },
    { name: "github_token", category: "devops_token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,255}\b|\bgithub_pat_[A-Za-z0-9_]{20,255}\b/g, confidence: 0.94 },
    { name: "gitlab_token", category: "devops_token", re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, confidence: 0.92 },
    { name: "npm_token", category: "devops_token", re: /\bnpm_[A-Za-z0-9]{36,}\b/g, confidence: 0.92 },
    { name: "pypi_token", category: "devops_token", re: /\bpypi-[A-Za-z0-9_-]{20,}\b/g, confidence: 0.9 },
    { name: "slack_token", category: "devops_token", re: /\bxox[abprs]-[A-Za-z0-9-]{20,}\b/g, confidence: 0.9 },
    { name: "stripe_secret_key", category: "payment_secret", re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g, confidence: 0.9 },
    { name: "openai_api_key", category: "ai_service_token", re: /\b(?:sk-(?!live_|test_)[A-Za-z0-9_-]{24,}|sess-[A-Za-z0-9_-]{24,})\b/g, confidence: 0.84 },
    { name: "credential_url", category: "credential_url", re: /\b(?:https?|wss?|ftp|mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^/\s"'`:@]{1,120}:[^@\s"'`]{3,300}@[^\s"'`<>)\\]+/gi, confidence: 0.92 }
  ];

  for (const pattern of patterns) {
    for (const match of findAll(pattern.re, text)) {
      const rawValue = match[pattern.group || 0];
      if (!rawValue || !shouldRecordCredentialLiteral(pattern.name, rawValue)) continue;
      const item = entity("config", pattern.name, {
        category: pattern.category,
        value: maybeRedact(rawValue, pattern.category, options),
        files: [file],
        confidence: pattern.confidence,
        metadata: { key: pattern.name, rawKind: "secret-value-pattern" }
      });
      addEvidence(shard, item, evidence(file, text, match.index, "secret-value-pattern", pattern.confidence));
      shard.configs.push(item);
    }
  }
}

function looksLikeSecretValue(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  return /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i.test(v) ||
    /^(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}$/i.test(v) ||
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/.test(v) ||
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(v) ||
    /\bAKID[A-Za-z0-9]{13,40}\b/.test(v) ||
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,255}\b|\bgithub_pat_[A-Za-z0-9_]{20,255}\b/.test(v) ||
    /\bglpat-[A-Za-z0-9_-]{20,}\b/.test(v) ||
    /\bnpm_[A-Za-z0-9]{36,}\b/.test(v) ||
    /\bpypi-[A-Za-z0-9_-]{20,}\b/.test(v) ||
    /\bxox[abprs]-[A-Za-z0-9-]{20,}\b/.test(v) ||
    /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/.test(v) ||
    /\b(?:sk-(?!live_|test_)[A-Za-z0-9_-]{24,}|sess-[A-Za-z0-9_-]{24,})\b/.test(v) ||
    looksLikeCredentialUrl(v);
}

function looksLikeCredentialUrl(value) {
  return /\b(?:https?|wss?|ftp|mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^/\s"'`:@]{1,120}:[^@\s"'`]{3,300}@/i.test(String(value || ""));
}

function isSensitiveConfigKey(key) {
  const k = String(key || "");
  if (/author|authority|authorized|authentic/i.test(k) && !/(authorization|oauth|bearer|basic|auth[_-]?(?:token|key|secret|code|id))/i.test(k)) return false;
  if (/(?:encrypt|decrypt|cipher|crypto|hmac|aes|des|rsa|ec|sm2|sm4)[_-]?key|sign[_-]?key|salt|private[_-]?key/i.test(k)) return true;
  return SENSITIVE_KEY_RE.test(k);
}

function shouldRecordConfigLiteral(key, value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return false;
  const keyText = String(key || "");
  if (/^(?:true|false|null|undefined)$/i.test(rawValue)) return false;
  if (CREDENTIAL_VALUE_KEY_RE.test(keyText) || looksLikeSecretValue(rawValue)) {
    return shouldRecordCredentialLiteral(keyText, rawValue);
  }
  return true;
}

function shouldRecordCredentialLiteral(key, value) {
  const k = String(key || "").toLowerCase();
  const v = String(value || "").trim();
  if (!v) return false;
  if (/^(?:password|passwd|pwd|passphrase|passcode|account|username|user|phone|mobile|email|token|secret|ak|sk|key|null|undefined|true|false)$/i.test(v)) return false;
  if (/placeholder|required|invalid|error|success|example|sample|mock|dummy|todo|change[_-]?me|your[_-]|replace[_-]?me/i.test(v) && !looksLikeSecretValue(v)) return false;
  if (/请输入|请填写|不能为空|错误|失败|成功|占位|示例|样例|placeholder|required|invalid|error|success/i.test(v)) return false;
  if (/password|passwd|pwd/.test(k) && /密码|口令|password|passwd|pwd/i.test(v) && v.length < 16) return false;
  if (/account|username|user/.test(k) && /账号|账户|用户名|用户|account|username/i.test(v) && v.length < 16) return false;
  if (/password|passwd|pwd|passphrase|passcode/.test(k) && /密码|口令|password|passwd|pwd|passphrase|passcode/i.test(v) && v.length < 16) return false;
  if (v.length < 6 && CREDENTIAL_VALUE_KEY_RE.test(k)) return false;
  if (/phone|mobile/.test(k) && !/(?:\+?86[- ]?)?1[3-9]\d{9}/.test(v)) return false;
  if (/email/.test(k) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return false;
  return true;
}

function categorizeConfigKey(key, value) {
  const k = String(key).toLowerCase();
  const v = String(value).toLowerCase();
  if (/-----begin .*private key-----/i.test(value)) return "private_key";
  if (looksLikeCredentialUrl(value)) return "credential_url";
  if (/password|passwd|pwd|passphrase|passcode/.test(k)) return "password";
  if (/username|account|user[_-]?name|login[_-]?name/.test(k)) return "account";
  if (/phone|mobile/.test(k)) return "phone";
  if (/email/.test(k)) return "email";
  if (/jwt|id[_-]?token|access[_-]?token|refresh[_-]?token|bearer|authorization|auth[_-]?token|security[_-]?token|session|cookie/.test(k)) return "token";
  if (/webhook/.test(k) || /hooks\.slack|oapi\.dingtalk|open\.feishu|qyapi\.weixin/i.test(v)) return "webhook";
  if (/connection[_-]?string|connstr|jdbc|mongo(?:db)?[_-]?uri|redis[_-]?url|database[_-]?url|db[_-]?/.test(k) || /^(?:jdbc:|mongodb(?:\+srv)?:|postgres(?:ql)?:|mysql:|redis:)/i.test(v)) return "database_credential";
  if (/smtp|mail[_-]?password/.test(k)) return "smtp_credential";
  if (/mch[_-]?key|pay[_-]?key|api[_-]?v3[_-]?key|merchant[_-]?key|alipay[_-]?private[_-]?key|wechat[_-]?pay/.test(k)) return "payment_secret";
  if (/openai|anthropic|gemini|cohere|huggingface|hf[_-]?token|pinecone|langchain|perplexity|replicate/.test(k)) return "ai_service_token";
  if (/github|gitlab|npm|sonar|docker|registry|pypi|rubygems|postman|pulumi/.test(k)) return "devops_token";
  if (/aws|aliyun|alibaba|tencent|secretid|secretkey|access[_-]?key|accesskey|ak|sk|azure|gcp|google/.test(k)) return "cloud_secret";
  if (/(?:encrypt|decrypt|cipher|crypto|hmac|aes|des|rsa|ec|sm2|sm4)[_-]?key|sign[_-]?key|salt|private[_-]?key/.test(k)) return "crypto_secret";
  if (/private[_-]?key|secret|api[_-]?key|apikey|x[_-]?api[_-]?key|client[_-]?secret|app[_-]?secret|signing[_-]?key|signature|secret[_-]?key|key/.test(k)) return "secret";
  if (/appid|app_id/.test(k)) return "appid";
  if (/bucket|region/.test(k)) return "storage";
  if (/dsn|sentry|bugly/.test(k) || /sentry|bugly/.test(v)) return "monitoring";
  if (/url|uri|host|domain/.test(k)) return categorizeExternalAsset(value);
  if (/tenant|org/.test(k)) return "tenant_or_org";
  return "config";
}

function extractDeveloperSignals(shard, file, text, options) {
  for (const match of findAll(EMAIL_RE, text)) {
    const item = entity("developerSignal", match[0], {
      category: "email",
      value: maybeRedact(match[0], "email", options),
      files: [file],
      confidence: 0.9
    });
    addEvidence(shard, item, evidence(file, text, match.index, "email-regex", 0.9));
    shard.developerSignals.push(item);
  }

  for (const match of findAll(PHONE_RE, text)) {
    const item = entity("developerSignal", match[0], {
      category: "phone",
      value: maybeRedact(match[0], "phone", options),
      files: [file],
      confidence: 0.75
    });
    addEvidence(shard, item, evidence(file, text, match.index, "phone-regex", 0.75));
    shard.developerSignals.push(item);
  }

  for (const match of findAll(SOURCE_PATH_RE, text)) {
    const item = entity("developerSignal", match[0], {
      category: "source_path",
      value: maybeRedact(match[0], "source_path", options),
      files: [file],
      confidence: 0.8
    });
    addEvidence(shard, item, evidence(file, text, match.index, "source-path-regex", 0.8));
    shard.developerSignals.push(item);
  }

  const authorRe = /@author\s+([^\n\r*]+)/gi;
  for (const match of findAll(authorRe, text)) {
    const name = match[1].trim();
    const item = entity("developerSignal", name, {
      category: "author_comment",
      value: maybeRedact(name, "author", options),
      files: [file],
      confidence: 0.75
    });
    addEvidence(shard, item, evidence(file, text, match.index, "author-comment-regex", 0.75));
    shard.developerSignals.push(item);
  }
}

function extractOperationsSignals(shard, file, text, options) {
  const patterns = [
    ["nacos", /nacos/gi, "config_center"],
    ["apollo", /apollo/gi, "config_center"],
    ["consul", /consul/gi, "service_discovery"],
    ["eureka", /eureka/gi, "service_discovery"],
    ["jenkins", /jenkins/gi, "ci_cd"],
    ["harbor", /harbor/gi, "ci_cd"],
    ["sonarqube", /sonar(?:qube)?/gi, "ci_cd"],
    ["kubernetes", /\bk8s\b|kubernetes|ingress/gi, "container_or_ingress"],
    ["actuator", /actuator/gi, "spring_actuator"],
    ["gateway", /gateway|api[-_]?gw/gi, "gateway"],
    ["websocket", /\bwebsocket\b|\bwsUrl\b|\bwss?:\/\//gi, "websocket"],
    ["graphql", /graphql/gi, "graphql"]
  ];

  for (const [name, re, category] of patterns) {
    for (const match of findAll(re, text)) {
      const item = entity("operationsSignal", name, {
        category,
        value: maybeRedact(match[0], category, options),
        files: [file],
        confidence: 0.65
      });
      addEvidence(shard, item, evidence(file, text, match.index, `ops-${name}`, 0.65));
      shard.operationsSignals.push(item);
    }
  }
}

function extractThirdPartyServices(shard, file, text, options) {
  const patterns = [
    ["WeChat", /wxpay|wechat|weixin|open.weixin|mp\.weixin/gi, "payment_or_login"],
    ["Alipay", /alipay|支付宝/gi, "payment"],
    ["UnionPay", /unionpay|银联/gi, "payment"],
    ["AMap", /amap|gaode|高德/gi, "map"],
    ["Baidu Map", /baidu.*map|百度地图/gi, "map"],
    ["Tencent Map", /qqmap|tencent.*map/gi, "map"],
    ["Geetest", /geetest|极验/gi, "captcha"],
    ["Tencent Captcha", /captcha\.qq|tencentcaptcha|滑块验证码/gi, "captcha"],
    ["Aliyun SMS", /aliyun.*sms|dysmsapi|短信/gi, "sms"],
    ["JPush", /jpush|极光/gi, "push"],
    ["Umeng", /umeng|友盟/gi, "analytics"],
    ["SensorsData", /sensorsdata|神策/gi, "analytics"],
    ["GrowingIO", /growingio/gi, "analytics"],
    ["Sentry", /sentry/gi, "monitoring"],
    ["Bugly", /bugly/gi, "monitoring"],
    ["Firebase", /firebase/gi, "monitoring_or_analytics"],
    ["OAuth/SSO", /oauth|sso|cas\b/gi, "auth"]
  ];

  for (const [name, re, category] of patterns) {
    for (const match of findAll(re, text)) {
      const item = entity("thirdPartyService", name, {
        category,
        value: maybeRedact(match[0], category, options),
        files: [file],
        confidence: 0.65
      });
      addEvidence(shard, item, evidence(file, text, match.index, `thirdparty-${safeName(name)}`, 0.65));
      shard.thirdPartyServices.push(item);
    }
  }
}

function extractCrypto(shard, file, text, options) {
  const patterns = [
    ["CryptoJS AES", /CryptoJS\.AES|AES\.encrypt|AES\.decrypt/gi, "aes"],
    ["CryptoJS DES", /CryptoJS\.DES|DES\.encrypt|DES\.decrypt/gi, "des"],
    ["HMAC", /createHmac|HmacSHA|hmac/gi, "hmac"],
    ["Hash", /createHash|MD5|SHA1|SHA256|SHA512|sha\d+|md5/gi, "hash"],
    ["RSA", /JSEncrypt|RSA|publicKey|privateKey/gi, "rsa"],
    ["WebCrypto", /crypto\.subtle|SubtleCrypto/gi, "webcrypto"],
    ["Base64", /\batob\b|\bbtoa\b|base64|Buffer\.from\([^)]*base64/gi, "base64"],
    ["URL Encoding", /encodeURIComponent|decodeURIComponent/gi, "urlencode"],
    ["SM Crypto", /\bsm2\b|\bsm3\b|\bsm4\b|sm-crypto|gmssl/gi, "guomi"],
    ["Signature", /\bsignature\b|\bsign\b|nonce|timestamp|salt/gi, "signature"]
  ];

  for (const [name, re, category] of patterns) {
    for (const match of findAll(re, text)) {
      const item = entity("crypto", name, {
        category,
        value: name,
        files: [file],
        confidence: category === "signature" ? 0.55 : 0.75,
        metadata: {
          algorithmHint: category,
          nodeHelper: "crypto/node/crypto-helpers.mjs",
          pythonHelper: "crypto/python/crypto_helpers.py"
        }
      });
      addEvidence(shard, item, evidence(file, text, match.index, `crypto-${category}`, item.confidence));
      shard.crypto.push(item);
    }
  }
}

function extractSourceMapSignals(shard, file, text, project, options) {
  if (!file.toLowerCase().endsWith(".map")) return;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    shard.uncertainties.push(entity("uncertainty", `Invalid source map: ${file}`, {
      category: "source_map_parse_error",
      value: file,
      files: [file],
      confidence: 0.8
    }));
    return;
  }

  for (const source of parsed.sources || []) {
    const item = entity("developerSignal", source, {
      category: "source_map_source",
      value: maybeRedact(source, "source_map_source", options),
      files: [file],
      confidence: 0.8,
      metadata: { sourceMap: file }
    });
    shard.developerSignals.push(item);
  }

  if (Array.isArray(parsed.sources)) {
    const moduleNames = new Set(parsed.sources.map((source) => normalizeSlash(source).split("/").filter(Boolean)[0]).filter(Boolean));
    for (const moduleName of moduleNames) {
      shard.modules.push(entity("module", moduleName, {
        category: "source_map_module",
        value: moduleName,
        files: [file],
        confidence: 0.55,
        metadata: { sourceMap: file }
      }));
    }
  }
}

function extractFeatureHints(shard, file, text) {
  const routeRe = /\bpath\s*:\s*(['"`])((?:\/|pages\/|package)[^'"`]{1,180})\1/gi;
  for (const match of findAll(routeRe, text)) {
    const value = match[2];
    const item = entity("feature", value, {
      category: "route_path",
      value,
      files: [file],
      confidence: 0.7
    });
    addEvidence(shard, item, evidence(file, text, match.index, "route-path-regex", 0.7));
    shard.features.push(item);
  }

  const i18nRe = /\b(?:title|label|text|name)\s*:\s*(['"`])([^'"`]{2,80})\1/gi;
  for (const match of findAll(i18nRe, text)) {
    const value = match[2].trim();
    if (!value || /^https?:\/\//i.test(value)) continue;
    const item = entity("feature", value, {
      category: "ui_or_business_text",
      value,
      files: [file],
      confidence: /[\u4e00-\u9fff]/.test(value) ? 0.65 : 0.5
    });
    addEvidence(shard, item, evidence(file, text, match.index, "ui-text-regex", item.confidence));
    shard.features.push(item);
  }

  const permissionRe = /\b(?:permission|perm|auth|menu|button)[A-Za-z0-9_$-]*\b\s*[:=]\s*(['"`])([^'"`]{2,120})\1/gi;
  for (const match of findAll(permissionRe, text)) {
    const value = match[2];
    const item = entity("feature", value, {
      category: "permission_or_menu_code",
      value,
      files: [file],
      confidence: 0.55
    });
    addEvidence(shard, item, evidence(file, text, match.index, "permission-feature-regex", 0.55));
    shard.features.push(item);
  }

  const eventRe = /\b(?:track|trackEvent|sendEvent|report)\s*\(\s*(['"`])([^'"`]{2,120})\1/gi;
  for (const match of findAll(eventRe, text)) {
    const value = match[2];
    const item = entity("feature", value, {
      category: "analytics_event",
      value,
      files: [file],
      confidence: 0.55
    });
    addEvidence(shard, item, evidence(file, text, match.index, "analytics-event-regex", 0.55));
    shard.features.push(item);
  }
}

function findAll(regex, text) {
  const out = [];
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    out.push(match);
    if (match[0] === "") regex.lastIndex += 1;
  }
  return out;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runMergeShards(plan, p, current) {
  const analysis = await readJson(p.analysis, createEmptyAnalysis());
  const shardFiles = (await fs.readdir(p.shards)).filter((file) => file.endsWith(".json")).sort();
  const merged = {
    modules: [...(analysis.modules || [])],
    features: [...(analysis.features || [])],
    apis: [],
    crypto: [],
    configs: [],
    accounts: [],
    externalAssets: [],
    callGraph: [],
    developerSignals: [],
    operationsSignals: [],
    thirdPartyServices: [],
    evidence: [],
    uncertainties: []
  };

  for (const shardFile of shardFiles) {
    const shard = await readJson(path.join(p.shards, shardFile));
    for (const key of Object.keys(merged)) {
      merged[key].push(...(shard[key] || []));
    }
  }

  analysis.modules = dedupeEntities(merged.modules, (item) => `${item.type}:${item.name}:${(item.files || [])[0] || ""}`).slice(0, 500);
  analysis.features = dedupeEntities(merged.features, (item) => `${item.type}:${item.name}:${item.category}`).slice(0, 1000);
  analysis.apis = dedupeApis(merged.apis);
  analysis.crypto = dedupeEntities(merged.crypto, (item) => `${item.category}:${item.name}:${(item.files || [])[0] || ""}`).slice(0, 1000);
  analysis.configs = dedupeEntities(merged.configs, (item) => `${item.category}:${item.name}:${item.value}`).slice(0, 2000);
  analysis.accounts = dedupeEntities(merged.accounts, (item) => `${item.category}:${item.name}:${item.value}`).slice(0, 500);
  analysis.externalAssets = dedupeEntities(merged.externalAssets, (item) => `${item.category}:${item.value}`).slice(0, 2000);
  const dedupedCallGraph = dedupeCallGraph(merged.callGraph);
  analysis.callGraph = dedupedCallGraph.slice(0, CALL_GRAPH_LIMIT);
  analysis.callGraphStats = {
    rawEdges: merged.callGraph.length,
    dedupedEdges: dedupedCallGraph.length,
    retainedEdges: analysis.callGraph.length,
    limit: CALL_GRAPH_LIMIT,
    truncated: dedupedCallGraph.length > CALL_GRAPH_LIMIT
  };
  analysis.developerSignals = dedupeEntities(merged.developerSignals, (item) => `${item.category}:${item.value}`).slice(0, 1000);
  analysis.operationsSignals = dedupeEntities(merged.operationsSignals, (item) => `${item.category}:${item.name}:${(item.files || [])[0] || ""}`).slice(0, 1000);
  analysis.thirdPartyServices = dedupeEntities(merged.thirdPartyServices, (item) => `${item.category}:${item.name}:${(item.files || [])[0] || ""}`).slice(0, 1000);
  analysis.evidence = dedupeEntities(merged.evidence, (item) => item.id).slice(0, 5000);
  analysis.uncertainties = dedupeEntities(merged.uncertainties, (item) => `${item.category}:${item.name}:${item.value}`).slice(0, 1000);
  analysis.generatedAt = nowIso();
  analysis.analysisState = summarizePlan(plan);

  linkApisToCrypto(analysis);
  deriveApiModulesAndFeatures(analysis);
  await writeCryptoHelpers(p, analysis);

  const checkpoint = path.join(p.checkpoints, "checkpoint-004-merged-analysis.json");
  await writeJson(p.analysis, analysis);
  await writeJson(checkpoint, analysis);
  current.outputFiles = [p.analysis, checkpoint];
}

function dedupeEntities(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!map.has(key)) {
      map.set(key, { ...item, files: [...new Set(item.files || [])], evidenceIds: [...new Set(item.evidenceIds || [])] });
      continue;
    }
    const existing = map.get(key);
    existing.files = [...new Set([...(existing.files || []), ...(item.files || [])])];
    existing.evidenceIds = [...new Set([...(existing.evidenceIds || []), ...(item.evidenceIds || [])])];
    existing.confidence = Math.max(existing.confidence || 0, item.confidence || 0);
  }
  return [...map.values()];
}

function dedupeApis(apis) {
  const map = new Map();
  for (const api of apis || []) {
    const key = `${api.method}:${api.url}:${api.path}`;
    if (!map.has(key)) {
      map.set(key, {
        ...api,
        files: [...new Set(api.files || [])],
        evidenceIds: [...new Set(api.evidenceIds || [])],
        query: { ...(api.query || {}) },
        body: cloneMockValue(api.body || {}),
        requestMock: cloneMockValue(api.requestMock || {}),
        responseMock: cloneMockValue(api.responseMock || {}),
        metadata: cloneMockValue(api.metadata || {})
      });
      continue;
    }

    const existing = map.get(key);
    existing.files = [...new Set([...(existing.files || []), ...(api.files || [])])];
    existing.evidenceIds = [...new Set([...(existing.evidenceIds || []), ...(api.evidenceIds || [])])];
    existing.confidence = Math.max(existing.confidence || 0, api.confidence || 0);
    existing.headers = mergeMockObjects(existing.headers || {}, api.headers || {});
    existing.query = mergeMockObjects(existing.query || {}, api.query || {});
    existing.body = preferRicherMock(existing.body || {}, api.body || {});
    existing.requestMock = mergeMockObjects(existing.requestMock || {}, api.requestMock || {});
    existing.requestMock.query = mergeMockObjects(existing.requestMock.query || {}, api.requestMock?.query || {});
    existing.requestMock.body = preferRicherMock(existing.requestMock.body || {}, api.requestMock?.body || {});
    existing.responseMock = preferRicherMock(existing.responseMock || {}, api.responseMock || {});
    existing.metadata = mergeApiMetadata(existing.metadata || {}, api.metadata || {});
  }
  return [...map.values()].slice(0, 2000);
}

function cloneMockValue(value) {
  if (Array.isArray(value)) return value.map(cloneMockValue);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneMockValue(item)]));
  return value;
}

function preferRicherMock(current, next) {
  if (!isPlainObject(current)) return cloneMockValue(next);
  if (!isPlainObject(next)) return cloneMockValue(current);
  const currentCount = countMockLeaves(current);
  const nextCount = countMockLeaves(next);
  if (nextCount > currentCount) return mergeMockObjects(current, next);
  return mergeMockObjects(next, current);
}

function countMockLeaves(value) {
  if (Array.isArray(value)) return value.length;
  if (!isPlainObject(value)) return value === undefined || value === null || value === "" ? 0 : 1;
  return Object.values(value).reduce((sum, item) => sum + countMockLeaves(item), 0);
}

function mergeApiMetadata(current, next) {
  const merged = { ...current, ...next };
  for (const key of ["bodyKeys", "queryKeys", "responseKeys", "responseRootKeys", "headerKeys"]) {
    merged[key] = [...new Set([...(current[key] || []), ...(next[key] || [])])];
  }
  merged.bodyInferenceSources = dedupeBy([...(current.bodyInferenceSources || []), ...(next.bodyInferenceSources || [])], (item) => JSON.stringify(item));
  merged.extractors = [...new Set([...(current.extractors || []), current.extractor, ...(next.extractors || []), next.extractor].filter(Boolean))];
  if (current.extractor && next.extractor && current.extractor !== next.extractor) merged.extractor = "merged-static-api-inference";
  return merged;
}

function dedupeCallGraph(edges) {
  return dedupeEntities(edges || [], (edge) => `${edge.type || "callEdge"}:${edge.file}:${edge.caller}->${edge.callee}:${edge.metadata?.moduleId || edge.metadata?.fromModuleId || ""}:${edge.metadata?.exportAlias || ""}`);
}

function linkApisToCrypto(analysis) {
  const cryptoByFile = new Map();
  for (const c of analysis.crypto || []) {
    for (const file of c.files || []) {
      if (!cryptoByFile.has(file)) cryptoByFile.set(file, []);
      cryptoByFile.get(file).push(c.id);
    }
  }
  for (const api of analysis.apis || []) {
    const ids = new Set(api.cryptoIds || []);
    for (const evidenceId of api.evidenceIds || []) {
      const ev = (analysis.evidence || []).find((candidate) => candidate.id === evidenceId);
      if (!ev) continue;
      for (const id of cryptoByFile.get(ev.file) || []) ids.add(id);
    }
    api.cryptoIds = [...ids];
  }
}

function deriveApiModulesAndFeatures(analysis) {
  const modules = new Map((analysis.modules || []).map((item) => [item.name, item]));
  const features = new Map((analysis.features || []).map((item) => [item.name, item]));
  for (const api of analysis.apis || []) {
    const parsed = parseApiUrl(api.url);
    const parts = (parsed.path || api.path || "").split("/").filter(Boolean);
    const moduleName = parts[0] || "api";
    const featureName = parts.slice(0, 2).join("/") || moduleName;
    if (!modules.has(moduleName)) {
      modules.set(moduleName, entity("module", moduleName, {
        category: "api_path",
        value: moduleName,
        files: [],
        confidence: 0.6
      }));
    }
    if (!features.has(featureName)) {
      features.set(featureName, entity("feature", featureName, {
        category: "api_path",
        value: featureName,
        files: [],
        confidence: 0.6
      }));
    }
    api.moduleId = modules.get(moduleName).id;
    api.featureId = features.get(featureName).id;
  }
  analysis.modules = [...modules.values()];
  analysis.features = [...features.values()];
}

async function writeCryptoHelpers(p, analysis) {
  const nodeHelper = `#!/usr/bin/env node
import crypto from "node:crypto";

export function md5(input) {
  return crypto.createHash("md5").update(String(input)).digest("hex");
}

export function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

export function hmacSha256(input, secret) {
  return crypto.createHmac("sha256", String(secret)).update(String(input)).digest("hex");
}

export function base64Encode(input) {
  return Buffer.from(String(input), "utf8").toString("base64");
}

export function base64Decode(input) {
  return Buffer.from(String(input), "base64").toString("utf8");
}

export function aes256CbcDecryptBase64(ciphertextBase64, key32Bytes, iv16Bytes) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key32Bytes), Buffer.from(iv16Bytes));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextBase64, "base64")), decipher.final()]).toString("utf8");
}

export function aes256CbcEncryptBase64(plaintext, key32Bytes, iv16Bytes) {
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key32Bytes), Buffer.from(iv16Bytes));
  return Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]).toString("base64");
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const [command, input = "", secret = "secret"] = process.argv.slice(2);
  const commands = { md5, sha256, hmacSha256, base64Encode, base64Decode };
  if (!commands[command]) {
    console.error("Usage: node crypto-helpers.mjs <md5|sha256|hmacSha256|base64Encode|base64Decode> <input> [secret]");
    process.exit(1);
  }
  console.log(command === "hmacSha256" ? commands[command](input, secret) : commands[command](input));
}
`;

  const pyHelper = `#!/usr/bin/env python3
import base64
import hashlib
import hmac
import sys

def md5(value: str) -> str:
    return hashlib.md5(value.encode("utf-8")).hexdigest()

def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def hmac_sha256(value: str, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()

def base64_encode(value: str) -> str:
    return base64.b64encode(value.encode("utf-8")).decode("ascii")

def base64_decode(value: str) -> str:
    return base64.b64decode(value).decode("utf-8")

if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    value = sys.argv[2] if len(sys.argv) > 2 else ""
    secret = sys.argv[3] if len(sys.argv) > 3 else "secret"
    commands = {
        "md5": lambda: md5(value),
        "sha256": lambda: sha256(value),
        "hmacSha256": lambda: hmac_sha256(value, secret),
        "base64Encode": lambda: base64_encode(value),
        "base64Decode": lambda: base64_decode(value),
    }
    if command not in commands:
        print("Usage: python crypto_helpers.py <md5|sha256|hmacSha256|base64Encode|base64Decode> <input> [secret]", file=sys.stderr)
        sys.exit(1)
    print(commands[command]())
`;

  await writeText(path.join(p.cryptoNode, "crypto-helpers.mjs"), nodeHelper);
  await writeText(path.join(p.cryptoPython, "crypto_helpers.py"), pyHelper);

  const manifest = {
    generatedAt: nowIso(),
    cryptoFindingCount: (analysis.crypto || []).length,
    helpers: [
      "crypto/node/crypto-helpers.mjs",
      "crypto/python/crypto_helpers.py"
    ],
    note: "Helpers are generic templates. Review each crypto finding and adapt key/iv/signature ordering from source evidence."
  };
  await writeJson(path.join(path.dirname(p.cryptoNode), "crypto-manifest.json"), manifest);
}

async function runRenderMarkdown(plan, p, current) {
  const analysis = await readJson(p.analysis);
  const diagrams = await writeMermaidDiagrams(analysis, p);
  analysis.diagrams = diagrams.map((item) => ({
    name: item.name,
    path: normalizeSlash(path.relative(p.out, item.path)),
    title: item.title
  }));
  await writeJson(p.analysis, analysis);
  const markdown = renderMarkdown(analysis, plan);
  await writeText(p.markdown, markdown);
  current.outputFiles = [p.markdown, ...diagrams.map((item) => item.path), p.analysis];
}

async function writeMermaidDiagrams(analysis, p) {
  const diagrams = renderMermaidDiagrams(analysis);
  const written = [];
  for (const diagram of diagrams) {
    const filePath = path.join(p.diagrams, `${diagram.name}.mmd`);
    await writeText(filePath, diagram.content);
    written.push({ ...diagram, path: filePath });
  }
  return written;
}

function renderMermaidDiagrams(analysis) {
  return [
    {
      name: "website-flow",
      title: "Website Flow",
      content: renderWebsiteFlowMermaid(analysis)
    },
    {
      name: "intelligence-map",
      title: "Intelligence Asset Map",
      content: renderIntelligenceMapMermaid(analysis)
    },
    {
      name: "call-graph",
      title: "Static Call Graph",
      content: renderCallGraphMermaid(analysis)
    },
    {
      name: "architecture",
      title: "Project Architecture",
      content: renderArchitectureMermaid(analysis)
    }
  ];
}

function renderWebsiteFlowMermaid(analysis) {
  const lines = ["flowchart TD", mermaidNode("project", analysis.project?.name || "Project")];
  for (const feature of (analysis.features || []).slice(0, 30)) {
    lines.push(`${mermaidId("project")} --> ${mermaidNode(`feature_${feature.id}`, feature.name)}`);
  }
  for (const api of (analysis.apis || []).slice(0, 40)) {
    const featureId = api.featureId ? `feature_${api.featureId}` : "project";
    lines.push(`${mermaidId(featureId)} --> ${mermaidNode(`api_${api.id}`, `${api.method} ${api.path || api.url}`)}`);
  }
  for (const candidate of (analysis.chunkDiscovery?.candidates || []).slice(0, 20)) {
    lines.push(`${mermaidId("project")} --> ${mermaidNode(`chunk_${candidate.id}`, `${candidate.status}: ${candidate.value}`)}`);
  }
  for (const candidate of (analysis.sourceMapDiscovery?.candidates || []).slice(0, 20)) {
    lines.push(`${mermaidId("project")} --> ${mermaidNode(`map_${candidate.id}`, `map: ${candidate.value}`)}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderIntelligenceMapMermaid(analysis) {
  const lines = ["flowchart LR", mermaidNode("project", analysis.project?.name || "Project")];
  const groups = [
    ["Assets", analysis.externalAssets || [], "asset"],
    ["Developers", analysis.developerSignals || [], "dev"],
    ["Operations", analysis.operationsSignals || [], "ops"],
    ["ThirdParty", analysis.thirdPartyServices || [], "third"]
  ];
  for (const [group, items, prefix] of groups) {
    lines.push(`${mermaidId("project")} --> ${mermaidNode(group, group)}`);
    for (const item of items.slice(0, 25)) {
      lines.push(`${mermaidId(group)} --> ${mermaidNode(`${prefix}_${item.id}`, `${item.category || item.type}: ${stringifyValue(item.value || item.name)}`)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderCallGraphMermaid(analysis) {
  const lines = ["flowchart TD"];
  const edges = (analysis.callGraph || []).slice(0, 120);
  if (edges.length === 0) {
    lines.push(mermaidNode("no_calls", "No call graph edges found"));
    return `${lines.join("\n")}\n`;
  }
  for (const edge of edges) {
    const label = edge.metadata?.mode === "webpack-module-import-alias" ? `${edge.caller} -> ${edge.callee}` : edge.caller;
    lines.push(`${mermaidNode(`caller_${edge.caller}`, label)} --> ${mermaidNode(`callee_${edge.callee}`, edge.callee)}`);
  }
  const stats = analysis.callGraphStats || {};
  if (stats.truncated || (analysis.callGraph || []).length > edges.length) {
    const retained = stats.retainedEdges || (analysis.callGraph || []).length;
    const total = stats.dedupedEdges || retained;
    lines.push(`${mermaidNode("call_graph_note", `Call graph view shows ${edges.length}/${retained}; raw deduped edges ${total}${stats.truncated ? " (truncated)" : ""}`)}`);
  }
  return `${dedupeBy(lines, (line) => line).join("\n")}\n`;
}

function renderArchitectureMermaid(analysis) {
  const lines = ["flowchart TD", mermaidNode("project", analysis.project?.name || "Project")];
  for (const module of (analysis.modules || []).slice(0, 35)) {
    lines.push(`${mermaidId("project")} --> ${mermaidNode(`module_${module.id}`, module.name)}`);
  }
  for (const api of (analysis.apis || []).slice(0, 60)) {
    const moduleId = api.moduleId ? `module_${api.moduleId}` : "project";
    lines.push(`${mermaidId(moduleId)} --> ${mermaidNode(`api_${api.id}`, `${api.method} ${api.path || api.url}`)}`);
  }
  for (const cryptoItem of (analysis.crypto || []).slice(0, 30)) {
    lines.push(`${mermaidId("project")} --> ${mermaidNode(`crypto_${cryptoItem.id}`, `${cryptoItem.category}: ${cryptoItem.name}`)}`);
  }
  for (const asset of (analysis.externalAssets || []).filter((item) => ["api", "gateway", "config_center", "service_discovery", "storage_cdn"].includes(item.category)).slice(0, 40)) {
    lines.push(`${mermaidId("project")} --> ${mermaidNode(`asset_${asset.id}`, `${asset.category}: ${stringifyValue(asset.value)}`)}`);
  }
  return `${lines.join("\n")}\n`;
}

function mermaidId(value) {
  return `n_${String(value || "node").replace(/[^A-Za-z0-9_]/g, "_").slice(0, 80)}`;
}

function mermaidNode(id, label) {
  const cleanLabel = String(label || "").replace(/["\n\r]/g, " ").slice(0, 80);
  return `${mermaidId(id)}["${cleanLabel}"]`;
}

function renderMarkdown(analysis, plan) {
  const progress = summarizePlan(plan);
  const metrics = analysisMetrics(analysis, progress);
  return `# ${analysis.project?.name || "JavaScript Project"} JS 项目分析报告

生成时间：${nowIso()}

## 1. 概述

${renderChineseExecutiveSummary(analysis, metrics)}

## 2. 开头总览：结构、功能、接口

${renderChineseOpeningMap(analysis, metrics)}

## 3. 关键指标

${table(["指标", "值"], [
  ["分析进度", `${progress.completedTasks}/${progress.totalTasks} 个任务（${progress.percentComplete}%）`],
  ["识别类型", (analysis.project?.detectedTypes || []).join(", ") || analysis.project?.primaryType || ""],
  ["可分析文件", metrics.analyzableFiles],
  ["小程序页面", metrics.pageCount],
  ["分包数量", metrics.subPackageCount],
  ["接口候选", metrics.apiCount],
  ["调用图边", `${analysis.callGraphStats?.retainedEdges || (analysis.callGraph || []).length}/${analysis.callGraphStats?.dedupedEdges || (analysis.callGraph || []).length}${analysis.callGraphStats?.truncated ? "（已截断保留）" : ""}`],
  ["OpenAPI 路径", metrics.pathCount],
  ["配置项", metrics.configCount],
  ["加密/签名线索", metrics.cryptoCount],
  ["外部资产/服务", metrics.assetCount],
  ["证据记录", metrics.evidenceCount]
])}

## 4. 项目结构与运行信息

${renderChineseProjectOverview(analysis)}

## 5. 小程序元数据

${renderChineseMiniProgramMarkdown(analysis)}

## 6. 功能模块

${renderChineseBusinessCapabilityMarkdown(analysis)}

## 7. 接口清单

${renderChineseGatewayMarkdown(analysis)}

## 8. 接口详情

${renderChineseApiDetailsMarkdown(analysis)}

## 9. 插件和外部服务

${renderChinesePluginAndServiceMarkdown(analysis)}

## 10. 补充文件线索

${renderChineseSupplementMarkdown(analysis)}

## 11. 安全与复核事项

${renderChineseSecurityMarkdown(analysis)}

## 12. 输出文件

${renderChineseOutputFilesMarkdown(plan)}

## 13. Mermaid 结构图

${renderChineseMermaidMarkdown(analysis)}

${renderChineseRawAppendicesMarkdown(analysis)}
`;
}

function analysisMetrics(analysis, progress) {
  const uniquePaths = new Set((analysis.apis || []).map((api) => {
    const parsed = parseApiUrl(api.url);
    return normalizeOpenApiPath(parsed.path || api.path || `/unknown/${api.id || "api"}`);
  }));
  return {
    progress,
    totalFiles: analysis.inventory?.stats?.totalFiles ?? 0,
    analyzableFiles: analysis.inventory?.stats?.analyzableFiles ?? 0,
    pageCount: analysis.project?.miniprogram?.pageCount || (analysis.project?.routes || []).length || (analysis.inventory?.routes || []).length || 0,
    subPackageCount: analysis.project?.miniprogram?.subPackageCount || 0,
    apiCount: (analysis.apis || []).length,
    pathCount: uniquePaths.size,
    configCount: (analysis.configs || []).length,
    cryptoCount: (analysis.crypto || []).length,
    assetCount: (analysis.externalAssets || []).length,
    evidenceCount: (analysis.evidence || []).length
  };
}

function renderChineseExecutiveSummary(analysis, metrics) {
  const project = analysis.project || {};
  const mp = project.miniprogram || {};
  const topApi = topCounts(analysis.apis || [], (api) => apiPrefix(api, 2), 8)
    .map(([prefix, count]) => `${prefix}（${count}）`)
    .join("、");
  const domains = preferredGatewayDomains(analysis, 6).join("、");
  const crypto = topCounts(analysis.crypto || [], (item) => item.category || "unknown", 6)
    .map(([category, count]) => `${category}（${count}）`)
    .join("、");

  const lines = [];
  lines.push(`- 本报告基于静态 JavaScript 分析生成，用来快速回答“项目是什么、有哪些结构、有哪些功能、有哪些接口、接口怎么请求、证据在哪里”。`);
  lines.push(`- 项目类型：${project.primaryType || "未识别"}${(project.detectedTypes || []).length > 1 ? `；同时识别到 ${(project.detectedTypes || []).filter((item) => item !== project.primaryType).join("、")}` : ""}。`);
  if (mp.appName || project.name || project.appid) {
    lines.push(`- 项目标识：${mp.appName || project.name || "未知项目"}${project.appid || mp.appid ? `；AppID=${project.appid || mp.appid}` : ""}${mp.appVersion ? `；版本=${mp.appVersion}` : ""}${mp.storeId ? `；storeId=${mp.storeId}` : ""}${mp.env ? `；环境=${mp.env}` : ""}。`);
  }
  lines.push(`- 分析规模：发现 ${metrics.apiCount} 个接口候选、${metrics.pathCount} 个 OpenAPI 路径、${metrics.configCount} 个配置项、${metrics.cryptoCount} 条加密/签名线索、${metrics.assetCount} 个外部资产/服务、${metrics.evidenceCount} 条证据。`);
  if (topApi) lines.push(`- 接口集中区域：${topApi}。`);
  if (domains) lines.push(`- 主要外部域名：${domains}。`);
  if (crypto) lines.push(`- 加密/签名线索分布：${crypto}。`);
  lines.push("- 可信度说明：接口参数、返回包、鉴权和加密说明来自静态代码恢复；未经过真实抓包确认的内容均应视为“候选结果”，需要结合源码行号和运行环境复核。");
  lines.push("- 阅读建议：先看第 2 节的结构/功能/接口总览，再看第 8 节逐接口详情；需要原始证据时看最后的可折叠附录或 `analysis.json`。");
  return lines.join("\n");
}

function renderChineseOpeningMap(analysis, metrics) {
  const project = analysis.project || {};
  const mp = project.miniprogram || {};
  const packageRows = (mp.packages || []).slice(0, 12).map((item) => [
    item.appid,
    item.role === "app" ? "主包" : "插件/分包",
    item.fileCount,
    (item.configFiles || []).slice(0, 3).join(", ")
  ]);
  const moduleRows = (analysis.modules || []).slice(0, 12).map((item) => [
    item.name,
    chineseModuleDescription(item),
    (item.files || []).slice(0, 4).join(", "),
    pct(item.confidence)
  ]);
  const pageRows = topCounts((mp.pages || []).map((page) => ({ page })), (item) => pageRoot(item.page), 12);
  const featureRows = topCounts(analysis.features || [], (item) => item.category || "unknown", 12);
  const apiRows = topCounts(analysis.apis || [], (api) => apiPrefix(api, 2), 15);
  const callRows = (analysis.callGraph || []).slice(0, 12).map((edge) => [
    edge.caller,
    edge.callee,
    edge.file ? `${edge.file}:${edge.line || 0}` : "",
    edge.metadata?.mode || edge.type || "",
    pct(edge.confidence)
  ]);

  return `### 2.1 结构总览

${table(["结构项", "值"], [
  ["项目名称", project.name || mp.appName || ""],
  ["项目根目录", project.root || ""],
  ["主类型", project.primaryType || ""],
  ["识别类型", (project.detectedTypes || []).join(", ")],
  ["语言/框架", [project.language, project.framework].filter(Boolean).join(" / ")],
  ["页面/分包", `${metrics.pageCount} 个页面 / ${metrics.subPackageCount} 个分包`],
  ["接口/配置", `${metrics.apiCount} 个接口 / ${metrics.configCount} 个配置项`]
])}

包和插件：

${table(["包/插件 AppID", "角色", "文件数", "配置文件"], packageRows)}

页面根目录分布：

${table(["页面根目录", "数量"], pageRows)}

业务/代码模块：

${table(["模块", "说明", "文件", "可信度"], moduleRows)}

### 2.2 功能总览

${inferChineseCapabilityHints(analysis).length ? inferChineseCapabilityHints(analysis).map((item) => `- ${item}`).join("\n") : "暂无足够功能线索。"}

功能信号分类：

${table(["功能信号", "数量"], featureRows)}

关键函数/调用线索：

${table(["调用方", "被调用方", "位置", "提取方式", "可信度"], callRows)}

### 2.3 接口总览

${table(["接口分组", "数量"], apiRows)}

方法分布：

${table(["方法", "数量"], topCounts(analysis.apis || [], (api) => api.method || "GET", 12))}
`;
}

function renderChineseProjectOverview(analysis) {
  const project = analysis.project || {};
  return `${table(["字段", "值"], [
    ["名称", project.name],
    ["根目录", project.root],
    ["主类型", project.primaryType],
    ["识别类型", (project.detectedTypes || []).join(", ")],
    ["语言", project.language],
    ["框架", project.framework],
    ["包管理器", project.packageManager],
    ["构建工具", project.buildTool],
    ["AppID", project.appid]
  ])}`;
}

function renderChineseMiniProgramMarkdown(analysis) {
  const project = analysis.project || {};
  const mp = project.miniprogram || {};
  if (!mp.configFiles?.length && !mp.pageCount && !project.appid) return "暂无小程序元数据。\n";
  const facts = table(["字段", "值"], [
    ["应用名称", mp.appName || project.name || ""],
    ["AppID", project.appid || mp.appid || ""],
    ["版本", mp.appVersion || ""],
    ["Store ID", mp.storeId || ""],
    ["环境", mp.env || ""],
    ["入口页面", mp.entryPagePath || ""],
    ["页面数量", mp.pageCount || 0],
    ["分包数量", mp.subPackageCount || 0],
    ["网络超时", stringifyValue(mp.networkTimeout || {})],
    ["需要的隐私能力", (mp.requiredPrivateInfos || []).join(", ")],
    ["配置文件", (mp.configFiles || []).join(", ")]
  ]);
  const packages = table(["包", "角色", "文件数", "配置文件"], (mp.packages || []).map((item) => [
    item.appid,
    item.role === "app" ? "主包" : item.role,
    item.fileCount,
    (item.configFiles || []).join(", ")
  ]));
  const tabBar = table(["文案", "页面", "代码", "链接文案"], ((mp.tabBar && mp.tabBar.list) || []).map((item) => [
    item.text,
    item.pagePath,
    item.code,
    item.linkText
  ]));
  const plugins = table(["插件名", "Provider", "版本", "分包"], Object.entries(mp.plugins || {}).map(([name, plugin]) => [
    name,
    plugin?.provider || "",
    plugin?.version || "",
    plugin?.subpackage || ""
  ]));
  const pageRoots = table(["页面根目录", "数量"], topCounts((mp.pages || []).map((page) => ({ page })), (item) => pageRoot(item.page), 30));
  return `### 5.1 基本信息

${facts}

### 5.2 包结构

${packages}

### 5.3 Tab Bar

${tabBar}

### 5.4 声明插件

${plugins}

### 5.5 页面根目录

${pageRoots}`;
}

function renderChineseBusinessCapabilityMarkdown(analysis) {
  const pageRoots = topCounts((analysis.project?.miniprogram?.pages || []).map((page) => ({ page })), (item) => pageRoot(item.page), 20);
  const featureCategories = topCounts(analysis.features || [], (item) => item.category || "unknown", 16);
  const apiPrefixes = topCounts(analysis.apis || [], (api) => apiPrefix(api, 2), 20);
  const featureRows = (analysis.features || []).slice(0, 120).map((item) => [
    item.name,
    chineseFeatureCategory(item.category),
    (item.files || []).slice(0, 4).join(", "),
    pct(item.confidence)
  ]);
  return `### 6.1 推断出的业务能力

${inferChineseCapabilityHints(analysis).length ? inferChineseCapabilityHints(analysis).map((item) => `- ${item}`).join("\n") : "暂无足够功能线索。"}

### 6.2 页面与接口信号

${table(["信号", "数量"], [
    ...pageRoots.map(([name, count]) => [`页面：${name}`, count]),
    ...apiPrefixes.map(([name, count]) => [`接口：${name}`, count])
  ].slice(0, 40))}

### 6.3 功能信号分类

${table(["分类", "数量"], featureCategories.map(([name, count]) => [chineseFeatureCategory(name), count]))}

### 6.4 功能线索明细（前 120 条）

${table(["功能/文案/路由", "类型", "证据文件", "可信度"], featureRows)}`;
}

function renderChineseGatewayMarkdown(analysis) {
  const methods = topCounts(analysis.apis || [], (api) => api.method || "GET", 12);
  const prefixes = topCounts(analysis.apis || [], (api) => apiPrefix(api, 2), 40);
  const domains = topApiServiceDomains(analysis, 40);
  const apiRows = (analysis.apis || []).map((api, index) => [
    index + 1,
    api.method,
    displayApiPath(api),
    apiPrefix(api, 2),
    summarizeObjectKeys(mergedQueryForApi(api)),
    summarizeObjectKeys(bodyForApi(api)),
    summarizeResponseKeys(api.responseMock, api.metadata),
    evidenceFiles(analysis, api).slice(0, 2).join(", "),
    pct(api.confidence)
  ]);
  return `### 7.1 域名/网关线索

${table(["域名", "出现次数"], domains)}

### 7.2 HTTP 方法分布

${table(["方法", "数量"], methods)}

### 7.3 接口分组

${table(["接口前缀", "数量"], prefixes)}

### 7.4 完整接口索引

${table(["序号", "方法", "路径", "分组", "Query 参数", "Body 参数", "返回字段线索", "证据", "可信度"], apiRows)}`;
}

function renderChineseApiDetailsMarkdown(analysis) {
  const apis = analysis.apis || [];
  if (!apis.length) return "暂无接口候选。\n";
  const intro = `以下逐项列出 ${apis.length} 个接口候选。每个接口均采用“接口、参数来源、参数说明、最小请求包示例、返回包、证据”的格式；参数和返回包均为静态分析推断，未抓包确认时会标为待确认。`;
  return `${intro}\n\n${apis.map((api, index) => renderChineseApiDetailMarkdown(analysis, api, index + 1)).join("\n\n")}`;
}

function renderChineseApiDetailMarkdown(analysis, api, index) {
  const method = (api.method || "GET").toUpperCase();
  const pathValue = displayApiPath(api);
  const title = safeHeading(`${method} ${pathValue}`);
  const base = api.baseUrl || parseApiUrl(api.url || "").baseUrl || "";
  const requestConstruction = chineseRequestConstruction(api.requestConstruction || api.metadata?.requestConstruction || "");
  const auth = formatAuthHint(api.auth) || inferApiAuthHint(api);
  const cryptoRefs = (api.cryptoIds || []).join(", ");
  return `### 8.${index} ${title}

#### 接口

- 方法：${codeSpan(method)}
- 路径：${codeSpan(pathValue)}
- 原始 URL：${codeSpan(api.url || api.path || pathValue)}
- Base URL：${base ? codeSpan(base) : "未在该接口处直接确认"}
- 分组：${codeSpan(apiPrefix(api, 2))}
- 可信度：${pct(api.confidence) || "待确认"}
${auth ? `- 鉴权/签名：${auth}` : "- 鉴权/签名：未在该接口条目中直接确认"}
${cryptoRefs ? `- 关联加密/签名线索：${codeSpan(cryptoRefs)}` : ""}
${requestConstruction ? `- 请求构造：${requestConstruction}` : ""}

#### 参数来源

${renderApiParameterSourceMarkdown(analysis, api)}

#### 参数说明

${table(["参数", "位置", "是否必填", "说明"], buildApiParameterRows(api))}

#### 最小请求包示例

\`\`\`http
${renderHttpRequestExample(analysis, api)}
\`\`\`

#### 返回包

${renderApiResponseMarkdown(api)}

#### 可能的返回包示例

\`\`\`json
${formatJsonForFence(api.responseMock || genericResponseMock(), 1600)}
\`\`\`

#### 证据

${renderEvidenceBullets(analysis, api, 8)}`;
}

function renderApiParameterSourceMarkdown(analysis, api) {
  const queryKeys = Object.keys(mergedQueryForApi(api));
  const bodyKeys = Object.keys(bodyForApi(api));
  const headerKeys = Object.keys(headersForApi(api));
  const pathKeys = pathParamsForApi(api);
  const extractors = [
    ...(api.metadata?.extractors || []),
    api.metadata?.extractor
  ].filter(Boolean);
  const lines = [];
  if (pathKeys.length) lines.push(`- Path 参数：${pathKeys.map(codeSpan).join("、")}，来自路径模板或动态路径片段。`);
  if (queryKeys.length) lines.push(`- Query 参数：${queryKeys.slice(0, 20).map(codeSpan).join("、")}${queryKeys.length > 20 ? ` 等 ${queryKeys.length} 个` : ""}，来自 URL 查询串、GET 参数对象或请求 wrapper 的参数合并。`);
  if (bodyKeys.length) lines.push(`- Body 参数：${bodyKeys.slice(0, 20).map(codeSpan).join("、")}${bodyKeys.length > 20 ? ` 等 ${bodyKeys.length} 个` : ""}，来自 POST/PUT/PATCH 请求体、wrapper 第二参数或同文件调用点对象字面量。`);
  if (headerKeys.length) lines.push(`- Header 参数：${headerKeys.slice(0, 20).map(codeSpan).join("、")}，来自 headers 配置、拦截器或签名线索。`);
  if (extractors.length) lines.push(`- 提取方式：${[...new Set(extractors)].map(codeSpan).join("、")}。`);
  if (!lines.length) lines.push("- 当前静态分析未恢复出明确参数；仍保留接口路径和证据，建议结合调用点继续确认。");
  return `${lines.join("\n")}\n\n证据：\n${renderEvidenceBullets(analysis, api, 5)}`;
}

function buildApiParameterRows(api) {
  const rows = [];
  const seen = new Set();
  const add = (name, position, required, description) => {
    if (!name) return;
    const key = `${position}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push([name, position, required, description]);
  };

  for (const name of pathParamsForApi(api)) {
    add(name, "Path", "是", "路径模板中的动态参数，静态分析可确认位置，具体取值需要运行时确认。");
  }
  for (const [name, value] of Object.entries(headersForApi(api))) {
    add(name, "Header", requiredGuess("Header", name), describeParameter(name, "Header", value));
  }
  for (const [name, value] of Object.entries(mergedQueryForApi(api))) {
    add(name, "Query", requiredGuess("Query", name), describeParameter(name, "Query", value));
  }
  const bodyPosition = apiBodyPosition(api);
  for (const [name, value] of Object.entries(bodyForApi(api))) {
    add(name, bodyPosition, requiredGuess(bodyPosition, name), describeParameter(name, bodyPosition, value));
  }
  return rows;
}

function headersForApi(api) {
  return mergeMockObjects(api.headers || {}, api.requestMock?.headers || {});
}

function mergedQueryForApi(api) {
  const parsed = parseApiUrl(api.url || "");
  return mergeMockObjects(parsed.query || {}, api.query || {}, api.requestMock?.query || {});
}

function bodyForApi(api) {
  return cloneMockValue(api.requestMock?.body || api.body || {});
}

function pathParamsForApi(api) {
  const value = displayApiPath(api);
  const params = new Set();
  for (const match of findAll(/\{([A-Za-z_$][\w$.-]*)\}/g, value)) params.add(match[1]);
  for (const match of findAll(/:([A-Za-z_$][\w$.-]*)/g, value)) params.add(match[1]);
  for (const match of findAll(/\$\{([^}]{1,80})\}/g, String(api.url || api.path || ""))) params.add(match[1].trim());
  return [...params];
}

function apiBodyPosition(api) {
  const method = (api.method || "GET").toUpperCase();
  if (method === "GET" || method === "DELETE") return "Query/Body 待确认";
  return `${method} body`;
}

function requiredGuess(position, name) {
  if (position === "Path") return "是";
  if (position === "Header" && /authorization|token|sign|signature|timestamp|nonce|appid|app-id|cookie|session/i.test(name)) return "条件必填";
  if (/id$|Id$|code|token|sign|timestamp|nonce/i.test(name)) return "待确认";
  return "待确认";
}

function describeParameter(name, position, value) {
  const sample = stringifyValue(value);
  const parts = [];
  if (position === "Header" && /^content-type$/i.test(name)) parts.push("请求体内容类型");
  else if (position === "Header" && /sign|signature/i.test(name)) parts.push("签名相关请求头");
  else if (position === "Header" && /authorization|token|cookie|session/i.test(name)) parts.push("鉴权/会话相关请求头");
  else if (/page|size|limit|offset/i.test(name)) parts.push("分页或数量控制字段");
  else if (/phone|mobile/i.test(name)) parts.push("手机号相关字段");
  else if (/store|shop|seller/i.test(name)) parts.push("门店/商户相关字段");
  else if (/user|member|customer/i.test(name)) parts.push("用户/会员相关字段");
  else if (/order/i.test(name)) parts.push("订单相关字段");
  else if (/coupon|integral|point|gift/i.test(name)) parts.push("营销/资产相关字段");
  else if (/token|sign|key|secret|encrypt|iv/i.test(name)) parts.push("鉴权、签名或加密相关字段");
  else parts.push("静态分析推断字段");
  if (sample) parts.push(`示例值：${truncateMiddle(sample, 120)}`);
  parts.push("是否真实必填需结合运行时接口校验确认");
  return parts.join("；");
}

function renderHttpRequestExample(analysis, api) {
  const method = (api.method || "GET").toUpperCase();
  const requestTarget = buildExampleRequestTarget(api);
  const host = apiHostForExample(analysis, api);
  const headers = headersForApi(api);
  const body = bodyForApi(api);
  const hasBody = method !== "GET" && method !== "HEAD" && isPlainObject(body) && Object.keys(body).length > 0;
  const lines = [`${method} ${requestTarget} HTTP/1.1`, `Host: ${host}`];
  if (hasBody && !hasHeader(headers, "content-type")) lines.push("Content-Type: application/json");
  for (const [name, value] of Object.entries(headers)) {
    if (/^host$/i.test(name)) continue;
    lines.push(`${name}: ${exampleScalar(value, name)}`);
  }
  if (hasBody) {
    lines.push("");
    lines.push(formatJsonForFence(body, 1200));
  }
  return lines.join("\n");
}

function buildExampleRequestTarget(api) {
  const pathValue = displayApiPath(api);
  const pathOnly = pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
  const query = mergedQueryForApi(api);
  const queryText = Object.entries(query)
    .slice(0, 12)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(exampleScalar(value, key))}`)
    .join("&");
  return queryText ? `${pathOnly}?${queryText}` : pathOnly;
}

function apiHostForExample(analysis, api) {
  const base = api.baseUrl || parseApiUrl(api.url || "").baseUrl || "";
  try {
    if (base) return new URL(base).host;
  } catch {
    // fall through to project-level domains
  }
  return "{{base_host}}";
}

function hasHeader(headers, name) {
  return Object.keys(headers || {}).some((key) => key.toLowerCase() === name.toLowerCase());
}

function exampleScalar(value, key = "value") {
  if (value === null || value === undefined || value === "") return `{{${key}}}`;
  if (Array.isArray(value)) return value.length ? exampleScalar(value[0], key) : "[]";
  if (isPlainObject(value)) return JSON.stringify(value);
  return String(value);
}

function renderApiResponseMarkdown(api) {
  const responseKeys = summarizeResponseKeys(api.responseMock, api.metadata);
  const lines = [];
  lines.push("- 返回类型：JSON（静态推断；真实 Content-Type 需要抓包或后端文档确认）");
  if (responseKeys) {
    lines.push("- 前端可能读取/返回包可能包含：");
    for (const key of responseKeys.split(",").map((item) => item.trim()).filter(Boolean)) {
      lines.push(`  - ${codeSpan(key)}`);
    }
  } else {
    lines.push("- 当前未恢复出明确返回字段。");
  }
  const responseRootKeys = Object.keys(api.responseMock || {}).filter((key) => key !== "data");
  if (responseRootKeys.length) lines.push(`- 顶层字段线索：${responseRootKeys.map(codeSpan).join("、")}。`);
  lines.push("- 处理逻辑：当前报告只记录静态返回结构线索；状态码分支、错误码含义和跳转逻辑需要继续查看证据行附近的回调/Promise 处理。");
  return lines.join("\n");
}

function renderEvidenceBullets(analysis, item, limit = 5) {
  const snippets = evidenceSnippets(analysis, item, limit);
  if (!snippets.length) return "- 暂无直接证据行；请查看 `analysis.json` 中该条目的来源字段。";
  return snippets.map((ev) => {
    const where = ev.line ? `${ev.file}:${ev.line}` : ev.file;
    const method = ev.extractor ? `（${ev.extractor}）` : "";
    const snippet = ev.snippet ? `：${truncateMiddle(ev.snippet.replace(/\s+/g, " "), 180)}` : "";
    return `- ${codeSpan(where)}${method}${snippet}`;
  }).join("\n");
}

function renderChinesePluginAndServiceMarkdown(analysis) {
  const mp = analysis.project?.miniprogram || {};
  const packageRows = (mp.packages || []).filter((item) => item.role === "plugin").map((item) => [
    item.appid,
    item.fileCount,
    serviceDomainsForFiles(analysis, item.configFiles || []).join(", ")
  ]);
  const serviceRows = topServiceDomains(analysis, 40).map(([domain, count]) => [
    domain,
    count,
    chineseServiceCategoryForDomain(domain)
  ]);
  return `### 9.1 插件包

${table(["插件 AppID", "文件数", "相关服务线索"], packageRows)}

### 9.2 外部服务域名

${table(["域名", "出现次数", "可能角色"], serviceRows)}`;
}

function renderChineseSupplementMarkdown(analysis) {
  const discovery = analysis.supplementDiscovery || {};
  const candidates = discovery.candidates || [];
  if (!candidates.length) return "暂无补充文件候选。\n";
  const routeGapCount = candidates.filter((item) => item.type === "declared_route_without_materialized_file").length;
  const rows = candidates
    .filter((item) => item.type !== "declared_route_without_materialized_file")
    .slice(0, 80)
    .map((item) => [
      item.type,
      chineseCandidateStatus(item.status),
      item.packagePath || item.resolvedUrl || item.value,
      item.h5EntryUrl || item.parentUrl || "",
      item.reason || "",
      pct(item.confidence)
    ]);
  const routeNote = routeGapCount ? `\n声明了但没有独立落地文件的页面：${routeGapCount} 个。这类页面可能被打包进 app-service.js，报告将其作为信息线索保留。\n` : "";
  return `### 10.1 候选类型统计

${table(["类型", "数量"], topCounts(candidates, (item) => item.type || "unknown", 20))}

### 10.2 高可信候选

${table(["类型", "状态", "值", "父级/H5 证据", "原因", "可信度"], rows)}
${routeNote}`;
}

function renderChineseSecurityMarkdown(analysis) {
  const cryptoCounts = topCounts(analysis.crypto || [], (item) => item.category || "unknown", 25);
  const accountRows = (analysis.accounts || []).slice(0, 80).map((item) => [
    item.name,
    item.category,
    item.value,
    (item.files || []).slice(0, 4).join(", "),
    pct(item.confidence)
  ]);
  const sensitiveConfigs = (analysis.configs || []).filter((item) => isSensitiveConfigKey(`${item.name} ${item.category}`) || looksLikeSecretValue(item.value)).slice(0, 120);
  const sourceMaps = analysis.sourceMapDiscovery || {};
  const chunks = analysis.chunkDiscovery || {};
  const supplements = analysis.supplementDiscovery || {};
  return `### 11.1 加密/签名线索

${table(["类型", "数量"], cryptoCounts)}

${table(["名称", "类型", "文件", "辅助脚本", "可信度"], (analysis.crypto || []).slice(0, 120).map((item) => [
    item.name,
    item.category,
    (item.files || []).slice(0, 4).join(", "),
    [item.metadata?.nodeHelper, item.metadata?.pythonHelper].filter(Boolean).join(" / "),
    pct(item.confidence)
  ]))}

### 11.2 账号、密钥和敏感配置候选

说明：账号字段是候选线索。只有证据中出现真实默认值时，才应视为可用凭据；单纯的密码输入框文案不等于密码泄露。

${table(["名称", "类型", "值", "文件", "可信度"], accountRows)}

敏感配置：

${table(["名称", "类型", "值", "文件", "可信度"], sensitiveConfigs.map((item) => [
    item.name,
    item.category,
    item.value,
    (item.files || []).slice(0, 4).join(", "),
    pct(item.confidence)
  ]))}

### 11.3 Chunk、Source Map 和补充文件状态

${table(["区域", "候选数", "已下载/已发现", "需要 Base URL/待下载"], [
    ["懒加载 chunk", (chunks.candidates || []).length, (chunks.downloaded || []).length, (chunks.needsBaseUrl || []).length],
    ["Source Map", (sourceMaps.candidates || []).length, (sourceMaps.downloaded || []).length, (sourceMaps.needsBaseUrl || []).length],
    ["补充文件", (supplements.candidates || []).length, (supplements.downloaded || []).length, (supplements.downloadable || []).length]
  ])}`;
}

function renderChineseOutputFilesMarkdown(plan) {
  return `恢复/续跑命令：

\`\`\`bash
node scripts/js-analyzer.mjs resume --out "${normalizeSlash(plan.outputPath)}"
\`\`\`

${table(["文件", "用途"], [
    ["analysis.json", "完整结构化分析结果和原始证据"],
    ["analysis-state/supplement-candidates.json", "缺失插件、本地缓存、H5、远程 JS、source-map 等补充候选"],
    ["project-report.md", "中文 Markdown 报告，包含结构、功能、接口详情和附录"],
    ["postman_collection.json", "由接口候选生成的 Postman 集合"],
    ["openapi.json", "由接口候选生成的 OpenAPI 3.1 文档"],
    ["swagger-ui.html", "可搜索的本地接口工作台，带请求发送器"],
    ["analysis-state/run-summary.md", "运行状态和续跑信息"]
  ])}`;
}

function renderChineseMermaidMarkdown(analysis) {
  const diagrams = analysis.diagrams || [];
  if (diagrams.length === 0) return "暂无 Mermaid 图。\n";
  return `${table(["图", "文件"], diagrams.map((diagram) => [
    diagram.title || diagram.name,
    diagram.path
  ]))}

这些 \`.mmd\` 文件可用 Mermaid 预览器打开。报告中保留文件路径，避免在 Markdown 主体中内联过多节点。`;
}

function renderChineseRawAppendicesMarkdown(analysis) {
  const appendices = [
    ["网站/页面分析视角", renderChineseWebsiteAnalystView(analysis)],
    ["情报与外部资产视角", renderChineseIntelligenceAnalystView(analysis)],
    ["懒加载 Chunk 发现", renderChineseChunkDiscoveryMarkdown(analysis.chunkDiscovery)],
    ["Source Map 自动补全", renderChineseSourceMapDiscoveryMarkdown(analysis.sourceMapDiscovery)],
    ["架构和模块", table(["模块", "说明", "文件", "可信度"], (analysis.modules || []).slice(0, 200).map((item) => [
      item.name,
      chineseModuleDescription(item),
      (item.files || []).slice(0, 5).join(", "),
      pct(item.confidence)
    ]))],
    ["功能线索", table(["功能", "类型", "文件", "可信度"], (analysis.features || []).slice(0, 300).map((item) => [
      item.name,
      chineseFeatureCategory(item.category),
      (item.files || []).slice(0, 5).join(", "),
      pct(item.confidence)
    ]))],
    ["静态 AST 和调用图", table(["调用方", "被调用方", "文件", "行号", "模式", "可信度"], (analysis.callGraph || []).slice(0, 300).map((edge) => [
      edge.caller,
      edge.callee,
      edge.file,
      edge.line,
      edge.metadata?.mode || edge.type || "",
      pct(edge.confidence)
    ]))],
    [`完整接口候选表（${(analysis.apis || []).length} 个）`, table(["方法", "URL", "路径", "Query", "Body", "返回字段", "来源", "加密/签名", "可信度"], (analysis.apis || []).map((api) => [
      api.method,
      api.url,
      api.path,
      summarizeObjectKeys(mergedQueryForApi(api)),
      summarizeObjectKeys(bodyForApi(api)),
      summarizeResponseKeys(api.responseMock, api.metadata),
      evidenceFiles(analysis, api).slice(0, 3).join(", "),
      (api.cryptoIds || []).length ? api.cryptoIds.join(", ") : "",
      pct(api.confidence)
    ]))],
    ["配置项", table(["名称", "类型", "值", "文件", "可信度"], (analysis.configs || []).slice(0, 400).map((item) => [
      item.name,
      item.category,
      item.value,
      (item.files || []).slice(0, 3).join(", "),
      pct(item.confidence)
    ]))],
    ["外部资产", table(["类型", "值", "文件", "可信度"], (analysis.externalAssets || []).slice(0, 400).map((item) => [
      item.category,
      item.value,
      (item.files || []).slice(0, 3).join(", "),
      pct(item.confidence)
    ]))],
    ["开发者线索", table(["类型", "值", "文件", "可信度"], (analysis.developerSignals || []).slice(0, 250).map((item) => [
      item.category,
      item.value,
      (item.files || []).slice(0, 3).join(", "),
      pct(item.confidence)
    ]))],
    ["运维线索", table(["类型", "名称", "文件", "可信度"], (analysis.operationsSignals || []).slice(0, 250).map((item) => [
      item.category,
      item.name,
      (item.files || []).slice(0, 3).join(", "),
      pct(item.confidence)
    ]))],
    ["第三方服务", table(["类型", "名称", "文件", "可信度"], (analysis.thirdPartyServices || []).slice(0, 250).map((item) => [
      item.category,
      item.name,
      (item.files || []).slice(0, 3).join(", "),
      pct(item.confidence)
    ]))],
    ["证据摘录", table(["文件", "行号", "方法", "片段", "可信度"], (analysis.evidence || []).slice(0, 400).map((item) => [
      item.file,
      item.line,
      item.method || item.extractor,
      item.snippet,
      pct(item.confidence)
    ]))],
    ["不确定项和人工复核", table(["类型", "名称", "值", "文件", "可信度"], (analysis.uncertainties || []).map((item) => [
      item.category,
      item.name,
      item.value,
      (item.files || []).slice(0, 3).join(", "),
      pct(item.confidence)
    ]))]
  ];
  return `## 14. 可折叠原始附录

${appendices.map(([title, body]) => details(title, body)).join("\n\n")}`;
}

function renderChineseChunkDiscoveryMarkdown(chunkDiscovery = {}) {
  const candidates = chunkDiscovery.candidates || [];
  const downloaded = chunkDiscovery.downloaded || [];
  const publicPaths = chunkDiscovery.publicPaths || [];
  return `Public path 数量：${publicPaths.length}

已下载 chunk：${downloaded.length}

${table(["状态", "类型", "值", "解析 URL", "来源", "可信度"], candidates.slice(0, 300).map((item) => [
    chineseCandidateStatus(item.status),
    item.type,
    item.value,
    item.resolvedUrl || "",
    item.file ? `${item.file}:${item.line || 0}` : "",
    pct(item.confidence)
  ]))}`;
}

function renderChineseSourceMapDiscoveryMarkdown(sourceMapDiscovery = {}) {
  const candidates = sourceMapDiscovery.candidates || [];
  const downloaded = sourceMapDiscovery.downloaded || [];
  return `已下载 source map：${downloaded.length}

${table(["状态", "类型", "值", "解析 URL", "来源", "可信度"], candidates.slice(0, 300).map((item) => [
    chineseCandidateStatus(item.status),
    item.type,
    item.value,
    item.resolvedUrl || "",
    item.file ? `${item.file}:${item.line || 0}` : "",
    pct(item.confidence)
  ]))}`;
}

function renderChineseWebsiteAnalystView(analysis) {
  const routesAndFeatures = (analysis.features || [])
    .filter((item) => ["route_path", "ui_or_business_text", "analytics_event", "permission_or_menu_code", "api_path"].includes(item.category))
    .slice(0, 120);
  const userJourneyHints = routesAndFeatures.filter((item) => /login|auth|register|user|account|order|pay|report|download|admin|登录|注册|用户|订单|支付|报表|下载|管理/i.test(item.name));
  return `${table(["信号", "类型", "文件", "可信度"], routesAndFeatures.map((item) => [
    item.name,
    chineseFeatureCategory(item.category),
    (item.files || []).slice(0, 3).join(", "),
    pct(item.confidence)
  ]))}

用户旅程线索：

${table(["旅程/页面/文案", "类型", "证据文件"], userJourneyHints.map((item) => [
    item.name,
    chineseFeatureCategory(item.category),
    (item.files || []).slice(0, 3).join(", ")
  ]))}`;
}

function renderChineseIntelligenceAnalystView(analysis) {
  const assets = (analysis.externalAssets || []).filter((item) => item.confidence >= 0.6).slice(0, 160);
  const people = (analysis.developerSignals || []).slice(0, 100);
  const ops = (analysis.operationsSignals || []).slice(0, 100);
  const services = (analysis.thirdPartyServices || []).slice(0, 100);
  return `### 资产面

${table(["类型", "值", "文件", "可信度"], assets.map((item) => [
    item.category,
    stringifyValue(item.value),
    (item.files || []).slice(0, 3).join(", "),
    pct(item.confidence)
  ]))}

### 人员、运维和第三方服务

${table(["实体类型", "分类", "值/名称", "文件"], [...people, ...ops, ...services].slice(0, 220).map((item) => [
    item.type,
    item.category,
    stringifyValue(item.value || item.name),
    (item.files || []).slice(0, 3).join(", ")
  ]))}`;
}

function inferChineseCapabilityHints(analysis) {
  const prefixes = new Set((analysis.apis || []).map((api) => apiPrefix(api, 3)));
  const pages = new Set(analysis.project?.miniprogram?.pages || []);
  const has = (pattern) => [...prefixes, ...pages].some((item) => pattern.test(item));
  const hints = [];
  if (has(/goods|cart|order|shop|mall|catering/i)) hints.push("商品浏览、购物车、下单、门店选择、商城和餐饮相关流程。");
  if (has(/crm|member|coupon|gift|integral|storedValue|asset/i)) hints.push("会员资产能力：优惠券、积分、礼品卡、储值、账户资产和 CRM 标签。");
  if (has(/activity|marketing|promote|invite|spell|lottery|bargain/i)) hints.push("营销增长能力：活动页、推广/分销、邀请、抽奖、拼团、砍价和券包。");
  if (has(/refund|after.?sale|invoice|address|delivery|logistics/i)) hints.push("售后和履约能力：退款/售后、发票、地址、配送和物流。");
  if (has(/enterpriseWechat|wework|work/i)) hints.push("企业微信、社群或导购素材相关集成。");
  if (has(/wechatpay|busifavor|industrycoupon|coupon/i)) hints.push("微信支付商家券、优惠券发放或支付相关集成。");
  return hints;
}

function chineseFeatureCategory(category) {
  const map = {
    route_path: "路由/页面",
    ui_or_business_text: "界面/业务文案",
    analytics_event: "埋点事件",
    permission_or_menu_code: "权限/菜单码",
    api_path: "接口路径",
    unknown: "未分类"
  };
  return map[category] || category || "未分类";
}

function chineseServiceCategoryForDomain(domain) {
  if (/wechatpay|action\.weixin/.test(domain)) return "微信支付/商家券";
  if (/work\.weixin|wwcdn\.weixin/.test(domain)) return "企业微信/社群素材";
  if (/qmai|qimai|zmcms/.test(domain)) return "Qmai API/CDN 生态";
  if (/qq\.com|weixin/.test(domain)) return "微信/腾讯生态";
  return "外部服务";
}

function chineseCandidateStatus(status) {
  const map = {
    candidate: "候选",
    needs_base_url: "需要 Base URL",
    local_exists: "本地已存在",
    downloaded: "已下载",
    skipped: "已跳过",
    failed: "失败",
    found_local_package: "本地找到包",
    not_found: "未找到"
  };
  return map[status] || status || "";
}

function displayApiPath(api) {
  const parsed = parseApiUrl(api.url || api.path || "");
  let value = parsed.path || api.path || api.url || "";
  if (!value && api.id) value = `/unknown/${api.id}`;
  value = String(value).split("?")[0];
  if (!value.startsWith("/") && !/^[A-Za-z_$][\w$]*\(/.test(value)) value = `/${value}`;
  return value || "/";
}

function chineseModuleDescription(item) {
  const text = item?.description || item?.category || "";
  const match = /^Mini Program route group\s+(.+)$/i.exec(text);
  if (match) return `小程序路由分组：${match[1]}`;
  if (/^source/i.test(text)) return "源码/业务模块";
  return text;
}

function chineseRequestConstruction(value) {
  const text = String(value || "");
  if (!text) return "";
  if (/Static call-site extraction/i.test(text)) return "来自静态调用点提取；需要结合 wrapper、拦截器和证据行确认真实运行时构造。";
  if (/Review wrapper\/interceptor/i.test(text)) return text.replace(/Review wrapper\/interceptor evidence for exact runtime construction\.?/i, "需要结合 wrapper/拦截器证据确认真实运行时构造。");
  return text;
}

function formatAuthHint(auth) {
  if (!auth) return "";
  if (isPlainObject(auth) && Object.keys(auth).length === 0) return "";
  if (isPlainObject(auth)) {
    const type = String(auth.type || auth.category || "");
    const source = auth.source ? `；来源：${auth.source}` : "";
    if (/cookie|session/i.test(type)) return `疑似 Cookie/Session 鉴权${source}`;
    if (/bearer|token|jwt/i.test(type)) return `疑似 Bearer/Token 鉴权${source}`;
    if (/signature|sign/i.test(type)) return `疑似签名鉴权${source}`;
    return `${stringifyValue(auth)}`;
  }
  return stringifyValue(auth);
}

function inferApiAuthHint(api) {
  const headers = headersForApi(api);
  const names = Object.keys(headers);
  const hints = [];
  if (names.some((name) => /authorization|token|cookie|session/i.test(name))) hints.push("Header 中存在鉴权/会话字段");
  if (names.some((name) => /sign|signature|timestamp|nonce/i.test(name))) hints.push("Header 中存在签名/时间戳字段");
  if ((api.cryptoIds || []).length) hints.push("关联静态加密/签名线索");
  return hints.join("；");
}

function formatJsonForFence(value, maxLength = 1600) {
  return truncateMiddle(JSON.stringify(value ?? {}, null, 2), maxLength);
}

function codeSpan(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  if (!text) return "`未识别`";
  if (!text.includes("`")) return `\`${text}\``;
  if (!text.includes("``")) return `\`\`${text}\`\``;
  return `\`\`\`${text}\`\`\``;
}

function safeHeading(value) {
  return truncateMiddle(String(value || "").replace(/[\r\n#<>]/g, " ").trim(), 140);
}

function renderExecutiveSummary(analysis, metrics) {
  const project = analysis.project || {};
  const mp = project.miniprogram || {};
  const packages = mp.packages || [];
  const mainPackage = packages.find((item) => item.role === "app");
  const plugins = packages.filter((item) => item.role === "plugin");
  const topApi = topCounts(analysis.apis || [], (api) => apiPrefix(api, 2), 6)
    .map(([prefix, count]) => `${prefix} (${count})`)
    .join(", ");
  const domains = preferredGatewayDomains(analysis, 6).join(", ");
  const crypto = topCounts(analysis.crypto || [], (item) => item.category || "unknown", 6)
    .map(([category, count]) => `${category} (${count})`)
    .join(", ");

  const lines = [];
  lines.push(`- Project classification: ${project.primaryType || "unknown"}${(project.detectedTypes || []).length > 1 ? `; also detected ${(project.detectedTypes || []).filter((item) => item !== project.primaryType).join(", ")}` : ""}.`);
  if (mainPackage || plugins.length) lines.push(`- Package layout: main package ${mainPackage?.appid || project.appid || "unknown"} plus ${plugins.length} plugin package(s): ${plugins.map((item) => item.appid).join(", ") || "none"}.`);
  if (mp.appName || project.appid) lines.push(`- App identity: ${mp.appName || project.name || "unknown"}; appid=${project.appid || mp.appid || ""}${mp.appVersion ? `; version=${mp.appVersion}` : ""}${mp.storeId ? `; storeId=${mp.storeId}` : ""}${mp.env ? `; env=${mp.env}` : ""}.`);
  lines.push(`- Extraction volume: ${metrics.apiCount} API candidates, ${metrics.pathCount} OpenAPI-style paths, ${metrics.configCount} configs, ${metrics.cryptoCount} crypto/signature leads, ${metrics.assetCount} external assets, ${metrics.evidenceCount} evidence records.`);
  if (topApi) lines.push(`- Highest-frequency API areas: ${topApi}.`);
  if (domains) lines.push(`- Main external domains observed: ${domains}.`);
  if (crypto) lines.push(`- Crypto/signature buckets are leads, not final algorithm attribution: ${crypto}.`);
  lines.push("- Confidence note: this is static analysis of bundled/minified JavaScript. Treat generated API bodies, auth hints, accounts, and crypto labels as candidates until manually confirmed at source call sites.");
  return lines.join("\n");
}

function renderMiniProgramMarkdown(analysis) {
  const project = analysis.project || {};
  const mp = project.miniprogram || {};
  if (!mp.configFiles?.length && !mp.pageCount && !project.appid) return "_No Mini Program metadata extracted yet._\n";
  const facts = table(["Field", "Value"], [
    ["App name", mp.appName || project.name || ""],
    ["AppID", project.appid || mp.appid || ""],
    ["Version", mp.appVersion || ""],
    ["Store ID", mp.storeId || ""],
    ["Environment", mp.env || ""],
    ["Entry page", mp.entryPagePath || ""],
    ["Pages", mp.pageCount || 0],
    ["Subpackages", mp.subPackageCount || 0],
    ["Request timeout", stringifyValue(mp.networkTimeout || {})],
    ["Required private infos", (mp.requiredPrivateInfos || []).join(", ")],
    ["Config files", (mp.configFiles || []).join(", ")]
  ]);
  const packages = table(["Package", "Role", "Files", "Configs"], (mp.packages || []).map((item) => [
    item.appid,
    item.role,
    item.fileCount,
    (item.configFiles || []).join(", ")
  ]));
  const tabBar = table(["Text", "Page", "Code", "Link text"], ((mp.tabBar && mp.tabBar.list) || []).map((item) => [
    item.text,
    item.pagePath,
    item.code,
    item.linkText
  ]));
  const plugins = table(["Plugin", "Provider", "Version", "Subpackage"], Object.entries(mp.plugins || {}).map(([name, plugin]) => [
    name,
    plugin?.provider || "",
    plugin?.version || "",
    plugin?.subpackage || ""
  ]));
  const pageRoots = table(["Page root", "Count"], topCounts((mp.pages || []).map((page) => ({ page })), (item) => pageRoot(item.page), 20));
  return `### Identity

${facts}

### Packages

${packages}

### Tab Bar

${tabBar}

### Declared Plugins

${plugins}

### Top Page Roots

${pageRoots}`;
}

function renderBusinessCapabilityMarkdown(analysis) {
  const pageRoots = topCounts((analysis.project?.miniprogram?.pages || []).map((page) => ({ page })), (item) => pageRoot(item.page), 15);
  const featureCategories = topCounts(analysis.features || [], (item) => item.category || "unknown", 12);
  const apiPrefixes = topCounts(analysis.apis || [], (api) => apiPrefix(api, 2), 15);
  const capabilityHints = inferCapabilityHints(analysis);
  return `${table(["Signal", "Count"], [
    ...pageRoots.map(([name, count]) => [`page:${name}`, count]),
    ...apiPrefixes.map(([name, count]) => [`api:${name}`, count])
  ].slice(0, 24))}

Feature signal categories:

${table(["Category", "Count"], featureCategories)}

Likely business areas:

${capabilityHints.length ? capabilityHints.map((item) => `- ${item}`).join("\n") : "_No capability hints inferred._"}`;
}

function renderGatewayMarkdown(analysis) {
  const methods = topCounts(analysis.apis || [], (api) => api.method || "GET", 12);
  const prefixes = topCounts(analysis.apis || [], (api) => apiPrefix(api, 2), 25);
  const domains = topApiServiceDomains(analysis, 30);
  const apiRows = (analysis.apis || []).slice(0, 60).map((api) => [
    api.method,
    api.url || api.path,
    apiPrefix(api, 2),
    summarizeObjectKeys(api.query),
    summarizeObjectKeys(api.requestMock?.body || api.body),
    summarizeResponseKeys(api.responseMock, api.metadata),
    evidenceFiles(analysis, api).slice(0, 2).join(", "),
    pct(api.confidence)
  ]);
  return `### Domains

${table(["Domain", "Count"], domains)}

### Method Mix

${table(["Method", "Count"], methods)}

### Top API Prefixes

${table(["Prefix", "Count"], prefixes)}

### First 60 API Candidates

${table(["Method", "URL", "Group", "Query", "Body", "Response Hints", "Evidence", "Confidence"], apiRows)}`;
}

function renderPluginAndServiceMarkdown(analysis) {
  const mp = analysis.project?.miniprogram || {};
  const packageRows = (mp.packages || []).filter((item) => item.role === "plugin").map((item) => [
    item.appid,
    item.fileCount,
    serviceDomainsForFiles(analysis, item.configFiles || []).join(", ")
  ]);
  const serviceRows = topServiceDomains(analysis, 25).map(([domain, count]) => [
    domain,
    count,
    serviceCategoryForDomain(domain)
  ]);
  return `### Plugin Packages

${table(["Package AppID", "Files", "Observed service hints"], packageRows)}

### External Service Domains

${table(["Domain", "Count", "Likely role"], serviceRows)}`;
}

function renderSupplementMarkdown(analysis) {
  const discovery = analysis.supplementDiscovery || {};
  const candidates = discovery.candidates || [];
  if (!candidates.length) return "_No supplemental file candidates discovered._\n";
  const routeGapCount = candidates.filter((item) => item.type === "declared_route_without_materialized_file").length;
  const rows = candidates
    .filter((item) => item.type !== "declared_route_without_materialized_file")
    .slice(0, 40)
    .map((item) => [
      item.type,
      item.status,
      item.packagePath || item.resolvedUrl || item.value,
      item.h5EntryUrl || item.parentUrl || "",
      item.reason || "",
      pct(item.confidence)
    ]);
  const routeNote = routeGapCount ? `\nDeclared routes without standalone files: ${routeGapCount}. These may be embedded in app-service.js and are retained as informational leads.\n` : "";
  return `### Candidate Counts

${table(["Type", "Count"], topCounts(candidates, (item) => item.type || "unknown", 12))}

### Highest-Confidence Candidates

${table(["Type", "Status", "Value", "Parent/H5 Evidence", "Reason", "Confidence"], rows)}
${routeNote}`;
}

function renderSecurityMarkdown(analysis) {
  const cryptoCounts = topCounts(analysis.crypto || [], (item) => item.category || "unknown", 20);
  const accountRows = (analysis.accounts || []).slice(0, 50).map((item) => [
    item.name,
    item.category,
    item.value,
    (item.files || []).slice(0, 3).join(", "),
    pct(item.confidence)
  ]);
  const sensitiveConfigs = (analysis.configs || []).filter((item) => isSensitiveConfigKey(`${item.name} ${item.category}`) || looksLikeSecretValue(item.value)).slice(0, 80);
  const sourceMaps = analysis.sourceMapDiscovery || {};
  const chunks = analysis.chunkDiscovery || {};
  const supplements = analysis.supplementDiscovery || {};
  return `### Crypto and Signature Lead Buckets

${table(["Category", "Count"], cryptoCounts)}

${table(["Name", "Category", "Files", "Helpers", "Confidence"], (analysis.crypto || []).slice(0, 80).map((item) => [
  item.name,
  item.category,
  (item.files || []).slice(0, 4).join(", "),
  [item.metadata?.nodeHelper, item.metadata?.pythonHelper].filter(Boolean).join(" / "),
  pct(item.confidence)
]))}

### Candidate Secrets and Accounts

The accounts bucket is candidate-only. UI labels such as password prompts are not credentials unless a real default value is present in the evidence.

${table(["Name", "Category", "Value", "Files", "Confidence"], accountRows)}

Sensitive-looking configs:

${table(["Name", "Category", "Value", "Files", "Confidence"], sensitiveConfigs.map((item) => [
  item.name,
  item.category,
  item.value,
  (item.files || []).slice(0, 3).join(", "),
  pct(item.confidence)
]))}

### Chunk and Source Map Status

${table(["Area", "Candidates", "Downloaded", "Needs base URL"], [
  ["Lazy chunks", (chunks.candidates || []).length, (chunks.downloaded || []).length, (chunks.needsBaseUrl || []).length],
  ["Source maps", (sourceMaps.candidates || []).length, (sourceMaps.downloaded || []).length, (sourceMaps.needsBaseUrl || []).length],
  ["Supplements", (supplements.candidates || []).length, (supplements.downloaded || []).length, (supplements.downloadable || []).length]
])}`;
}

function renderRawAppendicesMarkdown(analysis) {
  const appendices = [
    ["Website Analyst View", renderWebsiteAnalystView(analysis)],
    ["Intelligence Analyst View", renderIntelligenceAnalystView(analysis)],
    ["Lazy Chunk Discovery", renderChunkDiscoveryMarkdown(analysis.chunkDiscovery)],
    ["Source Map Auto-Completion", renderSourceMapDiscoveryMarkdown(analysis.sourceMapDiscovery)],
    ["Architecture and Modules", table(["Module", "Description", "Files", "Confidence"], (analysis.modules || []).slice(0, 120).map((item) => [
      item.name,
      item.description || item.category,
      (item.files || []).slice(0, 5).join(", "),
      pct(item.confidence)
    ]))],
    ["Features", table(["Feature", "Category", "Files", "Confidence"], (analysis.features || []).slice(0, 200).map((item) => [
      item.name,
      item.category,
      (item.files || []).slice(0, 5).join(", "),
      pct(item.confidence)
    ]))],
    ["Static AST and Call Graph", table(["Caller", "Callee", "File", "Line", "Mode", "Confidence"], (analysis.callGraph || []).slice(0, 200).map((edge) => [
      edge.caller,
      edge.callee,
      edge.file,
      edge.line,
      edge.metadata?.mode || "",
      pct(edge.confidence)
    ]))],
    [`Complete API Candidate Table (${(analysis.apis || []).length})`, table(["Method", "URL", "Path", "Query", "Body", "Response Hints", "Source", "Crypto", "Confidence"], (analysis.apis || []).map((api) => [
      api.method,
      api.url,
      api.path,
      summarizeObjectKeys(api.query),
      summarizeObjectKeys(api.requestMock?.body || api.body),
      summarizeResponseKeys(api.responseMock, api.metadata),
      evidenceFiles(analysis, api).slice(0, 3).join(", "),
      (api.cryptoIds || []).length ? api.cryptoIds.join(", ") : "",
      pct(api.confidence)
    ]))],
    ["Configs", table(["Name", "Category", "Value", "Files", "Confidence"], (analysis.configs || []).slice(0, 300).map((item) => [
      item.name,
      item.category,
      item.value,
      (item.files || []).slice(0, 3).join(", "),
      pct(item.confidence)
    ]))],
    ["External Assets", table(["Category", "Value", "Files", "Confidence"], (analysis.externalAssets || []).slice(0, 300).map((item) => [
      item.category,
      item.value,
      (item.files || []).slice(0, 3).join(", "),
      pct(item.confidence)
    ]))],
    ["Developer Signals", table(["Category", "Value", "Files", "Confidence"], (analysis.developerSignals || []).slice(0, 200).map((item) => [
      item.category,
      item.value,
      (item.files || []).slice(0, 3).join(", "),
      pct(item.confidence)
    ]))],
    ["Operations Signals", table(["Category", "Name", "Files", "Confidence"], (analysis.operationsSignals || []).slice(0, 200).map((item) => [
      item.category,
      item.name,
      (item.files || []).slice(0, 3).join(", "),
      pct(item.confidence)
    ]))],
    ["Third-Party Services", table(["Category", "Name", "Files", "Confidence"], (analysis.thirdPartyServices || []).slice(0, 200).map((item) => [
      item.category,
      item.name,
      (item.files || []).slice(0, 3).join(", "),
      pct(item.confidence)
    ]))],
    ["Evidence Highlights", table(["File", "Line", "Method", "Snippet", "Confidence"], (analysis.evidence || []).slice(0, 300).map((item) => [
      item.file,
      item.line,
      item.method,
      item.snippet,
      pct(item.confidence)
    ]))],
    ["Uncertainties and Manual Review", table(["Category", "Name", "Value", "Files", "Confidence"], (analysis.uncertainties || []).map((item) => [
      item.category,
      item.name,
      item.value,
      (item.files || []).slice(0, 3).join(", "),
      pct(item.confidence)
    ]))]
  ];
  return `## Collapsible Raw Appendices

${appendices.map(([title, body]) => details(title, body)).join("\n\n")}`;
}

function details(title, body) {
  return `<details>
<summary>${escapeHtml(title)}</summary>

${body}

</details>`;
}

function topCounts(items, keyFn, limit = 10) {
  const counts = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, limit);
}

function apiPrefix(api, depth = 2) {
  const parsed = parseApiUrl(api.url || "");
  let value = parsed.path || api.path || api.url || "";
  value = String(value).split("?")[0];
  if (!value.startsWith("/")) value = `/${value}`;
  const parts = value.split("/").filter(Boolean).slice(0, depth);
  return parts.length ? `/${parts.join("/")}` : "/";
}

function pageRoot(page) {
  const parts = String(page || "").split("/").filter(Boolean);
  if (parts.length === 0) return "";
  if (/^plugin/i.test(parts[0])) return parts[0];
  if (parts[0] === "subPages" && parts[1]) return `${parts[0]}/${parts[1]}`;
  if (parts[0] === "pages" && parts[1]) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

function topServiceDomains(analysis, limit = 20) {
  const values = [
    ...(analysis.apis || []).map((api) => api.baseUrl || api.url),
    ...(analysis.externalAssets || []).map((item) => item.value || item.name)
  ];
  return topCounts(values.map((value) => ({ value })), (item) => domainFromValue(item.value), limit);
}

function topApiServiceDomains(analysis, limit = 20) {
  const apiAssetCategories = new Set(["api", "gateway", "websocket", "config_center", "service_discovery"]);
  const values = [
    ...(analysis.apis || []).map((api) => api.baseUrl || api.url),
    ...(analysis.externalAssets || [])
      .filter((item) => apiAssetCategories.has(item.category) || /webapi|tiktokapi|sockets|wechatpay|action\.weixin|work\.weixin|open\.qmai|open\.weixin|console\.qmai|pth5|scrmh5|mp\.zhls|zmcms/i.test(String(item.value || item.name)))
      .map((item) => item.value || item.name)
  ];
  return topCounts(values.map((value) => ({ value })), (item) => domainFromValue(item.value), limit);
}

function preferredGatewayDomains(analysis, limit = 8) {
  const allDomains = new Set([
    ...(analysis.apis || []).map((api) => domainFromValue(api.baseUrl || api.url)),
    ...(analysis.externalAssets || []).map((item) => domainFromValue(item.value || item.name))
  ].filter(Boolean));
  const preferredPatterns = [
    /^webapi\./i,
    /^sockets\./i,
    /^tiktokapi\./i,
    /^action\.(wechatpay|weixin)\./i,
    /^work\.weixin\./i,
    /^open\.qmai\./i,
    /^console\.qmai\./i,
    /^pth5/i,
    /^scrmh5/i,
    /^mp\.zhls\./i
  ];
  const preferred = [];
  for (const pattern of preferredPatterns) {
    for (const domain of allDomains) {
      if (pattern.test(domain) && !preferred.includes(domain)) preferred.push(domain);
    }
  }
  for (const [domain] of topApiServiceDomains(analysis, limit * 2)) {
    if (!preferred.includes(domain)) preferred.push(domain);
  }
  return preferred.slice(0, limit);
}

function domainFromValue(value) {
  const text = String(value || "");
  try {
    if (/^https?:\/\//i.test(text) || /^wss?:\/\//i.test(text)) return new URL(text).host;
    if (/^\/\//.test(text)) return new URL(`https:${text}`).host;
  } catch {
    return "";
  }
  return "";
}

function serviceDomainsForFiles(analysis, files = []) {
  const roots = new Set(files.map((file) => String(file).split("/")[0]).filter(Boolean));
  const domains = new Set();
  for (const asset of analysis.externalAssets || []) {
    const assetFiles = asset.files || [];
    if (assetFiles.some((file) => roots.has(String(file).split("/")[0]))) {
      const domain = domainFromValue(asset.value || asset.name);
      if (domain) domains.add(domain);
    }
  }
  return [...domains].slice(0, 6);
}

function serviceCategoryForDomain(domain) {
  if (/wechatpay|action\.weixin/.test(domain)) return "WeChat Pay / coupon plugin";
  if (/work\.weixin|wwcdn\.weixin/.test(domain)) return "WeCom / group material";
  if (/qmai|qimai|zmcms/.test(domain)) return "Qmai API/CDN ecosystem";
  if (/qq\.com|weixin/.test(domain)) return "WeChat/Tencent ecosystem";
  return "external";
}

function inferCapabilityHints(analysis) {
  const prefixes = new Set((analysis.apis || []).map((api) => apiPrefix(api, 3)));
  const pages = new Set(analysis.project?.miniprogram?.pages || []);
  const has = (pattern) => [...prefixes, ...pages].some((item) => pattern.test(item));
  const hints = [];
  if (has(/goods|cart|order|shop|mall|catering/i)) hints.push("Goods browsing, cart, ordering, store selection, and mall flows.");
  if (has(/crm|member|coupon|gift|integral|storedValue|asset/i)) hints.push("Membership assets: coupons, points, gift cards, stored value, and account assets.");
  if (has(/activity|marketing|promote|invite|spell|lottery|bargain/i)) hints.push("Marketing and growth flows: activity pages, promoter/referral, invitation, lottery, coupon packages, and group buying.");
  if (has(/refund|after.?sale|invoice|address|delivery/i)) hints.push("After-sale and operations flows: refund/after-sale, invoice, address, delivery, and logistics.");
  if (has(/enterpriseWechat|wework|work/i)) hints.push("Enterprise WeChat / customer group integrations are present.");
  if (has(/wechatpay|busifavor|industrycoupon|coupon/i)) hints.push("WeChat Pay merchant coupon / coupon issuance integrations are present.");
  return hints;
}

function renderChunkDiscoveryMarkdown(chunkDiscovery = {}) {
  const candidates = chunkDiscovery.candidates || [];
  const downloaded = chunkDiscovery.downloaded || [];
  const publicPaths = chunkDiscovery.publicPaths || [];
  return `Public paths: ${publicPaths.length}

Downloaded chunks: ${downloaded.length}

${table(["Status", "Type", "Value", "Resolved URL", "Source", "Confidence"], candidates.slice(0, 200).map((item) => [
  item.status,
  item.type,
  item.value,
  item.resolvedUrl || "",
  item.file ? `${item.file}:${item.line || 0}` : "",
  pct(item.confidence)
]))}`;
}

function renderSourceMapDiscoveryMarkdown(sourceMapDiscovery = {}) {
  const candidates = sourceMapDiscovery.candidates || [];
  const downloaded = sourceMapDiscovery.downloaded || [];
  return `Downloaded source maps: ${downloaded.length}

${table(["Status", "Type", "Value", "Resolved URL", "Source", "Confidence"], candidates.slice(0, 200).map((item) => [
  item.status,
  item.type,
  item.value,
  item.resolvedUrl || "",
  item.file ? `${item.file}:${item.line || 0}` : "",
  pct(item.confidence)
]))}`;
}

function renderMermaidMarkdown(analysis) {
  const diagrams = analysis.diagrams || [];
  if (diagrams.length === 0) return "_No diagrams generated._";
  return `${table(["Diagram", "File"], diagrams.map((diagram) => [
    diagram.title || diagram.name,
    diagram.path
  ]))}

Open these \`.mmd\` files in a Mermaid-aware viewer when you want the graph. The Markdown report links to the diagram files instead of inlining hundreds of graph nodes.`;
}

function renderWebsiteAnalystView(analysis) {
  const routesAndFeatures = (analysis.features || [])
    .filter((item) => ["route_path", "ui_or_business_text", "analytics_event", "permission_or_menu_code", "api_path"].includes(item.category))
    .slice(0, 80);
  const userJourneyHints = routesAndFeatures.filter((item) => /login|auth|register|user|account|order|pay|report|download|admin|登录|注册|用户|订单|支付|报表|下载|管理/i.test(item.name));
  return `${table(["Signal", "Category", "Files", "Confidence"], routesAndFeatures.map((item) => [
    item.name,
    item.category,
    (item.files || []).slice(0, 3).join(", "),
    pct(item.confidence)
  ]))}

Journey hints:

${table(["Journey", "Category", "Evidence files"], userJourneyHints.map((item) => [
  item.name,
  item.category,
  (item.files || []).slice(0, 3).join(", ")
]))}`;
}

function renderIntelligenceAnalystView(analysis) {
  const assets = (analysis.externalAssets || []).filter((item) => item.confidence >= 0.6).slice(0, 120);
  const people = (analysis.developerSignals || []).slice(0, 80);
  const ops = (analysis.operationsSignals || []).slice(0, 80);
  const services = (analysis.thirdPartyServices || []).slice(0, 80);
  return `### Asset Surface

${table(["Category", "Value", "Files", "Confidence"], assets.map((item) => [
  item.category,
  stringifyValue(item.value),
  (item.files || []).slice(0, 3).join(", "),
  pct(item.confidence)
]))}

### People and Operations

${table(["Type", "Category", "Value/Name", "Files"], [...people, ...ops, ...services].slice(0, 160).map((item) => [
  item.type,
  item.category,
  stringifyValue(item.value || item.name),
  (item.files || []).slice(0, 3).join(", ")
]))}`;
}

function evidenceFiles(analysis, item) {
  const ids = new Set(item.evidenceIds || []);
  return (analysis.evidence || []).filter((ev) => ids.has(ev.id)).map((ev) => `${ev.file}:${ev.line}`);
}

function evidenceSnippets(analysis, item, limit = 3) {
  const ids = new Set(item.evidenceIds || []);
  return (analysis.evidence || [])
    .filter((ev) => ids.has(ev.id))
    .slice(0, limit)
    .map((ev) => ({
      file: ev.file,
      line: ev.line,
      extractor: ev.extractor || ev.method || ev.type || "",
      snippet: truncateMiddle(ev.snippet || "", 500)
    }));
}

function summarizeObjectKeys(value, limit = 8) {
  if (!isPlainObject(value) || Object.keys(value).length === 0) return "";
  const keys = Object.keys(value);
  const shown = keys.slice(0, limit).join(", ");
  return keys.length > limit ? `${shown}, +${keys.length - limit} more` : shown;
}

function summarizeResponseKeys(responseMock, metadata = {}) {
  const keys = new Set([...(metadata.responseKeys || []), ...(metadata.responseRootKeys || [])]);
  if (isPlainObject(responseMock?.data)) for (const key of Object.keys(responseMock.data)) keys.add(`data.${key}`);
  for (const key of Object.keys(responseMock || {})) {
    if (!["code", "message", "data"].includes(key)) keys.add(key);
  }
  return [...keys].slice(0, 10).join(", ");
}

function table(headers, rows) {
  if (!rows || rows.length === 0) return "暂无发现。\n";
  const head = `| ${headers.map(cell).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(cell).join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}\n`;
}

function cell(value) {
  return truncateMiddle(stringifyValue(value), 360).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function stringifyValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function truncateMiddle(value, maxLength = 360) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  const head = Math.max(20, Math.floor(maxLength * 0.62));
  const tail = Math.max(10, maxLength - head - 15);
  return `${text.slice(0, head)} ...[truncated]... ${text.slice(-tail)}`;
}

function pct(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return "";
  return `${Math.round(Number(value) * 100)}%`;
}

async function runRenderPostman(plan, p, current) {
  const analysis = await readJson(p.analysis);
  const collection = renderPostman(analysis);
  await writeJson(p.postman, collection);
  current.outputFiles = [p.postman];
}

function renderPostman(analysis) {
  const folders = new Map();
  for (const api of analysis.apis || []) {
    const module = (analysis.modules || []).find((item) => item.id === api.moduleId);
    const folderName = module?.name || "Discovered APIs";
    if (!folders.has(folderName)) folders.set(folderName, []);
    folders.get(folderName).push(renderPostmanItem(api, analysis));
  }

  return {
    info: {
      name: `${analysis.project?.name || "JS Project"} API Collection`,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      description: "Generated by js-analyzer-skill from static JavaScript analysis."
    },
    variable: buildPostmanVariables(analysis),
    item: [...folders.entries()].map(([name, item]) => ({ name, item }))
  };
}

function buildPostmanVariables(analysis) {
  const vars = [];
  const baseUrls = new Set((analysis.apis || []).map((api) => api.baseUrl).filter(Boolean));
  if (baseUrls.size > 0) vars.push({ key: "base_url", value: [...baseUrls][0], type: "string" });
  for (const config of (analysis.configs || []).slice(0, 100)) {
    const key = safeName(config.name).replace(/-/g, "_");
    if (!key) continue;
    vars.push({ key, value: stringifyValue(config.value), type: "string" });
  }
  return dedupePostmanVariables(vars).slice(0, 100);
}

function dedupePostmanVariables(vars) {
  const map = new Map();
  for (const item of vars) if (!map.has(item.key)) map.set(item.key, item);
  return [...map.values()];
}

function renderPostmanItem(api, analysis) {
  const parsed = parseApiUrl(api.url);
  const query = mergeMockObjects(parsed.query || {}, api.query || {});
  const rawUrlBase = api.url.startsWith("http") || api.url.startsWith("//") ? api.url : `{{base_url}}${api.path?.startsWith("/") ? api.path : `/${api.path || ""}`}`;
  const rawUrl = appendQueryString(rawUrlBase, query);
  const description = [
    api.metadata?.requestConstruction,
    `Confidence: ${pct(api.confidence)}`,
    `Evidence: ${evidenceFiles(analysis, api).join(", ") || "none"}`,
    (api.cryptoIds || []).length ? `Crypto: ${(api.cryptoIds || []).join(", ")}` : ""
  ].filter(Boolean).join("\n");

  const item = {
    name: api.name || `${api.method} ${api.path}`,
    request: {
      method: api.method || "GET",
      header: Object.entries(api.headers || {}).map(([key, value]) => ({ key, value: String(value) })),
      url: {
        raw: rawUrl,
        protocol: rawUrl.startsWith("https") ? "https" : rawUrl.startsWith("http") ? "http" : undefined,
        host: parsed.baseUrl ? parsed.baseUrl.replace(/^https?:\/\//, "").split(".") : ["{{base_url}}"],
        path: (api.path || "").split("/").filter(Boolean),
        query: Object.entries(query).map(([key, value]) => ({ key, value: String(value) }))
      },
      description
    }
  };

  if (!["GET", "HEAD"].includes(String(api.method).toUpperCase())) {
    item.request.body = {
      mode: "raw",
      raw: JSON.stringify(api.requestMock?.body || api.body || {}, null, 2),
      options: { raw: { language: "json" } }
    };
  }

  if ((api.cryptoIds || []).length > 0) {
    item.event = [{
      listen: "prerequest",
      script: {
        type: "text/javascript",
        exec: [
          "// Review generated crypto helpers before using this against a live endpoint.",
          "pm.variables.set('timestamp', String(Date.now()));",
          "pm.variables.set('nonce', Math.random().toString(16).slice(2));"
        ]
      }
    }];
  }

  return item;
}

function appendQueryString(rawUrl, query) {
  const existingKeys = new Set();
  const queryIndex = String(rawUrl).indexOf("?");
  if (queryIndex !== -1) {
    for (const part of String(rawUrl).slice(queryIndex + 1).split("&")) {
      const [key] = part.split("=");
      if (key) existingKeys.add(safeDecodeURIComponent(key));
    }
  }
  const entries = Object.entries(query || {}).filter(([key]) => !existingKeys.has(key));
  if (entries.length === 0) return rawUrl;
  const existing = rawUrl.includes("?") ? "&" : "?";
  return `${rawUrl}${existing}${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")}`;
}

async function runRenderOpenApi(plan, p, current) {
  const analysis = await readJson(p.analysis);
  const openapi = renderOpenApi(analysis, plan);
  await writeJson(p.openapi, openapi);
  current.outputFiles = [p.openapi];
}

function renderOpenApi(analysis, plan) {
  const servers = [...new Set((analysis.apis || []).map((api) => api.baseUrl).filter(Boolean))].map((url) => ({ url }));
  const doc = {
    openapi: "3.1.0",
    info: {
      title: `${analysis.project?.name || "JS Project"} API`,
      version: analysis.project?.packageInfo?.version || "0.0.0",
      description: "Generated by js-analyzer-skill from static JavaScript analysis."
    },
    servers: servers.length > 0 ? servers : [{ url: "http://localhost" }],
    tags: (analysis.modules || []).slice(0, 100).map((item) => ({ name: item.name, description: item.description || item.category })),
    paths: {},
    components: {
      schemas: {
        GenericResponse: {
          type: "object",
          additionalProperties: true
        }
      }
    },
    "x-js-analysis": {
      project: analysis.project,
      progress: summarizePlan(plan),
      configs: analysis.configs,
      accounts: analysis.accounts,
      externalAssets: analysis.externalAssets,
      chunkDiscovery: analysis.chunkDiscovery,
      sourceMapDiscovery: analysis.sourceMapDiscovery,
      supplementDiscovery: analysis.supplementDiscovery,
      callGraphStats: analysis.callGraphStats,
      callGraph: (analysis.callGraph || []).slice(0, 500),
      diagrams: analysis.diagrams || [],
      developerSignals: analysis.developerSignals,
      operationsSignals: analysis.operationsSignals,
      thirdPartyServices: analysis.thirdPartyServices,
      crypto: analysis.crypto,
      uncertainties: analysis.uncertainties
    }
  };

  for (const api of analysis.apis || []) {
    const parsed = parseApiUrl(api.url);
    const apiPath = normalizeOpenApiPath(parsed.path || api.path || `/unknown/${api.id}`);
    doc.paths[apiPath] = doc.paths[apiPath] || {};
    const method = String(api.method || "GET").toLowerCase();
    const requestBodyExample = api.requestMock?.body || api.body || {};
    const responseExample = api.responseMock || genericResponseMock();
    doc.paths[apiPath][method] = {
      summary: api.name || `${api.method} ${apiPath}`,
      tags: [((analysis.modules || []).find((item) => item.id === api.moduleId)?.name) || "Discovered APIs"],
      description: api.metadata?.requestConstruction || "Static JavaScript API finding.",
      parameters: buildOpenApiParameters(api, apiPath),
      requestBody: ["get", "head"].includes(method) ? undefined : {
        required: false,
        content: {
          "application/json": {
            schema: schemaFromMock(requestBodyExample),
            example: requestBodyExample
          }
        }
      },
      responses: {
        "200": {
          description: "Mock response inferred from JavaScript analysis",
          content: {
            "application/json": {
              schema: schemaFromMock(responseExample),
              example: responseExample
            }
          }
        }
      },
      "x-js-analysis": {
        id: api.id,
        originalUrl: api.url,
        baseUrl: api.baseUrl,
        evidence: evidenceFiles(analysis, api),
        evidenceSnippets: evidenceSnippets(analysis, api, 3),
        confidence: api.confidence,
        cryptoIds: api.cryptoIds || [],
        query: api.query || {},
        requestMock: api.requestMock,
        responseMock: api.responseMock,
        responseKeys: api.metadata?.responseKeys || [],
        bodyInferenceSources: api.metadata?.bodyInferenceSources || []
      }
    };
  }

  return doc;
}

function normalizeOpenApiPath(rawPath) {
  let value = String(rawPath || "/");
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/:([A-Za-z_][\w-]*)/g, "{$1}");
  value = value.replace(/\$\{([^}]+)\}/g, (_, expr) => `{${safeOpenApiParamName(expr)}}`);
  return value.split("?")[0] || "/";
}

function safeOpenApiParamName(expression) {
  const candidates = String(expression || "").match(/[A-Za-z_$][\w$]*/g) || [];
  const name = candidates[candidates.length - 1] || "dynamic";
  return name.replace(/^\$/, "") || "dynamic";
}

function buildOpenApiParameters(api, apiPath) {
  const parameters = [];
  const seen = new Set();
  const pathParamRe = /\{([^}]+)\}/g;
  for (const match of findAll(pathParamRe, apiPath)) {
    const name = match[1] || "dynamic";
    const key = `path:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parameters.push({
      name,
      in: "path",
      required: true,
      schema: { type: "string" },
      example: mockValueForKey(name),
      description: "Inferred from dynamic URL segment in JavaScript."
    });
  }

  const parsed = parseApiUrl(api.url || "");
  const query = mergeMockObjects(parsed.query || {}, api.query || api.requestMock?.query || {});
  for (const [name, value] of Object.entries(query)) {
    const key = `query:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parameters.push({
      name,
      in: "query",
      required: false,
      schema: schemaFromMock(value),
      example: value,
      description: "Inferred from URL query or request parameter object in JavaScript."
    });
  }

  return parameters;
}

function schemaFromMock(value) {
  if (Array.isArray(value)) return { type: "array", items: value.length > 0 ? schemaFromMock(value[0]) : {} };
  if (value && typeof value === "object") {
    return {
      type: "object",
      properties: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, schemaFromMock(child)])),
      additionalProperties: true
    };
  }
  if (typeof value === "number") return { type: "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  return { type: "string" };
}

async function runRenderSwagger(plan, p, current) {
  const analysis = await readJson(p.analysis);
  const openapi = await readJson(p.openapi);
  const html = renderSwaggerHtml(analysis, openapi);
  await writeText(p.swaggerHtml, html);
  current.outputFiles = [p.swaggerHtml];
}

function renderSwaggerHtml(analysis, openapi) {
  const payload = JSON.stringify(buildSwaggerPayload(analysis, openapi)).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(analysis.project?.name || "JS Project")} API Workspace</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --ink:#172033; --muted:#647089; --line:#d8deea; --panel:#fff; --soft:#f2f5fa; --accent:#1f6feb; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f7f8fb; color: var(--ink); }
    header { background: #172033; color: white; padding: 24px 32px; }
    main { max-width: 1360px; margin: 0 auto; padding: 24px; }
    h1, h2, h3 { margin: 0 0 12px; }
    h1 { font-size: 28px; }
    h2 { font-size: 20px; }
    h3 { font-size: 15px; margin-top: 18px; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #e7ebf3; padding: 8px; text-align: left; vertical-align: top; word-break: break-word; }
    th { color: #536078; font-weight: 600; background: #f2f5fa; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .stat { border: 1px solid #e0e5ef; border-radius: 8px; padding: 12px; background: #fbfcff; min-height: 72px; }
    .stat b { display:block; color:#536078; font-size:12px; text-transform:uppercase; letter-spacing:.02em; }
    .stat span { display:block; margin-top:6px; font-size:22px; font-weight:700; }
    .tabs { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 0; }
    .tab { border: 1px solid rgba(255,255,255,.3); border-radius: 6px; padding: 8px 10px; background: rgba(255,255,255,.08); color: white; cursor: pointer; }
    .tab.active { background: white; color: #172033; }
    .panel { display:none; }
    .panel.active { display:block; }
    .toolbar { position: sticky; top: 0; z-index: 2; background: #f7f8fb; border: 1px solid var(--line); border-radius: 8px; padding: 10px; margin-bottom: 12px; }
    .api { border: 1px solid var(--line); border-radius: 8px; margin: 10px 0; overflow: hidden; background:white; }
    .api summary { cursor: pointer; padding: 12px; background: var(--soft); font-weight: 700; display:flex; gap:10px; align-items:center; justify-content:space-between; }
    .api-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .api-body { padding: 12px; }
    code, pre, textarea, input, select { font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; }
    textarea { width: 100%; min-height: 120px; box-sizing: border-box; border: 1px solid #cad2df; border-radius: 6px; padding: 10px; }
    input, select { border: 1px solid #cad2df; border-radius: 6px; padding: 8px; min-width: 220px; background:white; color:var(--ink); }
    button { border: 0; border-radius: 6px; padding: 8px 12px; background: #1f6feb; color: white; cursor: pointer; }
    button.secondary { background: #536078; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 8px; background: #e8eefc; color: #214e9f; font-size: 12px; white-space:nowrap; }
    .badge.get { background:#e7f7ee; color:#116329; }
    .badge.post { background:#e8eefc; color:#214e9f; }
    .badge.put { background:#fff6d9; color:#7a4d00; }
    .badge.delete { background:#ffe9e8; color:#9b1c1c; }
    .muted { color: var(--muted); }
    .response { white-space: pre-wrap; background: #101827; color: #e8edf7; border-radius: 8px; padding: 12px; overflow: auto; }
    .empty { padding: 20px; color: var(--muted); text-align:center; border:1px dashed var(--line); border-radius:8px; background:#fbfcff; }
    .two { display:grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
    @media (max-width: 860px) { main { padding: 14px; } header { padding: 20px 16px; } .two { grid-template-columns:1fr; } input, select { min-width: 0; width: 100%; } .api-title { white-space:normal; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(analysis.project?.name || "JavaScript Project")}</h1>
    <div class="muted">Local API workspace generated by js-analyzer-skill</div>
    <div class="tabs">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="apis">APIs</button>
      <button class="tab" data-tab="services">Services</button>
      <button class="tab" data-tab="security">Security</button>
      <button class="tab" data-tab="files">Files</button>
    </div>
  </header>
  <main>
    <div id="overview" class="panel active"></div>
    <div id="apis" class="panel"></div>
    <div id="services" class="panel"></div>
    <div id="security" class="panel"></div>
    <div id="files" class="panel"></div>
  </main>
  <script id="analysis-data" type="application/json">${payload}</script>
  <script>
    const payload = JSON.parse(document.getElementById("analysis-data").textContent);
    const { analysis, openapi } = payload;
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
    const pct = (v) => v == null || Number.isNaN(Number(v)) ? "" : Math.round(Number(v) * 100) + "%";
    const rows = (items, cols) => {
      if (!items || !items.length) return "<p class='muted'>No findings yet.</p>";
      return "<table><thead><tr>" + cols.map(c => "<th>" + esc(c[0]) + "</th>").join("") + "</tr></thead><tbody>" +
        items.map(item => "<tr>" + cols.map(c => "<td>" + esc(typeof c[1] === "function" ? c[1](item) : item[c[1]]) + "</td>").join("") + "</tr>").join("") +
        "</tbody></table>";
    };
    const stat = ([k,v]) => "<div class='stat'><b>"+esc(k)+"</b><span>"+esc(v ?? "")+"</span></div>";
    const setTab = (name) => {
      document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === name));
      document.querySelectorAll(".panel").forEach(panel => panel.classList.toggle("active", panel.id === name));
    };
    document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

    function renderOverview() {
      const mp = analysis.miniProgram || {};
      const s = analysis.analysisState || {};
      document.getElementById("overview").innerHTML =
        "<section><h2>Overview</h2><div class='grid'>" +
        [
          ["Progress", (s.completedTasks || 0) + "/" + (s.totalTasks || 0)],
          ["Type", analysis.project.primaryType],
          ["AppID", analysis.project.appid || mp.appid],
          ["Pages", analysis.metrics.pageCount],
          ["APIs", analysis.metrics.apiCount],
          ["Paths", analysis.metrics.pathCount],
          ["Configs", analysis.metrics.configCount],
          ["Crypto", analysis.metrics.cryptoCount]
        ].map(stat).join("") + "</div></section>" +
        "<section><h2>Mini Program</h2>" + rows([mp], [["App name","appName"],["Version","appVersion"],["Store ID","storeId"],["Env","env"],["Entry","entryPagePath"],["Subpackages","subPackageCount"]]) +
        "<h3>Packages</h3>" + rows(mp.packages || [], [["AppID","appid"],["Role","role"],["Files","fileCount"],["Configs", x => (x.configFiles||[]).join(", ")]]) +
        "<h3>Tab Bar</h3>" + rows((mp.tabBar && mp.tabBar.list) || [], [["Text","text"],["Page","pagePath"],["Code","code"],["Link","linkText"]]) + "</section>" +
        "<section><h2>Top API Prefixes</h2>" + rows(analysis.apiPrefixes || [], [["Prefix","key"],["Count","count"]]) + "</section>";
    }

    function renderApiCard(api) {
      const body = JSON.stringify((api.requestMock && api.requestMock.body) || api.body || {}, null, 2);
      const query = JSON.stringify((api.requestMock && api.requestMock.query) || api.query || {}, null, 2);
      const response = JSON.stringify(api.responseMock || {}, null, 2);
      const methodClass = String(api.method || "GET").toLowerCase();
      return "<details class='api'><summary><span class='api-title'><span class='badge " + esc(methodClass) + "'>" + esc(api.method) + "</span> " + esc(api.url) + "</span><span class='muted'>" + esc(api.prefix) + "</span></summary><div class='api-body'>" +
        "<p class='muted'>Confidence: " + pct(api.confidence) + " | Evidence: " + esc((api.evidence || []).join(", ")) + "</p>" +
        "<div class='row'><input id='url_" + api.id + "' value='" + esc(api.url) + "'><select id='method_" + api.id + "'><option>" + esc(api.method) + "</option><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select><input id='proxy_" + api.id + "' placeholder='Optional proxy, e.g. http://127.0.0.1:8787/proxy'></div>" +
        "<h3>Inferred Query</h3><pre>" + esc(query) + "</pre>" +
        "<h3>Inferred Request Body</h3>" +
        "<textarea id='body_" + api.id + "'>" + esc(body) + "</textarea><div class='row'><button onclick='sendApi(" + JSON.stringify(api.id) + ")'>Send</button><button class='secondary' onclick='document.getElementById(" + JSON.stringify("body_" + api.id) + ").value=JSON.stringify(" + JSON.stringify((api.requestMock && api.requestMock.body) || api.body || {}) + ",null,2)'>Mock</button></div>" +
        "<h3>Inferred Response</h3><pre>" + esc(response) + "</pre>" +
        (api.evidenceSnippets && api.evidenceSnippets.length ? "<h3>Evidence Snippets</h3>" + api.evidenceSnippets.map(item => "<pre>" + esc((item.file || "") + ":" + (item.line || "") + " " + (item.extractor || "") + "\\n" + (item.snippet || "")) + "</pre>").join("") : "") +
        "<h3>Live Response</h3><pre class='response' id='resp_" + api.id + "'></pre></div></details>";
    }

    function renderApis() {
      const prefixOptions = ["", ...(analysis.apiPrefixes || []).map(x => x.key)];
      document.getElementById("apis").innerHTML =
        "<section><h2>APIs</h2><div class='toolbar'><div class='row'><input id='apiSearch' placeholder='Search URL, prefix, evidence'><select id='apiPrefix'>" +
        prefixOptions.map(v => "<option value='" + esc(v) + "'>" + esc(v || "All prefixes") + "</option>").join("") +
        "</select><select id='apiMethod'><option value=''>All methods</option><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select><span class='muted' id='apiCount'></span></div></div><div id='apiList'></div></section>";
      document.getElementById("apiSearch").addEventListener("input", renderApiList);
      document.getElementById("apiPrefix").addEventListener("change", renderApiList);
      document.getElementById("apiMethod").addEventListener("change", renderApiList);
      renderApiList();
    }

    function renderApiList() {
      const query = document.getElementById("apiSearch").value.trim().toLowerCase();
      const prefix = document.getElementById("apiPrefix").value;
      const method = document.getElementById("apiMethod").value;
      const matches = (analysis.apis || []).filter(api => {
        const haystack = [api.url, api.path, api.prefix, ...(api.evidence || [])].join(" ").toLowerCase();
        return (!query || haystack.includes(query)) && (!prefix || api.prefix === prefix) && (!method || api.method === method);
      });
      document.getElementById("apiCount").textContent = matches.length + " / " + (analysis.apis || []).length + " shown";
      document.getElementById("apiList").innerHTML = matches.length ? matches.slice(0, 150).map(renderApiCard).join("") + (matches.length > 150 ? "<div class='empty'>Showing first 150 matches. Narrow the filters to inspect more.</div>" : "") : "<div class='empty'>No API candidates match the filters.</div>";
    }

    function renderServices() {
      document.getElementById("services").innerHTML =
        "<section><h2>Service Domains</h2>" + rows(analysis.domains || [], [["Domain","key"],["Count","count"],["Role","role"]]) + "</section>" +
        "<section class='two'><div><h2>Configs</h2>" + rows(analysis.configs || [], [["Name","name"],["Category","category"],["Value","value"],["Files", x => (x.files||[]).join(", ")]]) + "</div><div><h2>External Assets</h2>" + rows(analysis.assets || [], [["Category","category"],["Value","value"],["Files", x => (x.files||[]).join(", ")]]) + "</div></section>";
    }

    function renderSecurity() {
      document.getElementById("security").innerHTML =
        "<section><h2>Crypto and Signatures</h2>" + rows(analysis.crypto || [], [["Name","name"],["Category","category"],["Files", x => (x.files||[]).join(", ")]]) +
        "<h3>Quick Transform</h3><textarea id='cryptoText' placeholder='Paste request or response text here'></textarea><div class='row'><button onclick='cryptoText.value=btoa(unescape(encodeURIComponent(cryptoText.value)))'>Base64 Encode</button><button class='secondary' onclick='cryptoText.value=decodeURIComponent(escape(atob(cryptoText.value)))'>Base64 Decode</button><button class='secondary' onclick='cryptoText.value=encodeURIComponent(cryptoText.value)'>URL Encode</button><button class='secondary' onclick='cryptoText.value=decodeURIComponent(cryptoText.value)'>URL Decode</button></div></section>" +
        "<section><h2>Candidate Accounts</h2><p class='muted'>These are static candidates. UI password labels are not credentials unless a real default value is present.</p>" + rows(analysis.accounts || [], [["Name","name"],["Category","category"],["Value","value"],["Files", x => (x.files||[]).join(", ")]]) + "</section>";
    }

    function renderFiles() {
      document.getElementById("files").innerHTML =
        "<section><h2>Generated Files</h2>" + rows(analysis.files || [], [["File","file"],["Purpose","purpose"]]) +
        "<h3>Mermaid Diagrams</h3>" + rows(analysis.diagrams || [], [["Title","title"],["Path","path"]]) +
        "<h3>OpenAPI</h3>" + rows([openapi], [["Title","title"],["Version","version"],["Paths","pathCount"],["Servers", x => (x.servers||[]).join(", ")]]) + "</section>";
    }

    async function sendApi(id) {
      const url = document.getElementById("url_" + id).value;
      const method = document.getElementById("method_" + id).value;
      const proxy = document.getElementById("proxy_" + id).value.trim();
      const bodyText = document.getElementById("body_" + id).value;
      const target = proxy || url;
      const options = proxy ? { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ url, method, headers: {"Content-Type":"application/json"}, body: bodyText }) } : { method, headers: {"Content-Type":"application/json"} };
      if (!proxy && !["GET","HEAD"].includes(method)) options.body = bodyText;
      const out = document.getElementById("resp_" + id);
      out.textContent = "Sending...";
      try {
        const res = await fetch(target, options);
        out.textContent = "HTTP " + res.status + "\\n" + await res.text();
      } catch (err) {
        out.textContent = String(err) + "\\nIf this is a CORS error, run scripts/swagger-proxy.mjs and use its /proxy URL.";
      }
    }
    renderOverview();
    renderApis();
    renderServices();
    renderSecurity();
    renderFiles();
  </script>
</body>
</html>
`;
}

function buildSwaggerPayload(analysis, openapi) {
  const progress = analysis.analysisState || {};
  const metrics = analysisMetrics(analysis, progress);
  const apiPrefixes = topCounts(analysis.apis || [], (api) => apiPrefix(api, 2), 80).map(([key, count]) => ({ key, count }));
  const domains = topServiceDomains(analysis, 80).map(([key, count]) => ({ key, count, role: serviceCategoryForDomain(key) }));
  return {
    analysis: {
      project: {
        name: analysis.project?.name || "",
        root: analysis.project?.root || "",
        primaryType: analysis.project?.primaryType || "",
        detectedTypes: analysis.project?.detectedTypes || [],
        language: analysis.project?.language || "",
        framework: analysis.project?.framework || "",
        appid: analysis.project?.appid || analysis.project?.miniprogram?.appid || ""
      },
      analysisState: progress,
      metrics,
      miniProgram: analysis.project?.miniprogram || {},
      apiPrefixes,
      domains,
      apis: (analysis.apis || []).map((api) => ({
        id: api.id,
        method: api.method || "GET",
        url: api.url || api.path || "",
        path: api.path || "",
        prefix: apiPrefix(api, 2),
        headers: api.headers || {},
        query: api.query || {},
        body: api.body || {},
        requestMock: api.requestMock || {},
        responseMock: api.responseMock || {},
        responseKeys: api.metadata?.responseKeys || [],
        confidence: api.confidence,
        evidence: evidenceFiles(analysis, api).slice(0, 5),
        evidenceSnippets: evidenceSnippets(analysis, api, 3),
        cryptoIds: api.cryptoIds || []
      })),
      configs: compactFindings(analysis.configs, 120),
      accounts: compactFindings(analysis.accounts, 80),
      assets: compactFindings(analysis.externalAssets, 160),
      crypto: compactFindings(analysis.crypto, 120),
      supplements: compactFindings(analysis.supplementDiscovery?.candidates || [], 120),
      diagrams: analysis.diagrams || [],
      files: [
        { file: "analysis.json", purpose: "Full structured analysis and raw evidence" },
        { file: "analysis-state/supplement-candidates.json", purpose: "Supplement candidate discovery" },
        { file: "project-report.md", purpose: "Readable Markdown report" },
        { file: "postman_collection.json", purpose: "Postman collection" },
        { file: "openapi.json", purpose: "OpenAPI 3.1 document" },
        { file: "analysis-state/run-summary.md", purpose: "Run status and resume command" }
      ]
    },
    openapi: {
      title: openapi.info?.title || "",
      version: openapi.info?.version || "",
      openapi: openapi.openapi || "",
      pathCount: Object.keys(openapi.paths || {}).length,
      servers: (openapi.servers || []).map((server) => server.url)
    }
  };
}

function compactFindings(items = [], limit = 100) {
  return (items || []).slice(0, limit).map((item) => ({
    id: item.id || "",
    name: truncateMiddle(item.name || item.value || "", 220),
    category: item.category || item.type || "",
    value: truncateMiddle(stringifyValue(item.value || ""), 260),
    files: (item.files || []).slice(0, 4),
    confidence: item.confidence
  }));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
}

async function runFinalize(plan, p, current) {
  const analysis = await readJson(p.analysis);
  const finalPlan = clonePlanWithTaskCompleted(plan, current.id);
  analysis.analysisState = summarizePlan(finalPlan);
  await writeJson(p.analysis, analysis);
  await writeText(p.markdown, renderMarkdown(analysis, finalPlan));
  if (await exists(p.openapi)) {
    const openapi = renderOpenApi(analysis, finalPlan);
    await writeJson(p.openapi, openapi);
    await writeText(p.swaggerHtml, renderSwaggerHtml(analysis, openapi));
  }
  await writeRunSummary(plan, p);
  const checkpoint = path.join(p.checkpoints, "checkpoint-006-rendered-outputs.json");
  await writeJson(checkpoint, {
    generatedAt: nowIso(),
    outputs: {
      analysis: p.analysis,
      markdown: p.markdown,
      postman: p.postman,
      openapi: p.openapi,
      swaggerHtml: p.swaggerHtml,
      runSummary: p.summary
    }
  });
  current.outputFiles = [checkpoint, p.summary];
}

function clonePlanWithTaskCompleted(plan, taskId) {
  return {
    ...plan,
    tasks: (plan.tasks || []).map((candidate) => candidate.id === taskId
      ? { ...candidate, status: "completed", progress: 100, error: "", endedAt: candidate.endedAt || nowIso() }
      : { ...candidate })
  };
}

function summarizePlan(plan) {
  const counts = {
    totalTasks: plan.tasks.length,
    completedTasks: plan.tasks.filter((candidate) => candidate.status === "completed").length,
    failedTasks: plan.tasks.filter((candidate) => candidate.status === "failed").length,
    pendingTasks: plan.tasks.filter((candidate) => candidate.status === "pending").length,
    blockedTasks: plan.tasks.filter((candidate) => candidate.status === "blocked").length,
    skippedTasks: plan.tasks.filter((candidate) => candidate.status === "skipped").length
  };
  const next = nextRunnableTask(plan);
  return {
    runId: plan.runId,
    updatedAt: plan.updatedAt,
    targetPath: plan.targetPath,
    outputPath: plan.outputPath,
    ...counts,
    percentComplete: counts.totalTasks ? Math.round((counts.completedTasks / counts.totalTasks) * 100) : 0,
    nextTask: next ? next.id : ""
  };
}

async function writeRunSummary(plan, p) {
  const summary = summarizePlan(plan);
  const completed = plan.tasks.filter((candidate) => candidate.status === "completed").map((candidate) => `- [x] ${candidate.id}: ${candidate.name}`);
  const unfinished = plan.tasks.filter((candidate) => candidate.status !== "completed" && candidate.status !== "skipped").map((candidate) => `- [ ] ${candidate.id}: ${candidate.name} (${candidate.status})${candidate.error ? ` - ${candidate.error.split("\n")[0]}` : ""}`);
  const text = `# JS Analyzer Run Summary

Run ID: ${plan.runId}

Target: ${normalizeSlash(plan.targetPath)}

Output: ${normalizeSlash(plan.outputPath)}

Updated: ${nowIso()}

Progress: ${summary.completedTasks}/${summary.totalTasks} tasks (${summary.percentComplete}%)

Next task: ${summary.nextTask || "none"}

## Resume Command

\`\`\`bash
node scripts/js-analyzer.mjs resume --out "${normalizeSlash(plan.outputPath)}"
\`\`\`

## Completed

${completed.length ? completed.join("\n") : "_None yet._"}

## Unfinished

${unfinished.length ? unfinished.join("\n") : "_None._"}

## Important Files

- ${normalizeSlash(p.plan)}
- ${normalizeSlash(p.progress)}
- ${normalizeSlash(p.analysis)}
- ${normalizeSlash(p.supplementCandidates)}
- ${normalizeSlash(p.markdown)}
- ${normalizeSlash(p.postman)}
- ${normalizeSlash(p.openapi)}
- ${normalizeSlash(p.swaggerHtml)}
`;
  await writeText(p.summary, text);
}

async function status(outDir) {
  const p = pathsFor(outDir || DEFAULT_OUT);
  if (!(await exists(p.plan))) {
    console.log(`No analysis plan found at ${p.plan}`);
    return;
  }
  const plan = await readJson(p.plan);
  const summary = summarizePlan(plan);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Run summary: ${p.summary}`);
}

async function discoverChunksCommand(outDir, options = {}) {
  const p = pathsFor(outDir || DEFAULT_OUT);
  if (!(await exists(p.plan))) throw new Error(`No plan found at ${p.plan}. Run analyze first.`);
  await ensureStateDirs(p);
  const plan = await readJson(p.plan);
  plan.options = { ...(plan.options || {}), ...normalizeOptions(options) };
  ensureChunkTaskInPlan(plan);
  const chunkTask = findTask(plan, "chunks.discover");
  await markTask(plan, p, chunkTask, "in_progress", { progress: 1 });
  await runChunkDiscovery(plan, p, chunkTask);
  await markTask(plan, p, chunkTask, "completed", { progress: 100 });
  const discovery = await readJson(p.chunkCandidates, { candidates: [] });
  console.log(JSON.stringify({
    output: p.chunkCandidates,
    candidates: discovery.candidates?.length || 0,
    needsBaseUrl: discovery.needsBaseUrl?.length || 0,
    downloaded: discovery.downloaded?.length || 0
  }, null, 2));
}

function ensureChunkTaskInPlan(plan) {
  if (findTask(plan, "chunks.discover")) return;
  const classifyIndex = plan.tasks.findIndex((candidate) => candidate.id === "classify.project");
  const insertAt = classifyIndex >= 0 ? classifyIndex + 1 : 0;
  plan.tasks.splice(insertAt, 0, task("chunks.discover", "Discover missing lazy chunks", ["classify.project"]));
  const extractPlan = findTask(plan, "extract.plan-batches");
  if (extractPlan) extractPlan.dependsOn = findTask(plan, "sourcemaps.discover") ? ["sourcemaps.discover"] : ["chunks.discover"];
}

function ensureSourceMapTaskInPlan(plan) {
  ensureChunkTaskInPlan(plan);
  if (findTask(plan, "sourcemaps.discover")) return;
  const chunkIndex = plan.tasks.findIndex((candidate) => candidate.id === "chunks.discover");
  const insertAt = chunkIndex >= 0 ? chunkIndex + 1 : 0;
  plan.tasks.splice(insertAt, 0, task("sourcemaps.discover", "Discover missing source maps", ["chunks.discover"]));
  const extractPlan = findTask(plan, "extract.plan-batches");
  if (extractPlan) extractPlan.dependsOn = findTask(plan, "supplements.discover") ? ["supplements.discover"] : ["sourcemaps.discover"];
}

function ensureSupplementTaskInPlan(plan) {
  ensureSourceMapTaskInPlan(plan);
  if (!findTask(plan, "supplements.discover")) {
    const mapIndex = plan.tasks.findIndex((candidate) => candidate.id === "sourcemaps.discover");
    const insertAt = mapIndex >= 0 ? mapIndex + 1 : 0;
    plan.tasks.splice(insertAt, 0, task("supplements.discover", "Discover high-confidence supplemental files", ["sourcemaps.discover"]));
  }
  const extractPlan = findTask(plan, "extract.plan-batches");
  if (extractPlan) extractPlan.dependsOn = ["supplements.discover"];
}

async function downloadChunksCommand(outDir, options = {}) {
  const p = pathsFor(outDir || DEFAULT_OUT);
  if (!(await exists(p.plan))) throw new Error(`No plan found at ${p.plan}. Run analyze first.`);
  await ensureStateDirs(p);
  const normalizedOptions = normalizeOptions(options);
  const plan = await readJson(p.plan);
  plan.options = { ...(plan.options || {}), ...normalizedOptions };
  ensureChunkTaskInPlan(plan);

  if (!(await exists(p.chunkCandidates))) {
    await discoverChunksCommand(outDir, options);
  }

  const discovery = await readJson(p.chunkCandidates, { candidates: [], downloaded: [] });
  const manifest = await readJson(p.downloadedChunksManifest, { generatedAt: nowIso(), downloaded: [] });
  const alreadyDownloaded = new Set((manifest.downloaded || []).map((item) => item.url));
  const candidates = (discovery.candidates || [])
    .filter((candidate) => !candidate.localExists)
    .filter((candidate) => candidate.status !== "downloaded")
    .map((candidate) => ({
      ...candidate,
      resolvedUrl: candidate.resolvedUrl || resolveCandidateUrl(candidate.value, normalizedOptions.baseUrl)
    }))
    .filter((candidate) => candidate.resolvedUrl && !alreadyDownloaded.has(candidate.resolvedUrl));

  if (candidates.length === 0) {
    console.log("No downloadable chunk candidates found. Try --base-url for relative candidates.");
    return;
  }

  let rl = null;
  if (!normalizedOptions.yes && process.stdin.isTTY) {
    rl = createInterface({ input, output });
  }

  const downloaded = [];
  for (const candidate of candidates) {
    let approved = normalizedOptions.yes;
    if (!approved && rl) {
      const answer = await rl.question(`Download chunk ${candidate.resolvedUrl}? [y/N] `);
      approved = /^y(?:es)?$/i.test(answer.trim());
    }
    if (!approved) {
      candidate.status = "skipped";
      continue;
    }

    try {
      const item = await downloadChunkCandidate(candidate, p, normalizedOptions);
      downloaded.push(item);
      manifest.downloaded.push(item);
      candidate.status = "downloaded";
      candidate.download = item;
      await appendJsonLine(p.progress, {
        runId: plan.runId,
        event: "chunk_downloaded",
        url: item.url,
        localPath: item.localPath,
        bytes: item.bytes
      });
      await writeJson(p.downloadedChunksManifest, manifest);
      await writeJson(p.chunkCandidates, discovery);
    } catch (error) {
      candidate.status = "failed";
      candidate.error = error.message;
      await appendJsonLine(p.progress, {
        runId: plan.runId,
        event: "chunk_download_failed",
        url: candidate.resolvedUrl,
        error: error.message
      });
    }
  }

  if (rl) rl.close();

  discovery.downloaded = manifest.downloaded;
  discovery.needsBaseUrl = (discovery.candidates || []).filter((item) => !item.resolvedUrl && !item.localExists);
  await writeJson(p.downloadedChunksManifest, manifest);
  await writeJson(p.chunkCandidates, discovery);

  if (downloaded.length > 0) {
    resetAfterChunkDownload(plan);
    await savePlan(plan, p);
    await writeRunSummary(plan, p);
  }

  console.log(JSON.stringify({
    downloaded: downloaded.length,
    manifest: p.downloadedChunksManifest,
    next: downloaded.length > 0 ? `node scripts/js-analyzer.mjs resume --out "${p.out}"` : "No downloads approved or completed."
  }, null, 2));
}

async function discoverSourceMapsCommand(outDir, options = {}) {
  const p = pathsFor(outDir || DEFAULT_OUT);
  if (!(await exists(p.plan))) throw new Error(`No plan found at ${p.plan}. Run analyze first.`);
  await ensureStateDirs(p);
  const plan = await readJson(p.plan);
  plan.options = { ...(plan.options || {}), ...normalizeOptions(options) };
  ensureSourceMapTaskInPlan(plan);
  const mapTask = findTask(plan, "sourcemaps.discover");
  await markTask(plan, p, mapTask, "in_progress", { progress: 1 });
  await runSourceMapDiscovery(plan, p, mapTask);
  await markTask(plan, p, mapTask, "completed", { progress: 100 });
  const discovery = await readJson(p.sourceMapCandidates, { candidates: [] });
  console.log(JSON.stringify({
    output: p.sourceMapCandidates,
    candidates: discovery.candidates?.length || 0,
    needsBaseUrl: discovery.needsBaseUrl?.length || 0,
    downloaded: discovery.downloaded?.length || 0
  }, null, 2));
}

async function downloadSourceMapsCommand(outDir, options = {}) {
  const p = pathsFor(outDir || DEFAULT_OUT);
  if (!(await exists(p.plan))) throw new Error(`No plan found at ${p.plan}. Run analyze first.`);
  await ensureStateDirs(p);
  const normalizedOptions = normalizeOptions(options);
  const plan = await readJson(p.plan);
  plan.options = { ...(plan.options || {}), ...normalizedOptions };
  ensureSourceMapTaskInPlan(plan);

  if (!(await exists(p.sourceMapCandidates))) {
    await discoverSourceMapsCommand(outDir, options);
  }

  const discovery = await readJson(p.sourceMapCandidates, { candidates: [], downloaded: [] });
  const manifest = await readJson(p.downloadedSourceMapsManifest, { generatedAt: nowIso(), downloaded: [] });
  const alreadyDownloaded = new Set((manifest.downloaded || []).map((item) => item.url));
  const candidates = (discovery.candidates || [])
    .filter((candidate) => !candidate.localExists)
    .filter((candidate) => candidate.status !== "downloaded")
    .map((candidate) => ({
      ...candidate,
      resolvedUrl: candidate.resolvedUrl || resolveCandidateUrl(candidate.value, normalizedOptions.baseUrl)
    }))
    .filter((candidate) => candidate.resolvedUrl && !alreadyDownloaded.has(candidate.resolvedUrl));

  if (candidates.length === 0) {
    console.log("No downloadable source-map candidates found. Try --base-url for relative candidates.");
    return;
  }

  let rl = null;
  if (!normalizedOptions.yes && process.stdin.isTTY) {
    rl = createInterface({ input, output });
  }

  const downloaded = [];
  for (const candidate of candidates) {
    let approved = normalizedOptions.yes;
    if (!approved && rl) {
      const answer = await rl.question(`Download source map ${candidate.resolvedUrl}? [y/N] `);
      approved = /^y(?:es)?$/i.test(answer.trim());
    }
    if (!approved) {
      candidate.status = "skipped";
      continue;
    }

    try {
      const item = await downloadSourceMapCandidate(candidate, p, normalizedOptions);
      downloaded.push(item);
      manifest.downloaded.push(item);
      candidate.status = "downloaded";
      candidate.download = item;
      await appendJsonLine(p.progress, {
        runId: plan.runId,
        event: "source_map_downloaded",
        url: item.url,
        localPath: item.localPath,
        bytes: item.bytes
      });
      await writeJson(p.downloadedSourceMapsManifest, manifest);
      await writeJson(p.sourceMapCandidates, discovery);
    } catch (error) {
      candidate.status = "failed";
      candidate.error = error.message;
      await appendJsonLine(p.progress, {
        runId: plan.runId,
        event: "source_map_download_failed",
        url: candidate.resolvedUrl,
        error: error.message
      });
    }
  }

  if (rl) rl.close();

  discovery.downloaded = manifest.downloaded;
  discovery.needsBaseUrl = (discovery.candidates || []).filter((item) => !item.resolvedUrl && !item.localExists);
  await writeJson(p.downloadedSourceMapsManifest, manifest);
  await writeJson(p.sourceMapCandidates, discovery);

  if (downloaded.length > 0) {
    resetAfterChunkDownload(plan);
    await savePlan(plan, p);
    await writeRunSummary(plan, p);
  }

  console.log(JSON.stringify({
    downloaded: downloaded.length,
    manifest: p.downloadedSourceMapsManifest,
    next: downloaded.length > 0 ? `node scripts/js-analyzer.mjs resume --out "${p.out}"` : "No downloads approved or completed."
  }, null, 2));
}

async function discoverSupplementsCommand(outDir, options = {}) {
  const p = pathsFor(outDir || DEFAULT_OUT);
  if (!(await exists(p.plan))) throw new Error(`No plan found at ${p.plan}. Run analyze first.`);
  await ensureStateDirs(p);
  const plan = await readJson(p.plan);
  plan.options = { ...(plan.options || {}), ...normalizeOptions(options) };
  ensureSupplementTaskInPlan(plan);
  const supplementTask = findTask(plan, "supplements.discover");
  await markTask(plan, p, supplementTask, "in_progress", { progress: 1 });
  await runSupplementDiscovery(plan, p, supplementTask);
  await markTask(plan, p, supplementTask, "completed", { progress: 100 });
  const discovery = await readJson(p.supplementCandidates, { candidates: [] });
  console.log(JSON.stringify({
    output: p.supplementCandidates,
    candidates: discovery.candidates?.length || 0,
    downloadable: discovery.downloadable?.length || 0,
    missingPlugins: discovery.missingPlugins?.length || 0,
    h5Entries: discovery.h5Entries?.length || 0,
    nestedStaticAssets: discovery.nestedStaticAssets?.length || 0,
    sourceMapCandidates: discovery.sourceMapCandidates?.length || 0,
    localCacheSearches: discovery.localCacheSearches?.length || 0,
    foundLocalPackages: discovery.foundLocalPackages?.length || 0
  }, null, 2));
}

async function downloadSupplementsCommand(outDir, options = {}) {
  const p = pathsFor(outDir || DEFAULT_OUT);
  if (!(await exists(p.plan))) throw new Error(`No plan found at ${p.plan}. Run analyze first.`);
  await ensureStateDirs(p);
  const normalizedOptions = normalizeOptions(options);
  const plan = await readJson(p.plan);
  plan.options = { ...(plan.options || {}), ...normalizedOptions };
  ensureSupplementTaskInPlan(plan);

  if (!(await exists(p.supplementCandidates))) {
    await discoverSupplementsCommand(outDir, options);
  }

  const discovery = await readJson(p.supplementCandidates, { candidates: [], downloaded: [] });
  const manifest = await readJson(p.downloadedSupplementsManifest, { generatedAt: nowIso(), downloaded: [] });
  const alreadyDownloaded = new Set((manifest.downloaded || []).map((item) => item.url));
  const queue = (discovery.candidates || [])
    .filter((candidate) => candidate.resolvedUrl)
    .filter((candidate) => candidate.status !== "downloaded")
    .filter((candidate) => !alreadyDownloaded.has(candidate.resolvedUrl))
    .sort((a, b) => supplementCandidateScore(b) - supplementCandidateScore(a));

  if (queue.length === 0) {
    console.log("No downloadable supplement candidates found. Run discover-supplements first or review local cache search hints.");
    return;
  }

  let rl = null;
  if (!normalizedOptions.yes && process.stdin.isTTY) {
    rl = createInterface({ input, output });
  }

  const downloaded = [];
  const candidateMap = new Map((discovery.candidates || []).map((candidate) => [`${candidate.type}:${candidate.value}:${candidate.resolvedUrl || ""}`, candidate]));
  for (const candidate of queue) {
    let approved = normalizedOptions.yes;
    if (!approved && rl) {
      const answer = await rl.question(`Download supplemental ${candidate.type} ${candidate.resolvedUrl}? [y/N] `);
      approved = /^y(?:es)?$/i.test(answer.trim());
    }
    if (!approved) {
      candidate.status = "skipped";
      continue;
    }

    try {
      const item = await downloadSupplementCandidate(candidate, p, normalizedOptions);
      downloaded.push(item);
      manifest.downloaded.push(item);
      candidate.status = "downloaded";
      candidate.download = item;
      for (const child of item.discoveredCandidates || []) {
        const normalized = addSupplementCandidate(candidateMap, child);
        if (!discovery.candidates.some((existing) => existing.id === normalized.id)) discovery.candidates.push(normalized);
      }
      await appendJsonLine(p.progress, {
        runId: plan.runId,
        event: "supplement_downloaded",
        url: item.url,
        localPath: item.localPath,
        bytes: item.bytes,
        type: item.type
      });
      await writeJson(p.downloadedSupplementsManifest, manifest);
      await writeJson(p.supplementCandidates, refreshSupplementDiscovery(discovery, manifest));
    } catch (error) {
      candidate.status = "failed";
      candidate.error = error.message;
      await appendJsonLine(p.progress, {
        runId: plan.runId,
        event: "supplement_download_failed",
        url: candidate.resolvedUrl,
        error: error.message
      });
    }
  }

  if (rl) rl.close();

  const refreshed = refreshSupplementDiscovery(discovery, manifest);
  await writeJson(p.downloadedSupplementsManifest, manifest);
  await writeJson(p.supplementCandidates, refreshed);

  if (downloaded.length > 0) {
    resetAfterChunkDownload(plan);
    await savePlan(plan, p);
    await writeRunSummary(plan, p);
  }

  console.log(JSON.stringify({
    downloaded: downloaded.length,
    manifest: p.downloadedSupplementsManifest,
    candidates: p.supplementCandidates,
    next: downloaded.length > 0 ? `node scripts/js-analyzer.mjs resume --out "${p.out}"` : "No downloads approved or completed."
  }, null, 2));
}

function refreshSupplementDiscovery(discovery, manifest) {
  const candidates = [...(discovery.candidates || [])].sort((a, b) => supplementCandidateScore(b) - supplementCandidateScore(a));
  return {
    ...discovery,
    generatedAt: discovery.generatedAt || nowIso(),
    candidates,
    downloaded: manifest.downloaded || [],
    localCacheSearches: candidates.filter((item) => item.type === "local_cache_search"),
    missingPlugins: candidates.filter((item) => item.type === "missing_miniprogram_plugin"),
    h5Entries: candidates.filter((item) => item.type === "h5_entry"),
    nestedStaticAssets: candidates.filter((item) => item.type === "nested_static_asset"),
    sourceMapCandidates: candidates.filter((item) => item.type === "source_map"),
    foundLocalPackages: candidates.filter((item) => item.type === "local_cache_search" && item.status === "found_local_package"),
    downloadable: candidates.filter((item) => item.resolvedUrl && item.status === "candidate")
  };
}

async function downloadSupplementCandidate(candidate, p, options) {
  const response = await fetch(candidate.resolvedUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "js-analyzer-skill/0.1"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > options.maxDownloadBytes) {
    throw new Error(`Supplement exceeds --max-download-bytes (${bytes.byteLength} > ${options.maxDownloadBytes})`);
  }
  const contentType = response.headers.get("content-type") || "";
  const text = isTextLikeContent(contentType, candidate.resolvedUrl) ? bytes.toString("utf8") : "";
  const validation = validateSupplementContent(candidate, text, contentType);
  if (!validation.accepted) throw new Error(`Downloaded supplement did not validate as project-related: ${validation.reason}`);

  const urlObj = new URL(candidate.resolvedUrl);
  const ext = extensionForSupplement(candidate, contentType, urlObj.pathname);
  const base = path.basename(urlObj.pathname) || `supplement${ext}`;
  const fileName = `${crypto.createHash("sha1").update(candidate.resolvedUrl).digest("hex").slice(0, 10)}-${safeName(base.includes(".") ? base : `${base}${ext}`)}`;
  const localPath = path.join(p.downloadedSupplements, fileName);
  await ensureDir(path.dirname(localPath));
  await fs.writeFile(localPath, bytes);
  const discoveredCandidates = text ? collectNestedSupplementCandidates(candidate, text) : [];
  return {
    id: stableId("downloaded_supplement", candidate.resolvedUrl),
    type: candidate.type,
    url: candidate.resolvedUrl,
    originalValue: candidate.value,
    localPath,
    relativePath: normalizeSlash(path.relative(p.out, localPath)),
    bytes: bytes.byteLength,
    contentType,
    validation,
    discoveredCandidates,
    downloadedAt: nowIso(),
    sourceCandidateId: candidate.id
  };
}

function isTextLikeContent(contentType, url = "") {
  return /text|javascript|json|xml|html|css/i.test(contentType) || /\.(?:js|mjs|cjs|json|html|htm|css|map)(?:\?|$)/i.test(url);
}

function validateSupplementContent(candidate, text, contentType) {
  if (!text) return { accepted: true, reason: "binary_or_empty_allowed", markers: [] };
  const markers = [];
  const value = `${candidate.value || ""} ${candidate.resolvedUrl || ""}`;
  if (/wx[a-z0-9]{12,}/i.test(text) || /wx[a-z0-9]{12,}/i.test(value)) markers.push("appid_or_provider");
  if (/\/baking\/|\/catering\/|\/account-center\/|webapi\.qmai|qimai\.shop|qmai\.cn|zmcms\.cn/i.test(text)) markers.push("known_project_domain_or_api");
  if (/wx\.request|uni\.request|Taro\.request|axios|fetch\s*\(/.test(text)) markers.push("request_code");
  if (/__wxAppCode__|__webpack_require__|webpackJsonp|webpackChunk|sourceMappingURL/.test(text)) markers.push("bundle_or_sourcemap_marker");
  if (candidate.type === "h5_entry" && /<html|<script|<!doctype/i.test(text)) markers.push("html_shell");
  if (candidate.type === "source_map" && /"sources"\s*:|"sourcesContent"\s*:/.test(text)) markers.push("source_map");
  const accepted = markers.length > 0 || /javascript|json|html/i.test(contentType);
  return {
    accepted,
    reason: accepted ? "matched_static_project_markers" : "no_project_markers",
    markers
  };
}

function extensionForSupplement(candidate, contentType, pathname) {
  const ext = path.extname(pathname).toLowerCase();
  if (ext) return ext;
  if (candidate.type === "h5_entry" || /html/i.test(contentType)) return ".html";
  if (candidate.type === "source_map" || /json/i.test(contentType)) return ".json";
  if (/css/i.test(contentType)) return ".css";
  if (/javascript/i.test(contentType) || candidate.type === "remote_js") return ".js";
  return ".bin";
}

function collectNestedSupplementCandidates(parent, text) {
  const out = new Map();
  if (/<html|<script|<!doctype/i.test(text)) {
    const assetRe = /<([A-Za-z][\w:-]*)\b[^>]*?\b(?:src|href)\s*=\s*(['"])([^'"]{1,1000})\2[^>]*>/gi;
    for (const match of findAll(assetRe, text)) {
      const tag = match[1].toLowerCase();
      const raw = match[3];
      const resolvedUrl = resolveCandidateUrl(raw, parent.resolvedUrl);
      if (!resolvedUrl) continue;
      if (/\.(?:js|mjs|json|map)(?:\?|$)/i.test(resolvedUrl) || /manifest|service-worker|precache/i.test(resolvedUrl)) {
        const isMap = /\.map(?:\?|$)/i.test(resolvedUrl);
        addSupplementCandidate(out, {
          type: isMap ? "source_map" : "nested_static_asset",
          status: "candidate",
          value: raw,
          resolvedUrl,
          file: parent.resolvedUrl,
          line: lineNumberAt(text, match.index),
          snippet: snippetAt(text, match.index),
          confidence: 0.84,
          reason: isMap
            ? "Source map asset referenced by downloaded supplemental HTML."
            : "Nested static asset referenced by downloaded supplemental HTML.",
          fetchRequiresApproval: true,
          parentCandidateId: parent.id || parent.sourceCandidateId || "",
          parentUrl: parent.resolvedUrl || parent.url || "",
          h5EntryUrl: parent.type === "h5_entry" ? parent.resolvedUrl : parent.h5EntryUrl || parent.resolvedUrl || "",
          discoveryStage: "downloaded_h5_html_nested_asset",
          assetKind: isMap ? "source_map" : tag === "script" || /\.m?js(?:\?|$)/i.test(resolvedUrl) ? "script" : /manifest/i.test(resolvedUrl) ? "manifest" : "static_asset",
          evidenceChain: [
            ...(parent.evidenceChain || []),
            {
              type: parent.type || "parent_supplement",
              url: parent.resolvedUrl || parent.url || "",
              file: parent.file || "",
              line: parent.line || 0
            },
            {
              type: "html_asset_reference",
              url: resolvedUrl,
              line: lineNumberAt(text, match.index),
              tag
            }
          ]
        });
      }
    }
  }

  collectSupplementUrlsFromText(out, parent.resolvedUrl || parent.value || "", text, { baseUrl: parent.resolvedUrl || "" });
  const sourceMapRe = /sourceMappingURL=([^\s"'`<>)]{1,500})/g;
  for (const match of findAll(sourceMapRe, text)) {
    const raw = cleanChunkValue(match[1]);
    if (!raw || /^data:/i.test(raw)) continue;
    const resolvedUrl = resolveCandidateUrl(raw, parent.resolvedUrl);
    if (!resolvedUrl) continue;
    addSupplementCandidate(out, {
      type: "source_map",
      status: "candidate",
      value: raw,
      resolvedUrl,
      file: parent.resolvedUrl,
      line: lineNumberAt(text, match.index),
      snippet: snippetAt(text, match.index),
      confidence: 0.9,
      reason: "Source map comment found in downloaded supplemental JavaScript.",
      fetchRequiresApproval: true,
      parentCandidateId: parent.id || parent.sourceCandidateId || "",
      parentUrl: parent.resolvedUrl || parent.url || "",
      h5EntryUrl: parent.h5EntryUrl || (parent.type === "h5_entry" ? parent.resolvedUrl : ""),
      discoveryStage: "downloaded_static_asset_source_map",
      evidenceChain: [
        ...(parent.evidenceChain || []),
        {
          type: parent.type || "parent_supplement",
          url: parent.resolvedUrl || parent.url || "",
          file: parent.file || "",
          line: parent.line || 0
        },
        {
          type: "source_mapping_url",
          url: resolvedUrl,
          line: lineNumberAt(text, match.index)
        }
      ]
    });
  }

  return [...out.values()];
}

async function downloadSourceMapCandidate(candidate, p, options) {
  const response = await fetch(candidate.resolvedUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "js-analyzer-skill/0.1"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > options.maxDownloadBytes) {
    throw new Error(`Source map exceeds --max-download-bytes (${bytes.byteLength} > ${options.maxDownloadBytes})`);
  }
  const urlObj = new URL(candidate.resolvedUrl);
  const base = path.basename(urlObj.pathname) || "source.js.map";
  const fileName = `${crypto.createHash("sha1").update(candidate.resolvedUrl).digest("hex").slice(0, 10)}-${safeName(base.endsWith(".map") ? base : `${base}.map`)}`;
  const localPath = path.join(p.downloadedSourceMaps, fileName);
  await ensureDir(path.dirname(localPath));
  await fs.writeFile(localPath, bytes);
  return {
    id: stableId("downloaded_sourcemap", candidate.resolvedUrl),
    url: candidate.resolvedUrl,
    originalValue: candidate.value,
    localPath,
    relativePath: normalizeSlash(path.relative(p.out, localPath)),
    bytes: bytes.byteLength,
    contentType: response.headers.get("content-type") || "",
    downloadedAt: nowIso(),
    sourceCandidateId: candidate.id
  };
}

async function downloadChunkCandidate(candidate, p, options) {
  const response = await fetch(candidate.resolvedUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "js-analyzer-skill/0.1"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > options.maxDownloadBytes) {
    throw new Error(`Chunk exceeds --max-download-bytes (${bytes.byteLength} > ${options.maxDownloadBytes})`);
  }
  const urlObj = new URL(candidate.resolvedUrl);
  const base = path.basename(urlObj.pathname) || "chunk.js";
  const fileName = `${crypto.createHash("sha1").update(candidate.resolvedUrl).digest("hex").slice(0, 10)}-${safeName(base.endsWith(".js") ? base : `${base}.js`)}`;
  const localPath = path.join(p.downloadedChunks, fileName);
  await ensureDir(path.dirname(localPath));
  await fs.writeFile(localPath, bytes);
  return {
    id: stableId("downloaded_chunk", candidate.resolvedUrl),
    url: candidate.resolvedUrl,
    originalValue: candidate.value,
    localPath,
    relativePath: normalizeSlash(path.relative(p.out, localPath)),
    bytes: bytes.byteLength,
    contentType: response.headers.get("content-type") || "",
    downloadedAt: nowIso(),
    sourceCandidateId: candidate.id
  };
}

function resetAfterChunkDownload(plan) {
  plan.tasks = plan.tasks.filter((candidate) => !candidate.id.startsWith("extract.batch."));
  for (const id of ["sourcemaps.discover", "supplements.discover", "extract.plan-batches", "merge.shards", "render.markdown", "render.postman", "render.openapi", "render.swagger", "finalize"]) {
    const current = findTask(plan, id);
    if (!current) continue;
    current.status = "pending";
    current.progress = 0;
    current.error = "";
    current.startedAt = "";
    current.endedAt = "";
  }
  const merge = findTask(plan, "merge.shards");
  if (merge) merge.dependsOn = ["extract.plan-batches"];
  const extractPlan = findTask(plan, "extract.plan-batches");
  if (extractPlan) extractPlan.dependsOn = findTask(plan, "supplements.discover") ? ["supplements.discover"] : findTask(plan, "sourcemaps.discover") ? ["sourcemaps.discover"] : ["chunks.discover"];
}

async function renderOnly(irPath, outDir) {
  const p = pathsFor(outDir || path.dirname(path.resolve(irPath)));
  await ensureStateDirs(p);
  const analysis = await readJson(path.resolve(irPath));
  let plan;
  if (await exists(p.plan)) plan = await readJson(p.plan);
  else plan = createPlan(analysis.project?.root || process.cwd(), p.out, normalizeOptions({}));
  await writeJson(p.analysis, analysis);
  await runRenderMarkdown(plan, p, findTask(plan, "render.markdown") || task("render.markdown", "Render Markdown report"));
  await runRenderPostman(plan, p, findTask(plan, "render.postman") || task("render.postman", "Render Postman collection"));
  await runRenderOpenApi(plan, p, findTask(plan, "render.openapi") || task("render.openapi", "Render OpenAPI document"));
  await runRenderSwagger(plan, p, findTask(plan, "render.swagger") || task("render.swagger", "Render local Swagger-style UI"));
}

async function main() {
  const { command, positionals, options } = parseCli(process.argv);
  const outDir = options.out || DEFAULT_OUT;
  const p = pathsFor(outDir);

  if (command === "status") {
    await status(outDir);
    return;
  }

  if (command === "discover-chunks") {
    await discoverChunksCommand(outDir, options);
    return;
  }

  if (command === "download-chunks") {
    await downloadChunksCommand(outDir, options);
    return;
  }

  if (command === "discover-sourcemaps") {
    await discoverSourceMapsCommand(outDir, options);
    return;
  }

  if (command === "download-sourcemaps") {
    await downloadSourceMapsCommand(outDir, options);
    return;
  }

  if (command === "discover-supplements") {
    await discoverSupplementsCommand(outDir, options);
    return;
  }

  if (command === "download-supplements") {
    await downloadSupplementsCommand(outDir, options);
    return;
  }

  if (command === "render") {
    if (!options.ir) throw new Error("render requires --ir <analysis.json>");
    await renderOnly(options.ir, outDir);
    return;
  }

  if (command === "resume") {
    if (!(await exists(p.plan))) throw new Error(`No plan found at ${p.plan}`);
    const plan = await readJson(p.plan);
    await executePlan(plan, p);
    return;
  }

  if (command === "analyze") {
    const target = positionals[0];
    if (!target) usage(1);
    await ensureStateDirs(p);
    const normalizedOptions = normalizeOptions(options);
    if (await exists(p.plan)) {
      const plan = await readJson(p.plan);
      if (normalizedOptions.forceRebuildTask) {
        if (!findTask(plan, normalizedOptions.forceRebuildTask)) {
          throw new Error(`Unknown task for --force-rebuild-task: ${normalizedOptions.forceRebuildTask}`);
        }
        const affected = resetTaskAndDependents(plan, normalizedOptions.forceRebuildTask);
        plan.options = { ...(plan.options || {}), ...normalizedOptions };
        await savePlan(plan, p);
      }
      console.log(`Existing analysis plan found at ${p.plan}; resuming.`);
      await executePlan(plan, p);
      return;
    }

    const plan = createPlan(path.resolve(target), p.out, normalizedOptions);
    await savePlan(plan, p);
    await appendJsonLine(p.progress, { runId: plan.runId, event: "created", targetPath: plan.targetPath, outputPath: plan.outputPath });
    await writeRunSummary(plan, p);
    await executePlan(plan, p);
    return;
  }

  usage(1);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
