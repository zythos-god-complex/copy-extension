// POST /api/delete   { id }  -> delete one
//                    { all: true } -> delete everything
// Gated by the access token (x-app-token header or ?token=).
export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const token = req.headers["x-app-token"] || req.query.token;
  if (!token || token !== process.env.ACCESS_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  body = body || {};

  let filter;
  if (body.all === true) {
    filter = "id=gte.0"; // PostgREST requires a filter; this matches every row
  } else if (/^\d+$/.test(String(body.id))) {
    filter = `id=eq.${body.id}`;
  } else {
    return res.status(400).json({ error: "need_id_or_all" });
  }

  const sb = await fetch(`${process.env.SUPABASE_URL}/rest/v1/page_captures?${filter}`, {
    method: "DELETE",
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      Prefer: "return=minimal",
    },
  });

  if (!sb.ok) {
    const detail = await sb.text();
    return res.status(502).json({ error: "supabase_error", detail: detail.slice(0, 500) });
  }

  return res.status(200).json({ ok: true });
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-app-token");
}
