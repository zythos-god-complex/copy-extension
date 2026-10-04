// Popup = password unlock (once), then a single on/off switch for capture.
const AUTH_URL = "https://page-copier-sink-zythos-projects.vercel.app/api/auth";
const $ = (id) => document.getElementById(id);

function showGate() {
  $("gate").hidden = false;
  $("toggleWrap").hidden = true;
  $("pw").focus();
}

function showToggle(on) {
  $("gate").hidden = true;
  $("toggleWrap").hidden = false;
  $("toggle").checked = !!on;
}

async function unlock() {
  const pw = $("pw").value;
  if (!pw) return;
  $("gerr").textContent = "…";
  try {
    const r = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (!r.ok) { $("gerr").textContent = "Wrong password"; return; }
    const { token } = await r.json();
    await chrome.storage.local.set({ token, enabled: true });
    showToggle(true);
  } catch (e) {
    $("gerr").textContent = "Network error";
  }
}

async function onToggle() {
  await chrome.storage.local.set({ enabled: $("toggle").checked });
}

$("unlock").addEventListener("click", unlock);
$("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(); });
$("toggle").addEventListener("change", onToggle);

(async () => {
  const { token, enabled } = await chrome.storage.local.get(["token", "enabled"]);
  if (token) showToggle(enabled !== false);
  else showGate();
})();
