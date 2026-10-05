// Popup = password unlock (once), then a single power button for capture.
const AUTH_URL = "https://page-copier-sink-zythos-projects.vercel.app/api/auth";
const $ = (id) => document.getElementById(id);

function showGate() {
  $("gate").hidden = false;
  $("toggleWrap").hidden = true;
  $("pw").focus();
}

function setPower(on) {
  $("power").classList.toggle("on", on);
  $("state").classList.toggle("on", on);
  $("state").textContent = on ? "on" : "off";
}

function showToggle(on) {
  $("gate").hidden = true;
  $("toggleWrap").hidden = false;
  setPower(on);
}

async function unlock() {
  const pw = $("pw").value;
  if (!pw) return;
  $("gerr").textContent = "";
  $("unlock").disabled = true;
  try {
    const r = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (!r.ok) { $("gerr").textContent = "Wrong password"; $("unlock").disabled = false; return; }
    const { token } = await r.json();
    await chrome.storage.local.set({ token, enabled: true });
    showToggle(true);
  } catch (e) {
    $("gerr").textContent = "Network error";
    $("unlock").disabled = false;
  }
}

async function onPowerClick() {
  const next = !$("power").classList.contains("on");
  setPower(next);
  await chrome.storage.local.set({ enabled: next });
}

$("unlock").addEventListener("click", unlock);
$("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(); });
$("power").addEventListener("click", onPowerClick);

(async () => {
  const { token, enabled } = await chrome.storage.local.get(["token", "enabled"]);
  if (token) showToggle(enabled !== false);
  else showGate();
})();
