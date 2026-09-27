const $ = (id) => document.getElementById(id);
async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
  $("numberCount").textContent = items.length;
  $("fromNumber").innerHTML = items.length ? items.map(n => {
    const number = n.number || n.e164 || "";
    return '<option value="' + escapeHtml(number) + '">' + escapeHtml(number) + '</option>';
  }).join("") : '<option value="">No number available</option>';
  $("numbers").innerHTML = items.length ? items.map(n => {
    const number = n.number || n.e164 || "";
    return '<div class="item"><div class="item-top"><span class="number">' + escapeHtml(number) + '</span><span class="pill">' + escapeHtml(n.status || "active") + '</span></div><div class="meta">' + escapeHtml(n.country || "NG") + ' · ' + escapeHtml((n.capabilities || []).join(" · ")) + '</div><div class="item-actions"><button class="small-btn" data-call="' + escapeHtml(number) + '">☎ Call</button><button class="small-btn" data-text="' + escapeHtml(number) + '">✉ Text</button></div></div>';
  }).join("") : '<div class="empty">No live numbers available.</div>';
  document.querySelectorAll("[data-call]").forEach(b => b.onclick = () => dialNumber(b.dataset.call));
  document.querySelectorAll("[data-text]").forEach(b => b.onclick = () => textNumber(b.dataset.text));
}
function renderMessages(items) {
  $("messageCount").textContent = items.length;
  $("messages").innerHTML = items.length ? items.map(m => '<div class="item"><div class="item-top"><span class="number">' + escapeHtml(m.from || "Unknown") + '</span><span class="muted">' + new Date(m.receivedAt).toLocaleString() + '</span></div><div class="meta">' + escapeHtml(m.number || "") + '</div><div class="message-text">' + escapeHtml(m.body || "") + '</div></div>').join("") : '<div class="empty">Your SMS inbox is empty.</div>';
}
function dialNumber(number) {
  const normalized = normalizePhone(number); $("dialNumber").value = normalized;
  window.location.href = "tel:" + normalized;
}
function textNumber(number) {
  $("toNumber").value = normalizePhone(number); $("messageBody").focus();
  window.scrollTo({top: $("messageForm").getBoundingClientRect().top + window.scrollY - 90, behavior:"smooth"});
}
document.querySelectorAll(".key").forEach(btn => btn.addEventListener("click", () => $("dialNumber").value += btn.dataset.key));
$("clearDial").addEventListener("click", () => $("dialNumber").value = "");
$("callBtn").addEventListener("click", () => {
  const number = normalizePhone($("dialNumber").value);
  if (!number) return toast("Enter a phone number first.");
  $("dialNumber").value = number; window.location.href = "tel:" + number;
});
$("messageBody").addEventListener("input", () => $("charCount").textContent = $("messageBody").value.length + " / 1600");
$("messageForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const from = $("fromNumber").value, to = normalizePhone($("toNumber").value), body = $("messageBody").value.trim();
  if (!from) return toast("Get a Voicebip number first.");
  if (!to) return toast("Enter a valid destination number.");
  if (!body) return toast("Type a message.");
  try {
    await api("/api/messages/send", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({from_number:from,to_number:to,body,channel:"sms"})});
    $("messageBody").value = ""; $("charCount").textContent = "0 / 1600"; toast("SMS sent."); loadAll();
  } catch (error) { toast(error.message); }
});
$("requestBtn").addEventListener("click", async () => {
  try {
    await api("/api/numbers/request", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({country_code:"NG", channels:["voice","sms"]})});
    toast("Live number request submitted."); loadAll();
  } catch (error) { toast(error.message); }
});
async function loadAll() {
  try {
    const status = await api("/api/status");
    $("modeBadge").textContent = status.configured ? "Live provider" : "Configuration required";
    try { const n = await api("/api/numbers"); renderNumbers(n.numbers || []); }
    catch (error) { renderNumbers([]); toast(error.message); }
    const m = await api("/api/messages"); renderMessages(m.messages || []);
  } catch (error) { toast(error.message); }
}
loadAll();