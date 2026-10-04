// Thin popup. The password is validated by the server (/api/auth); it is never
// hardcoded here and never stored. On success the server returns an access
// token, which is what gets stored and used for uploads.

const AUTH_URL = "https://page-copier-sink-zythos-projects.vercel.app/api/auth";
const $ = (id) => document.getElementById(id);

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Injected into the page for the manual "copy now" button.
function grab() {
  const text = document.body ? document.body.innerText.trim() : "";
  const imgs = [];
  const seen = new Set();
  document.querySelectorAll("img").forEach((img) => {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (w < 60 || h < 60) return;
    const key = img.currentSrc || img.src;
    if (!key || seen.has(key)) return;
    seen.add(key);
    try {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      const url = c.toDataURL("image/png");
      if (url && url.indexOf("data:image/") === 0 && url.length > 100) imgs.push(url);
    } catch (e) { /* cross-origin */ }
  });
  return { text, imgs: imgs.slice(0, 40) };
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Copy via a "copy" event so it works the instant the popup opens (no focus needed).
function copyViaEvent(plain, html) {
  return new Promise((resolve) => {
    const onCopy = (e) => {
      e.clipboardData.setData("text/plain", plain);
      if (html) e.clipboardData.setData("text/html", html);
      e.preventDefault();
    };
    document.addEventListener("copy", onCopy, { once: true });
    const ta = document.createElement("textarea");
    ta.value = plain || " ";
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    document.removeEventListener("copy", onCopy);
    resolve(ok);
  });
}

async function copyNow() {
  const status = $("status");
  try {
    const tab = await getTab();
    status.textContent = "Copying…";
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: grab });
    const { text, imgs } = (res && res.result) || { text: "", imgs: [] };
    if (!text && !imgs.length) { status.textContent = "Nothing found on this page."; return; }
    const html =
      `<meta charset="utf-8">` +
      text.split(/\n{2,}/).map((p) => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>").join("") +
      imgs.map((d) => `<p><img src="${d}"></p>`).join("");
    const ok = await copyViaEvent(text, imgs.length ? html : null);
    if (!ok) {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      })]);
    }
    status.textContent = `Copied ${text.length.toLocaleString()} chars` +
      (imgs.length ? ` + ${imgs.length} image${imgs.length > 1 ? "s" : ""}` : "");
  } catch (e) {
    status.textContent = "Failed: " + e.message;
  }
}

// ---- password gate (server-validated) ----
function showMain() { $("gate").hidden = true; $("main").hidden = false; }
function showGate(msg) {
  $("main").hidden = true; $("gate").hidden = false;
  $("gerr").textContent = msg || ""; $("pw").value = ""; $("pw").focus();
}

async function unlock() {
  const pw = $("pw").value;
  if (!pw) { $("gerr").textContent = "Enter the password."; return; }
  $("gerr").textContent = "Checking…";
  try {
    const r = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (!r.ok) { $("gerr").textContent = "Wrong password."; return; }
    const { token } = await r.json();
    await chrome.storage.local.set({ unlocked: true, token });
    showMain();
    copyNow(); // auto-copy on open (preserved)
  } catch (e) {
    $("gerr").textContent = "Network error.";
  }
}

async function lock() {
  await chrome.storage.local.set({ unlocked: false });
  await chrome.storage.local.remove("token");
  showGate("Locked. Auto-capture stopped.");
}

$("unlock").addEventListener("click", unlock);
$("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(); });
$("lock").addEventListener("click", lock);
$("again").addEventListener("click", copyNow);

// On open: if already unlocked, go straight to work; else show the gate.
(async () => {
  const { unlocked, token } = await chrome.storage.local.get(["unlocked", "token"]);
  if (unlocked && token) { showMain(); copyNow(); }
  else showGate("");
})();
