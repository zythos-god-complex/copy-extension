// Runs automatically on every page (document_idle), in the top frame only.
// If the extension has been unlocked with the password, it waits ~1s, grabs
// the page text and sends it, waits another 1s, then grabs images and sends
// them one by one. Captures go to the background worker, which forwards them
// to your Vercel inbox. Reads only what is already in the DOM — no crawling,
// no navigation. Long/lazy-rendered pages still need you to scroll so the
// content is actually in the DOM when this runs.

(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- text extraction (what is currently rendered) ----
  function extractText() {
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

  // ---- image collection (already-loaded pixels only; zero network) ----
  function collectImages() {
    const MIN = 60;
    const found = new Map();
    const add = (src, data) => { if (src && !found.has(src)) found.set(src, { src, data }); };
    document.querySelectorAll("img").forEach((img) => {
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (w >= MIN && h >= MIN) {
        const key = img.currentSrc || img.src;
        let data = null;
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img, 0, 0);
          data = c.toDataURL("image/png"); // same-origin only; cross-origin throws
        } catch (e) { /* cross-origin: fall back to the URL */ }
        add(key, data);
      }
    });
    document.querySelectorAll("canvas").forEach((c) => {
      if (c.width >= MIN && c.height >= MIN) {
        try { add(c.toDataURL("image/png"), c.toDataURL("image/png")); } catch (e) {}
      }
    });
    return Array.from(found.values());
  }

  function send(payload) {
    try { chrome.runtime.sendMessage({ type: "capture", payload }); } catch (e) {}
  }

  async function run() {
    if (window.top !== window.self) return; // top frame only

    let cfg;
    try { cfg = await chrome.storage.local.get(["unlocked", "token"]); } catch (e) { return; }
    if (!cfg || !cfg.unlocked || !cfg.token) return; // locked → do nothing

    const base = { site_url: location.href, site_title: document.title };

    await sleep(1000); // settle + deliberate ~1s slowdown

    // 1) text first
    const text = extractText();
    if (text) send({ kind: "text", content: text, ...base });

    await sleep(1000); // 1s delay before images

    // 2) then images, one at a time, with a small gap between each
    const imgs = collectImages().slice(0, 12);
    for (const im of imgs) {
      const content = im.data || im.src;
      if (!content) continue;
      send({ kind: "image", content, ...base });
      await sleep(400);
    }
  }

  run();
})();
