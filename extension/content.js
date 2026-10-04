// Thin collector. Runs on every page (top frame). If the extension is unlocked,
// it waits ~1s, sends the page text, waits 1s, then sends images. It also
// re-captures when the page changes WITHOUT a full reload (single-page-app
// navigation), and skips the inbox's own domain. Text cleanup is done on the
// server, so there is deliberately very little logic here.

(() => {
  // Don't capture the inbox itself.
  const SINK_HOSTS = [
    "page-copier-sink-zythos-projects.vercel.app",
    "page-copier-sink.vercel.app",
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let lastText = "";
  let lastUrl = "";
  let busy = false;
  let scheduled = false;

  const isSink = () => SINK_HOSTS.includes(location.hostname);

  function grabText() {
    return document.body ? document.body.innerText.trim() : "";
  }

  function grabImages() {
    const MIN = 60;
    const out = [];
    const seen = new Set();
    document.querySelectorAll("img").forEach((img) => {
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (w < MIN || h < MIN) return;
      const key = img.currentSrc || img.src;
      if (!key || seen.has(key)) return;
      seen.add(key);
      let data = null;
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        const url = c.toDataURL("image/png"); // same-origin only; cross-origin throws
        // Guard against empty/0-size canvases that yield "data:," or a stub.
        if (url && url.indexOf("data:image/") === 0 && url.length > 100) data = url;
      } catch (e) { /* cross-origin: fall back to URL */ }
      out.push(data || key);
    });
    return out.slice(0, 12);
  }

  function send(payload) {
    try { chrome.runtime.sendMessage({ type: "capture", payload }); } catch (e) {}
  }

  async function capture() {
    if (busy || isSink() || window.top !== window.self) return;
    let cfg;
    try { cfg = await chrome.storage.local.get(["unlocked", "token"]); } catch (e) { return; }
    if (!cfg || !cfg.unlocked || !cfg.token) return;

    busy = true;
    try {
      const base = { site_url: location.href, site_title: document.title };

      await sleep(1000); // settle + deliberate slowdown
      const text = grabText();
      // de-dupe: skip if identical to what we last sent for this same URL
      if (text && !(location.href === lastUrl && text === lastText)) {
        send({ kind: "text", content: text, ...base });
        lastText = text;
        lastUrl = location.href;
      }

      await sleep(1000); // 1s gap before images
      for (const im of grabImages()) {
        if (im) { send({ kind: "image", content: im, ...base }); await sleep(400); }
      }
    } finally {
      busy = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; capture(); }, 300);
  }

  // Detect in-page navigation (SPA route changes that don't reload the page).
  (function hookNav() {
    for (const m of ["pushState", "replaceState"]) {
      const orig = history[m];
      history[m] = function () { const r = orig.apply(this, arguments); schedule(); return r; };
    }
    window.addEventListener("popstate", schedule);
    // Fallback: some apps mutate the URL in ways the above misses.
    let href = location.href;
    setInterval(() => { if (location.href !== href) { href = location.href; schedule(); } }, 1500);
  })();

  capture();
})();
