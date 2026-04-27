#!/usr/bin/env node
import http from "node:http";
import https from "node:https";

function parseArgs(argv) {
  const options = { port: 8787 };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--port") {
      options.port = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--help" || token === "-h") {
      usage(0);
    }
  }
  return options;
}

function usage(exitCode = 0) {
  console.log("Usage: node scripts/swagger-proxy.mjs --port 8787");
  process.exit(exitCode);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  });
  res.end(body);
}

function proxyRequest(payload) {
  return new Promise((resolve, reject) => {
    const target = new URL(payload.url);
    const client = target.protocol === "https:" ? https : http;
    const body = payload.body || "";
    const headers = { ...(payload.headers || {}) };
    if (body && !headers["Content-Length"] && !headers["content-length"]) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = client.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: payload.method || "GET",
      headers,
      timeout: 30000
    }, (upstream) => {
      const chunks = [];
      upstream.on("data", (chunk) => chunks.push(chunk));
      upstream.on("end", () => {
        resolve({
          status: upstream.statusCode,
          headers: upstream.headers,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("Upstream request timed out"));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const options = parseArgs(process.argv);
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.url === "/" || req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      endpoint: "/proxy",
      usage: "POST /proxy with { url, method, headers, body }"
    });
    return;
  }

  if (req.url !== "/proxy" || req.method !== "POST") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  try {
    const raw = await readBody(req);
    const payload = JSON.parse(raw || "{}");
    if (!payload.url || !/^https?:\/\//i.test(payload.url)) {
      sendJson(res, 400, { error: "payload.url must be http(s)" });
      return;
    }
    const upstream = await proxyRequest(payload);
    sendJson(res, 200, upstream);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(options.port, "127.0.0.1", () => {
  console.log(`Swagger proxy listening at http://127.0.0.1:${options.port}/proxy`);
});
