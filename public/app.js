const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function renderNumbers(items) {
  $("numberCount").textContent = items.length;
  $("numbers").innerHTML = items.length ? items.map(n => `
    <div class="item">
      <div class="item-top"><span class="number">${escapeHtml(n.number)}</span><span class="pill">${escapeHtml(n.status || "active")}</span></div>
      <div class="meta">${escapeHtml(n.country || "NG")} · ${(n.capabilities || []).map(escapeHtml).join(" · ")}</div>
    </div>`).join("") : '<div class="empty">No live numbers available.</div>';
}

function renderMessages(items) {
  $("messageCount").textContent = items.length;
  $("messages").innerHTML = items.length ? items.map(m => `
    <div class="item">
      <div class="item-top"><span class="number">${escapeHtml(m.from)}</span><span class="muted">${new Date(m.receivedAt).toLocaleString()}</span></div>
      <div class="meta">${escapeHtml(m.number)}</div>
      <div style="margin-top:8px;line-height:1.45">${escapeHtml(m.body)}</div>
    </div>`).join("") : '<div class="empty">Your SMS inbox is empty.</div>';
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadAll() {
  try {
    const status = await api("/api/status");
    $("modeBadge").textContent = status.configured ? "Live provider" : "Configuration required";

    try {
      const numberData = await api("/api/numbers");
      renderNumbers(numberData.numbers || []);
    } catch (error) {
      renderNumbers([]);
      toast(error.message);
    }

    const messageData = await api("/api/messages");
    renderMessages(messageData.messages || []);
  } catch (error) {
    toast(error.message);
  }
}

$("requestBtn").addEventListener("click", async () => {
  try {
    await api("/api/numbers/request", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({country_code:"NG", channels:["voice","sms"]})
    });
    toast("Live number request submitted.");
    loadAll();
  } catch (error) {
    toast(error.message);
  }
});

loadAll();