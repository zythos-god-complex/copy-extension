// POST /api/ingest
// Receives one capture (or an array / {items:[...]}) from the extension and
// stores it in Supabase. Gated by the x-app-token header, which must equal the
// ACCESS_TOKEN (obtained from /api/auth). The Supabase key lives only here.
// Text cleanup also happens here, so the extension stays a thin collector.
export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const token = req.headers["x-app-token"];
  if (!token || token !== process.env.ACCESS_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }

  const rawRows = Array.isArray(body)
    ? body
    : body && Array.isArray(body.items)
      ? body.items
      : body
        ? [body]
        : [];

  const rows = rawRows
    .filter(
      (r) =>
        r &&
        (r.kind === "text" || r.kind === "image") &&
        typeof r.content === "string" &&
        r.content.length > 0
    )
    .map((r) => ({
      site_url: String(r.site_url || "").slice(0, 2000),
      site_title: String(r.site_title || "").slice(0, 500),
      kind: r.kind,
      content: (r.kind === "text" ? cleanText(r.content) : r.content).slice(0, 3000000),
    }))
    .filter((r) => r.content.length > 0);

  if (!rows.length) return res.status(400).json({ error: "no_valid_rows" });

  const sb = await fetch(`${process.env.SUPABASE_URL}/rest/v1/page_captures`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!sb.ok) {
    const detail = await sb.text();
    return res.status(502).json({ error: "supabase_error", detail: detail.slice(0, 500) });
  }

  return res.status(200).json({ ok: true, inserted: rows.length });
}

// Collapse whitespace, drop blank-line runs and consecutive duplicate lines.
function cleanText(raw) {
  const lines = String(raw)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .split("\n");
  const out = [];
  for (const l of lines) {
    const s = l.replace(/[ \t]+/g, " ").trim();
    if (s === "" && out[out.length - 1] === "") continue;
    if (s !== "" && s === out[out.length - 1]) continue;
    out.push(s);
  }
  return out.join("\n").trim();
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-app-token");
}
