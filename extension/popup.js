// ================= Config =================
const PASSWORD = "Pass@1234567890!"; // unlock password (also used as the server token)

// ================= Runs inside the page (for clipboard copy) =================
async function pageTask(expand) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  if (expand) {
    const MORE_RE = /^\s*(\.\.\.|…)?\s*((read|show|see|view)\s+(more|full|all|rest)|more|expand( all)?|full (text|story|review)|continue reading)\s*(\.\.\.|…)?\s*$/i;
    const clicked = new WeakSet();
    let budget = 150;
    const isRealLink = (el) => {
      if (el.tagName !== "A") return false;
      const href = el.getAttribute("href");
      return href && !href.startsWith("#") && !href.toLowerCase().startsWith("javascript:");
    };
    const safeToClick = (el) =>
      !clicked.has(el) && !isRealLink(el) &&
      !el.closest("a[href]:not([href^='#'])") &&
      !(el.tagName === "BUTTON" && el.type === "submit") &&
      !el.hasAttribute("aria-haspopup") &&
      !["combobox", "menuitem", "tab"].includes(el.getAttribute("role"));

    for (let round = 0; round < 5 && budget > 0; round++) {
      let did = false;
      document.querySelectorAll("details:not([open])").forEach(d => { d.open = true; did = true; });
      const targets = new Set(document.querySelectorAll('[aria-expanded="false"]'));
      document.querySelectorAll('button, [role="button"], a, span, div, summary').forEach(el => {
        if (el.children.length > 2) return;
        const t = (el.innerText || "").trim();
        if (t.length > 0 && t.length < 30 && MORE_RE.test(t)) targets.add(el);
      });
      for (const el of targets) {
        if (budget <= 0) break;
        if (!safeToClick(el)) continue;
        clicked.add(el);
        try { el.click(); } catch (e) {}
        budget--; did = true;
        await sleep(120);
      }
      if (!did) break;
      await sleep(400);
    }
  }

  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "HEAD"]);
  const BLOCK = new Set(["ADDRESS","ARTICLE","ASIDE","BLOCKQUOTE","DETAILS","DIALOG","DD","DIV","DL","DT","FIELDSET","FIGCAPTION","FIGURE","FOOTER","FORM","H1","H2","H3","H4","H5","H6","HEADER","HR","LI","MAIN","NAV","OL","P","PRE","SECTION","SUMMARY","TABLE","TR","UL","TD","TH"]);
  let buf = "";
  function walk(node) {
    if (node.nodeType === 3) {
      const t = node.nodeValue.replace(/\s+/g, " ").trim();
      if (t) buf += t + " ";
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      const tag = node.tagName.toUpperCase();
      if (SKIP.has(tag)) return;
      if (tag === "BR") { buf += "\n"; return; }
      if (tag === "IMG") { const a = node.getAttribute("alt"); if (a) buf += "[img: " + a.trim() + "] "; return; }
      if (tag === "INPUT" || tag === "TEXTAREA") {
        const type = (node.type || "").toLowerCase();
        if (!["password", "hidden", "file"].includes(type) && node.value) buf += node.value + "\n";
        return;
      }
      const block = BLOCK.has(tag);
      if (block) buf += "\n";
      for (const c of node.childNodes) walk(c);
      if (node.shadowRoot) walk(node.shadowRoot);
      if (block) buf += "\n";
    } else {
      for (const c of node.childNodes) walk(c);
    }
  }
  if (document.body) walk(document.body);

  const lines = buf.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").split("\n");
  const out = [];
  for (const l of lines) {
    const s = l.trim();
    if (s === "" && out[out.length - 1] === "") continue;
    if (s !== "" && s === out[out.length - 1]) continue;
    out.push(s);
  }
  return out.join("\n").trim();
}

function collectImages() {
  const MIN = 60;
  const found = new Map();
  const add = (src, w, h) => { if (src && !found.has(src)) found.set(src, { src, w, h }); };
  document.querySelectorAll("img").forEach(img => {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (w >= MIN && h >= MIN) {
      const key = img.currentSrc || img.src;
      add(key, w, h);
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        found.get(key).data = c.toDataURL("image/png");
      } catch (e) { /* cross-origin: canvas blocked */ }
    }
  });
  document.querySelectorAll("canvas").forEach(c => {
    if (c.width >= MIN && c.height >= MIN) { try { add(c.toDataURL("image/png"), c.width, c.height); } catch (e) {} }
  });
  document.querySelectorAll("*").forEach(el => {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === "none") return;
    const r = el.getBoundingClientRect();
    if (r.width < MIN || r.height < MIN) return;
    for (const m of bg.matchAll(/url\(["']?(.*?)["']?\)/g)) add(new URL(m[1], location.href).href, r.width, r.height);
  });
  return Array.from(found.values());
}

// ================= Runs in the popup =================
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const blobToDataURL = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(blob);
});
async function toPng(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    return await new Promise(r => c.toBlob(r, "image/png"));
  } catch (e) { return blob; }
}

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getText(tab) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: pageTask,
    args: [$("expand").checked],
  });
  return results.map(r => r.result).filter(Boolean).join("\n\n").trim();
}

async function getImages(tab) {
  const silent = $("silent").checked;
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: collectImages,
  });
  const seen = new Set();
  const list = results.flatMap(r => r.result || []).filter(i => !seen.has(i.src) && seen.add(i.src)).slice(0, 40);
  const imgs = [];
  let skipped = 0;
  for (let i = 0; i < list.length; i++) {
    $("status").textContent = `Reading image ${i + 1} of ${list.length}…`;
    try {
      let blob;
      if (list[i].data) blob = await (await fetch(list[i].data)).blob(); // local, no network
      else if (silent) { skipped++; continue; }
      else {
        blob = await (await fetch(list[i].src, { credentials: "include", cache: "force-cache" })).blob();
        await sleep(150);
      }
      const png = await toPng(blob);
      imgs.push({ src: list[i].src, png, dataUrl: await blobToDataURL(png) });
    } catch (e) { /* unreadable image: skip */ }
  }
  return { imgs, skipped };
}

// Copies via a "copy" event so it works the instant the popup opens (no focus needed).
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

async function copyEverything() {
  const status = $("status");
  localStorage.setItem("prefs", JSON.stringify({ e: $("expand").checked, i: $("withImages").checked, s: $("silent").checked }));
  try {
    const tab = await getTab();
    status.textContent = $("expand").checked ? "Expanding & extracting…" : "Extracting…";
    const text = await getText(tab);

    let imgs = [], skipped = 0;
    if ($("withImages").checked) ({ imgs, skipped } = await getImages(tab));

    if (!text && !imgs.length) { status.textContent = "Nothing found on this page."; return; }

    const htmlText = text.split(/\n{2,}/).map(p => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>").join("");
    const htmlImgs = imgs.map(i => `<p><img src="${i.dataUrl}"></p>`).join("");
    const html = `<meta charset="utf-8">${htmlText}${htmlImgs}`;

    let ok = await copyViaEvent(text, imgs.length ? html : null);
    if (!ok) {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      })]);
    }
    status.textContent = `Copied ${text.length.toLocaleString()} chars` +
      (imgs.length ? ` + ${imgs.length} image${imgs.length > 1 ? "s" : ""}` : "") +
      (skipped ? ` (${skipped} cross-origin skipped)` : "");
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    status.textContent = "Failed: " + err.message;
  }
}

async function copyTextOnly() {
  $("withImages").checked = false;
  await copyEverything();
}

// Real image on the clipboard (needs the popup focused, so it's button-only)
async function copyImagesOnly() {
  const status = $("status");
  try {
    const tab = await getTab();
    status.textContent = "Finding images…";
    const { imgs, skipped } = await getImages(tab);
    if (!imgs.length) { status.textContent = skipped ? `${skipped} cross-origin; untick Silent.` : "No images found."; return; }
    const item = {
      "text/html": new Blob([imgs.map(i => `<img src="${i.dataUrl}">`).join("<br>")], { type: "text/html" }),
      "text/plain": new Blob([imgs.map(i => i.src.startsWith("data:") ? "[embedded image]" : i.src).join("\n")], { type: "text/plain" }),
    };
    if (imgs.length === 1 && imgs[0].png.type === "image/png") item["image/png"] = imgs[0].png;
    await navigator.clipboard.write([new ClipboardItem(item)]);
    status.textContent = `Copied ${imgs.length} image${imgs.length > 1 ? "s" : ""}.`;
  } catch (err) {
    status.textContent = "Failed: " + err.message;
  }
}

// ================= Password gate =================
function showMain() {
  $("gate").hidden = true;
  $("main").hidden = false;
}
function showGate(msg) {
  $("main").hidden = true;
  $("gate").hidden = false;
  $("gerr").textContent = msg || "";
  $("pw").value = "";
  $("pw").focus();
}

async function unlock() {
  const pw = $("pw").value;
  if (pw !== PASSWORD) { $("gerr").textContent = "Wrong password."; return; }
  await chrome.storage.local.set({ unlocked: true, token: pw });
  showMain();
  restorePrefs();
  copyEverything(); // auto-copy on open (preserved behavior)
}

async function lock() {
  await chrome.storage.local.set({ unlocked: false });
  await chrome.storage.local.remove("token");
  showGate("Locked. Auto-capture stopped.");
}

function restorePrefs() {
  try {
    const p = JSON.parse(localStorage.getItem("prefs") || "{}");
    if (p.e !== undefined) $("expand").checked = p.e;
    if (p.i !== undefined) $("withImages").checked = p.i;
    if (p.s !== undefined) $("silent").checked = p.s;
  } catch (e) {}
}

$("unlock").addEventListener("click", unlock);
$("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(); });
$("lock").addEventListener("click", lock);
$("again").addEventListener("click", copyEverything);
$("textOnly").addEventListener("click", copyTextOnly);
$("imgsOnly").addEventListener("click", copyImagesOnly);

// On open: if already unlocked, go straight to work (and auto-copy); else show the gate.
(async () => {
  const { unlocked, token } = await chrome.storage.local.get(["unlocked", "token"]);
  if (unlocked && token) {
    showMain();
    restorePrefs();
    copyEverything();
  } else {
    showGate("");
  }
})();
