import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);

const VB_BASE = (process.env.VOICEBIP_BASE_URL || "https://api.voicebip.com/v1").replace(/\/$/, "");
const VB_KEY = process.env.VOICEBIP_API_KEY || "";
const VB_AGENT_ID = process.env.VOICEBIP_AGENT_ID || "";
const VB_WEBHOOK_SECRET = process.env.VOICEBIP_WEBHOOK_SECRET || "";
const providerConfigured = Boolean(VB_KEY && VB_AGENT_ID);

const numbers = [];
const messages = [];

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
    const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
}

async function voicebip(pathname, options = {}) {
  const response = await fetch(`${VB_BASE}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${VB_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) {
    const message = data?.message || data?.error || `Provider request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function providerStatus() {
  return {
    configured: providerConfigured,
    provider: "Voicebip",
    mode: providerConfigured ? "provider" : "demo",
    message: providerConfigured
      ? "Voicebip credentials detected."
      : "Demo mode. Add VOICEBIP_API_KEY and VOICEBIP_AGENT_ID on the server."
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function verifyWebhook(rawBody, signature) {
  if (!VB_WEBHOOK_SECRET) return false;
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", VB_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const supplied = String(signature).replace(/^sha256=/, "");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
  } catch {
    return false;
  }
}

async function handleWebhook(req, res) {
  const raw = await readBody(req);
  const signature = req.headers["x-voicebip-signature"];
  if (!verifyWebhook(raw, signature)) return json(res, 401, { error: "Invalid webhook signature" });

  let event;
  try { event = JSON.parse(raw.toString("utf8")); } catch {
    return json(res, 400, { error: "Invalid JSON" });
  }

  if (event.event_type === "message.received") {
    const p = event.payload || {};
    messages.unshift({
      id: p.message_id || event.event_id,
      number: event.number,
      from: event.from,
      body: p.body || "",
      receivedAt: event.timestamp || new Date().toISOString()
    });
  }

  return json(res, 200, { received: true });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/status") return json(res, 200, providerStatus());

    if (req.method === "GET" && url.pathname === "/api/numbers") {
      if (!providerConfigured) return json(res, 200, { numbers: [{ id:"demo", number:"+234 800 000 0000", country:"Nigeria", capabilities:["SMS","Voice"], status:"demo" }] });
      const data = await voicebip("/numbers");
      return json(res, 200, { numbers: data.numbers || data.data || [] });
    }

    if (req.method === "GET" && url.pathname === "/api/messages") return json(res, 200, { messages });

    if (req.method === "POST" && url.pathname === "/api/numbers/request") {
      if (!providerConfigured) return json(res, 400, { error: "Configure Voicebip first." });
      const body = await readBody(req);
      const input = JSON.parse(body.toString() || "{}");
      const data = await voicebip("/numbers/auto", {
        method: "POST",
        body: JSON.stringify({
          agent_id: VB_AGENT_ID,
          type: input.type || "mobile_virtual",
          country_code: "NG",
          channels: input.channels || ["voice", "sms"]
        })
      });
      return json(res, 200, data);
    }

    if (req.method === "POST" && url.pathname === "/api/messages/send") {
      if (!providerConfigured) return json(res, 400, { error: "Configure Voicebip first." });
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const data = await voicebip("/messages", {
        method: "POST",
        body: JSON.stringify({
          agent_id: VB_AGENT_ID,
          channel: "sms",
          from_number: body.from_number,
          to_number: body.to_number,
          body: body.body
        })
      });
      return json(res, 200, data);
    }

    if (req.method === "POST" && url.pathname === "/api/calls") {
      return json(res, 501, {
        error: "Voice call creation depends on the provider's approved call endpoint and account capabilities.",
        provider: "Voicebip"
      });
    }

    if (req.method === "POST" && url.pathname === "/api/webhooks/voicebip") {
      return handleWebhook(req, res);
    }

    return serveFile(req, res);
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.message || "Server error" });
  }
});

server.listen(port, () => console.log(`VV Virtual Numbers running on http://localhost:${port}`));
