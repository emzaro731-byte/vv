import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);

const VB_BASE = (process.env.VOICEBIP_BASE_URL || "https://api.voicebip.com/v1").replace(/\/$/, "");
const VB_KEY = (process.env.VOICEBIP_API_KEY || "").trim();
const VB_AGENT_ID = (process.env.VOICEBIP_AGENT_ID || "").trim();
const VB_WEBHOOK_SECRET = (process.env.VOICEBIP_WEBHOOK_SECRET || "").trim();
const providerConfigured = Boolean(VB_KEY && VB_AGENT_ID);

const messages = [];
const callEvents = [];

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function serveFile(req, res) {
  const requested = req.url === "/" ? "/index.html" : new URL(req.url, `http://localhost:${port}`).pathname;
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
  if (!providerConfigured) {
    const error = new Error("Voicebip is not configured. Add VOICEBIP_API_KEY and VOICEBIP_AGENT_ID in Render.");
    error.status = 503;
    throw error;
  }

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
    agent_id: VB_AGENT_ID || null,
    webhook_configured: Boolean(VB_WEBHOOK_SECRET),
    mode: providerConfigured ? "provider" : "configuration_required",
    message: providerConfigured
      ? "Live Voicebip configuration detected."
      : "Live mode is not configured. Add VOICEBIP_API_KEY and VOICEBIP_AGENT_ID to the Render service."
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function verifyWebhook(rawBody, signature) {
  if (!VB_WEBHOOK_SECRET || !signature) return false;

  const supplied = String(signature).trim().replace(/^sha256=/i, "");
  const expectedHex = crypto.createHmac("sha256", VB_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const expectedBase64 = crypto.createHmac("sha256", VB_WEBHOOK_SECRET).update(rawBody).digest("base64");

  const matches = (a, b) => {
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  };

  return matches(expectedHex, supplied) || matches(expectedBase64, supplied);
}

async function handleWebhook(req, res) {
  const raw = await readBody(req);
  const signature = req.headers["x-voicebip-signature"];

  if (!verifyWebhook(raw, signature)) {
    return json(res, 401, { error: "Invalid webhook signature" });
  }

  let event;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return json(res, 400, { error: "Invalid JSON" });
  }

  const eventType = event.event_type || event.type || "unknown";
  const eventId = event.event_id || crypto.randomUUID();

  callEvents.unshift({
    id: eventId,
    event_type: eventType,
    agent_id: event.agent_id || null,
    call_id: event.call_id || event.payload?.call_id || null,
    from: event.from || event.from_number || event.payload?.from_number || null,
    to: event.to || event.to_number || event.payload?.to_number || event.number || null,
    timestamp: event.timestamp || new Date().toISOString(),
    payload: event.payload || {}
  });

  if (eventType === "message.received") {
    const p = event.payload || {};
    const body = p.body || p.inbound_message?.body || "";
    messages.unshift({
      id: p.message_id || eventId,
      number: event.number,
      from: event.from,
      body,
      receivedAt: event.timestamp || new Date().toISOString()
    });
  }

  return json(res, 200, { received: true });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      return json(res, 200, providerStatus());
    }

    if (req.method === "POST" && url.pathname === "/api/voice-token") {
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const requestedAgent = String(body.agent_id || VB_AGENT_ID).trim();

      if (!requestedAgent || requestedAgent !== VB_AGENT_ID) {
        return json(res, 400, { error: "Invalid agent_id." });
      }

      const data = await voicebip("/webrtc/token", {
        method: "POST",
        body: JSON.stringify({ agent_id: VB_AGENT_ID })
      });

      return json(res, 200, data);
    }

    if (req.method === "GET" && url.pathname === "/api/numbers") {
      if (!providerConfigured) {
        return json(res, 503, {
          error: "Live Voicebip configuration is missing.",
          required: ["VOICEBIP_API_KEY", "VOICEBIP_AGENT_ID"]
        });
      }
      const data = await voicebip("/numbers");
      return json(res, 200, { numbers: data.numbers || data.data || [] });
    }

    if (req.method === "GET" && url.pathname === "/api/messages") {
      return json(res, 200, { messages });
    }

    if (req.method === "GET" && url.pathname === "/api/calls/events") {
      return json(res, 200, { events: callEvents.slice(0, 100) });
    }

    if (req.method === "POST" && url.pathname === "/api/numbers/request") {
      const body = await readBody(req);
      const input = JSON.parse(body.toString() || "{}");
      const data = await voicebip("/numbers/auto", {
        method: "POST",
        body: JSON.stringify({
          agent_id: VB_AGENT_ID,
          type: input.type || "geo_did",
          country_code: input.country_code || "NG",
          channels: input.channels || ["voice"]
        })
      });
      return json(res, 200, data);
    }

    if (req.method === "POST" && url.pathname === "/api/messages/send") {
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const data = await voicebip("/messages", {
        method: "POST",
        body: JSON.stringify({
          agent_id: VB_AGENT_ID,
          channel: body.channel || "sms",
          from_number: body.from_number,
          to_number: body.to_number,
          body: body.body
        })
      });
      return json(res, 200, data);
    }

    if (req.method === "POST" && url.pathname === "/api/webhooks/voicebip") {
      return handleWebhook(req, res);
    }

    if (req.method === "POST" && url.pathname === "/voicebip/webhook") {
      return handleWebhook(req, res);
    }

    return serveFile(req, res);
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.message || "Server error" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`VV Virtual Numbers running on port ${port}`);
});
