import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const providerConfigured = Boolean(process.env.NUMBER_PROVIDER_BASE_URL && process.env.NUMBER_PROVIDER_API_KEY);

const numbers = [
  {
    id: "vv-demo-234-1",
    number: "+234 800 000 0000",
    country: "Nigeria",
    capabilities: ["SMS", "Voice"],
    status: "active"
  }
];

const messages = [
  {
    id: "msg-demo-1",
    number: "+234 800 000 0000",
    from: "VV Demo",
    body: "Welcome to VV Virtual Numbers.",
    receivedAt: new Date().toISOString()
  }
];

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function serveFile(req, res) {
  const requested = req.url === "/" ? "/index.html" : req.url;
  const safe = path.normalize(requested).replace(/^([.][.][/\\])+/, "");
  const file = path.join(publicDir, safe);
  if (!file.startsWith(publicDir)) return json(res, 403, { error: "Forbidden" });
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: "Not found" });
    const ext = path.extname(file);
    const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function providerStatus() {
  return {
    configured: providerConfigured,
    mode: providerConfigured ? "provider" : "demo",
    message: providerConfigured
      ? "Provider credentials detected. Connect your approved number provider in the server adapter before going live."
      : "Demo mode. Add provider credentials before issuing real numbers."
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  if (req.method === "GET" && url.pathname === "/api/status") {
    return json(res, 200, providerStatus());
  }

  if (req.method === "GET" && url.pathname === "/api/numbers") {
    return json(res, 200, { numbers });
  }

  if (req.method === "GET" && url.pathname === "/api/messages") {
    return json(res, 200, { messages });
  }

  if (req.method === "POST" && url.pathname === "/api/numbers/request") {
    return json(res, 501, {
      error: "Real number provisioning is not configured.",
      next: "Connect a compliant telecom/VoIP provider API and implement its documented provisioning endpoint in server.js."
    });
  }

  if (req.method === "POST" && url.pathname === "/api/messages/send") {
    return json(res, 501, {
      error: "Outbound SMS is not configured.",
      next: "Connect a compliant SMS provider API and implement its documented send endpoint."
    });
  }

  if (req.method === "POST" && url.pathname === "/api/calls") {
    return json(res, 501, {
      error: "Voice calling is not configured.",
      next: "Connect a compliant voice provider API and implement its documented call endpoint."
    });
  }

  return serveFile(req, res);
});

server.listen(port, () => {
  console.log(`VV Virtual Numbers running on http://localhost:${port}`);
});
