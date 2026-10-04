// GET /api/list?token=...&limit=...&since_id=...
// Returns recent captures, newest first. Gated by the same app token.
export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const token = req.headers["x-app-token"] || req.query.token;
  if (!token || token !== process.env.ACCESS_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 300);
  const sinceId = req.query.since_id;

  let url = `${process.env.SUPABASE_URL}/rest/v1/page_captures?select=*&order=id.desc&limit=${limit}`;
  if (sinceId && /^\d+$/.test(String(sinceId))) {
    url += `&id=gt.${sinceId}`;
  }

  const sb = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    },
  });

  if (!sb.ok) {
    const detail = await sb.text();
    return res.status(502).json({ error: "supabase_error", detail: detail.slice(0, 500) });
  }

  const items = await sb.json();
  return res.status(200).json({ items });
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-app-token");
}
