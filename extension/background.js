// Service worker. Receives captures from content scripts / popup and forwards
// them to the Vercel ingest endpoint. Doing the network call here (not in the
// content script) avoids each page's Content-Security-Policy blocking the fetch.

// Your deployed Vercel endpoint:
const INGEST_URL = "https://page-copier-sink-zythos-projects.vercel.app/api/ingest";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "capture") {
    sendCapture(msg.payload)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // keep the message channel open for the async response
  }
});

async function sendCapture(payload) {
  const { unlocked, token } = await chrome.storage.local.get(["unlocked", "token"]);
  if (!unlocked || !token) return { ok: false, error: "locked" };
  if (!payload || !payload.content) return { ok: false, error: "empty" };

  try {
    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-token": token,
      },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
