const $ = (id) => document.getElementById(id);

const state = {
  voiceCall: null,
  voiceStream: null,
  muted: false,
  callId: null,
  startedAt: 0,
};

async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 15000);
  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Request timed out. Check Render and Voicebip.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("+")) return raw.replace(/[^+\d]/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("234")) return "+" + digits;
  if (digits.startsWith("0")) return "+234" + digits.slice(1);
  return digits ? "+" + digits : "";
}

function renderNumbers(items) {
  const safeItems = Array.isArray(items) ? items : [];
  $("numberCount").textContent = safeItems.length;

  $("fromNumber").innerHTML = safeItems.length
    ? safeItems.map(n => {
        const number = n.number || n.e164 || "";
        return '<option value="' + escapeHtml(number) + '">' + escapeHtml(number) + "</option>";
      }).join("")
    : '<option value="">No number available</option>';

  $("numbers").innerHTML = safeItems.length
    ? safeItems.map(n => {
        const number = n.number || n.e164 || "";
        const channels = Array.isArray(n.channels)
          ? n.channels
          : (Array.isArray(n.capabilities) ? n.capabilities : []);
        return '<div class="item">' +
          '<div class="item-top"><span class="number">' + escapeHtml(number) +
          '</span><span class="pill">' + escapeHtml(n.status || "active") + "</span></div>" +
          '<div class="meta">' + escapeHtml(n.country || "NG") +
          (channels.length ? " · " + escapeHtml(channels.join(" · ")) : "") + "</div>" +
          '<div class="item-actions"><button class="small-btn" data-call="' + escapeHtml(number) +
          '">☎ Device call</button><button class="small-btn" data-text="' + escapeHtml(number) +
          '">✉ Text</button></div></div>';
      }).join("")
    : '<div class="empty">No live numbers available.</div>';

  document.querySelectorAll("[data-call]").forEach(b => {
    b.onclick = () => deviceCall(b.dataset.call);
  });
  document.querySelectorAll("[data-text]").forEach(b => {
    b.onclick = () => textNumber(b.dataset.text);
  });
}

function renderMessages(items) {
  const safeItems = Array.isArray(items) ? items : [];
  $("messageCount").textContent = safeItems.length;
  $("messages").innerHTML = safeItems.length
    ? safeItems.map(m => '<div class="item"><div class="item-top"><span class="number">' +
      escapeHtml(m.from || "Unknown") + '</span><span class="muted">' +
      escapeHtml(m.receivedAt ? new Date(m.receivedAt).toLocaleString() : "") +
      '</span></div><div class="meta">' + escapeHtml(m.number || "") +
      '</div><div class="message-text">' + escapeHtml(m.body || "") + "</div></div>").join("")
    : '<div class="empty">Your SMS inbox is empty.</div>';
}

function deviceCall(number) {
  const normalized = normalizePhone(number);
  if (!normalized) return toast("Enter a valid phone number first.");
  $("dialNumber").value = normalized;
  window.location.href = "tel:" + normalized;
}

function textNumber(number) {
  $("toNumber").value = normalizePhone(number);
  $("messageBody").focus();
  window.scrollTo({
    top: $("messageForm").getBoundingClientRect().top + window.scrollY - 90,
    behavior: "smooth"
  });
}

function setVoiceUi(status, detail = "") {
  $("voiceStatus").textContent = status;
  $("voiceStatusDetail").textContent = detail;

  const active = Boolean(state.voiceCall);
  $("callBtn").disabled = active;
  $("hangupBtn").disabled = !active;
  $("muteBtn").disabled = !active;
  $("muteBtn").textContent = state.muted ? "🔇 Unmute" : "🎙 Mute";
}

function appendTranscript(role, text) {
  const box = $("transcript");
  if (!box || !text) return;
  const row = document.createElement("div");
  row.className = "transcript-line";
  row.innerHTML = '<strong>' + escapeHtml(role === "agent" ? "AI" : "You") +
    ':</strong> ' + escapeHtml(text);
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

function waitForIceGathering(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise(resolve => {
    const timeout = setTimeout(resolve, 4000);
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timeout);
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
  });
}

async function startBrowserCall() {
  if (state.voiceCall) return;

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return toast("Browser calling requires HTTPS and microphone access.");
  }

  const agentId = "agt_YBHT_zoglz7uza65p";

  try {
    setVoiceUi("Requesting mic…", "Allow microphone access when prompted.");
    $("transcript").innerHTML = "";

    state.voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    state.voiceCall = pc;
    state.startedAt = Date.now();
    state.muted = false;

    const remoteAudio = new Audio();
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;

    pc.ontrack = event => {
      if (event.streams?.[0]) {
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      const connection = pc.connectionState;
      if (connection === "connected") {
        setVoiceUi("Connected", "You are connected to the Voicebip AI agent.");
      } else if (connection === "failed") {
        toast("Voicebip WebRTC connection failed.");
        endBrowserCall();
      } else if (connection === "disconnected") {
        setVoiceUi("Reconnecting…", "WebRTC connection interrupted.");
      }
    };

    state.voiceStream.getTracks().forEach(track => pc.addTrack(track, state.voiceStream));

    setVoiceUi("Connecting…", "Connecting to your Voicebip agent.");

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);

    const response = await fetch(
      `https://api.voicebip.com/v1/public/try/${encodeURIComponent(agentId)}/offer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sdp: pc.localDescription?.sdp, agent_id: agentId })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Voicebip rejected the browser call. Make sure this agent has Shareable enabled.");
      }
      if (response.status === 503) {
        throw new Error("Voicebip agent is busy or its call limit has been reached.");
      }
      if (response.status === 400) {
        throw new Error("Voicebip rejected the WebRTC offer.");
      }
      throw new Error(data.error || data.message || `Voicebip WebRTC error (${response.status})`);
    }

    if (!data.sdp) throw new Error("Voicebip returned no SDP answer.");

    await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
    state.callId = data.call_id || null;

    if (state.callId) {
      appendTranscript("agent", "Call connected.");
    }
    setVoiceUi("Connected", state.callId ? `Call ID: ${state.callId}` : "Voicebip AI call is active.");
  } catch (error) {
    console.error("Voicebip browser call:", error);
    toast(error.message || "Unable to start Voicebip call.");
    endBrowserCall();
    setVoiceUi("Error", error.message || "Voicebip call failed.");
  }
}

async function endBrowserCall() {
  const pc = state.voiceCall;
  state.voiceCall = null;

  if (pc) {
    try { pc.close(); } catch {}
  }

  if (state.voiceStream) {
    state.voiceStream.getTracks().forEach(track => track.stop());
    state.voiceStream = null;
  }

  state.callId = null;
  state.muted = false;
  setVoiceUi("Ready", "Browser WebRTC available");
}

function toggleMute() {
  if (!state.voiceCall || !state.voiceStream) return;
  state.muted = !state.muted;
  state.voiceStream.getAudioTracks().forEach(track => {
    track.enabled = !state.muted;
  });
  $("muteBtn").textContent = state.muted ? "🔇 Unmute" : "🎙 Mute";
  setVoiceUi(state.muted ? "Muted" : "Connected", state.muted ? "Microphone muted." : "Microphone is live.");
}

document.querySelectorAll(".key").forEach(btn => {
  btn.addEventListener("click", () => {
    $("dialNumber").value += btn.dataset.key;
  });
});

$("clearDial").addEventListener("click", () => $("dialNumber").value = "");

$("callBtn").addEventListener("click", () => {
  startBrowserCall();
});

$("hangupBtn").addEventListener("click", () => {
  endBrowserCall();
});

$("muteBtn").addEventListener("click", () => {
  toggleMute();
});

$("messageBody").addEventListener("input", () => {
  $("charCount").textContent = $("messageBody").value.length + " / 1600";
});

$("messageForm").addEventListener("submit", async e => {
  e.preventDefault();

  const from = $("fromNumber").value;
  const to = normalizePhone($("toNumber").value);
  const body = $("messageBody").value.trim();

  if (!from) return toast("Get a Voicebip number first.");
  if (!to) return toast("Enter a valid destination number.");
  if (!body) return toast("Type a message.");

  try {
    const result = await api("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_number: from, to_number: to, body, channel: "sms" })
    });

    $("messageBody").value = "";
    $("charCount").textContent = "0 / 1600";
    toast(result.status ? `SMS ${result.status}.` : "SMS accepted.");
    loadAll();
  } catch (error) {
    toast(error.message);
  }
});

$("requestBtn").addEventListener("click", async () => {
  try {
    const result = await api("/api/numbers/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country_code: $("countryCode").value, channels: ["voice"] })
    });
    toast(result.e164 ? `Number provisioned: ${result.e164}` : "Live number request submitted.");
    loadAll();
  } catch (error) {
    toast(error.message);
  }
});

async function loadAll() {
  try {
    const status = await api("/api/status");
    $("modeBadge").textContent = status.configured ? "Live provider" : "Configuration required";

    if (!status.configured) {
      $("voiceStatus").textContent = "Not configured";
      $("voiceStatusDetail").textContent = "Add Voicebip API settings in Render.";
    }

    try {
      const n = await api("/api/numbers");
      renderNumbers(n.numbers || n.data || []);
    } catch (error) {
      renderNumbers([]);
      console.error("Voicebip numbers:", error);
      toast(error.message);
    }

    const m = await api("/api/messages");
    renderMessages(m.messages || []);
  } catch (error) {
    console.error("Dashboard:", error);
    toast(error.message);
  }
}

window.addEventListener("beforeunload", () => {
  if (state.voiceCall) endBrowserCall();
});

setVoiceUi("Ready", "Browser WebRTC available");
loadAll();
