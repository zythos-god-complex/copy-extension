# Page Text Copier + Web Inbox

A Chrome (MV3) extension that, once unlocked with a password, **auto-captures
text and images from every page you visit** - to your clipboard *and* to a
private web inbox hosted on Vercel (backed by Supabase).

## How it works

```
 every page you open
        │  (content.js, top frame, if unlocked; skips the inbox's own domain;
        │   also re-fires on single-page-app navigations)
        │  wait 1s → grab TEXT → send
        │  wait 1s → grab IMAGES (one by one) → send
        ▼
 background.js ──POST /api/ingest (x-app-token: ACCESS_TOKEN)──►  Vercel
                                                                   │
                                                            writes to Supabase
                                                                   │
 viewer page  ◄──GET /api/list ─────────────────────────────────► reads Supabase
 (index.html)   shows cards of text & images, with Copy + Delete buttons
```

## Password / auth model

- The password (`Pass@1234567890!`) is **never stored in the extension source**.
- Entering it calls **`/api/auth`** on the server, which verifies it against the
  `AUTH_PASSWORD` env var and returns a separate **access token** (`ACCESS_TOKEN`).
- The extension/viewer store and use only that access token for uploads and
  reads. The password itself is never saved on the client.
- Note: a browser extension's JS is always inspectable, and Chrome (MV3) forbids
  loading remote code, so the DOM/image-grab logic physically lives in the
  extension. Everything that *can* live server-side (auth, the Supabase key,
  text cleanup, storage) does.

## Components

- **`extension/`** - the browser extension (thin collector). Load it unpacked.
  - `popup.html` / `popup.js` - password gate (server-validated) + a manual
    "Copy this page now" button + Lock.
  - `content.js` - auto-captures text then images on every page with a 1s
    delay; re-captures on in-page (SPA) navigation; skips the inbox domain.
  - `background.js` - forwards captures to the Vercel ingest endpoint. **Edit
    `INGEST_URL` here if you redeploy to a different URL.**
- **`web/`** - the Vercel site (the "inbox").
  - `index.html` - viewer (password-gated, auto-refreshing) with **Copy**,
    per-item **✕ delete**, and a **Delete all** button.
  - `api/auth.js` - validates the password, returns the access token.
  - `api/ingest.js` - receives captures, cleans text, writes to Supabase.
  - `api/list.js` - returns recent captures.
  - `api/delete.js` - deletes one (`{id}`) or everything (`{all:true}`).

## Live URLs

- Inbox / viewer: https://page-copier-sink.vercel.app
- API base: https://page-copier-sink-zythos-projects.vercel.app/api

## Install the extension

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `extension/` folder.
3. Click the extension icon, enter the password, press **Unlock**.
4. Browse. Captures appear in the inbox within a few seconds.
5. To stop, open the popup and press **Lock extension**.

## Important limitations (by design)

- It only reads what is **currently in the page's DOM**. It does **not** crawl
  links or open other pages. On sites that lazy-render as you scroll (GitHub
  code, long docs/chats), scroll through the content so it's in the DOM.
- It re-captures on SPA route changes (pushState/replaceState/popstate + a URL
  poll), so pages that change "silently" without a reload still get captured.
- Cross-origin images the browser won't let a page read are sent as their
  **URL** (the inbox shows them by URL). Empty/0-size canvases are skipped.
- Images are capped at 12 per page.

## Rotating the secret

Two env vars on the Vercel project:
- `AUTH_PASSWORD` - the login password you type.
- `ACCESS_TOKEN` - the token clients hold after logging in.

To change the password, update `AUTH_PASSWORD` in Vercel and redeploy. To
invalidate all existing sessions, rotate `ACCESS_TOKEN`.

## Security note

The inbox is protected by this single password / token. Anyone who has it can
read and delete everything captured. Treat it as a personal tool, not a
hardened secret store.
