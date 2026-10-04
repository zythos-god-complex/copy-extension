# Page Text Copier + Web Inbox

A Chrome (MV3) extension that, once unlocked with a password, **auto-captures
text and images from every page you visit** — to your clipboard *and* to a
private web inbox hosted on Vercel (backed by Supabase).

## How it works

```
 every page you open
        │  (content.js, top frame, if unlocked)
        │  wait 1s → grab TEXT → send
        │  wait 1s → grab IMAGES (one by one) → send
        ▼
 background.js  ──POST /api/ingest (x-app-token: password)──►  Vercel
                                                                 │
                                                          writes to Supabase
                                                                 │
 viewer page  ◄──GET /api/list (token: password)──────────────► reads Supabase
 (index.html)   shows cards of text & images, with Copy buttons
```

Nothing happens until you enter the password in the extension popup. The
password is `Pass@1234567890!` and is entered in a hidden (masked) field.

## Components

- **`extension/`** — the browser extension. Load it unpacked.
  - `popup.html` / `popup.js` — password gate + the original one-click
    clipboard copy. Entering the correct password unlocks auto-capture.
  - `content.js` — runs on every page; captures text then images with a 1s
    delay and sends them to the background worker.
  - `background.js` — forwards captures to the Vercel endpoint. **Edit
    `INGEST_URL` here if you redeploy to a different URL.**
- **`web/`** — the Vercel site (the "inbox").
  - `index.html` — the viewer (asks for the password, polls for new captures).
  - `api/ingest.js` — receives captures, writes to Supabase.
  - `api/list.js` — returns recent captures.

## Live URLs

- Inbox / viewer: https://page-copier-sink-zythos-projects.vercel.app
- Ingest endpoint: https://page-copier-sink-zythos-projects.vercel.app/api/ingest

## Install the extension

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `extension/` folder.
3. Click the extension icon, enter the password, press **Unlock**.
4. Browse. Captures appear in the inbox within a few seconds.
5. To stop, open the popup and press **Lock extension**.

## Important limitations (by design)

- It only reads what is **currently in the page's DOM**. It does **not** crawl
  links or open other pages. On sites that lazy-render as you scroll (GitHub
  code, long docs/chats), scroll through the content so it's in the DOM when
  the capture runs.
- Cross-origin images that the browser won't let a page read are sent as their
  **URL** (the inbox shows them by URL) rather than embedded pixels.
- Images are capped at 12 per page to keep volume sane.

## Config / redeploy notes

- The password is both the unlock code and the server token. It lives in:
  - `extension/popup.js` (`PASSWORD`)
  - Vercel env var `APP_TOKEN`
  Change it in **both** places to rotate it.
- Supabase table: `page_captures` (RLS on; the Supabase key is only ever used
  server-side inside the Vercel functions, never shipped to the browser).

## Security note

The inbox is protected only by this single password. Anyone who has it (or who
can read the extension's source, where it is embedded) can read everything
captured. Treat it as a personal tool, not a hardened secret store.
