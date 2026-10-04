// POST /api/auth  { password }
// Verifies the login password (server-side only) and returns the access token
// that clients then use for /api/ingest and /api/list. The password itself is
// never stored by clients and never shipped inside the extension.
export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const password = body && typeof body.password === "string" ? body.password : "";

  if (!password || password !== process.env.AUTH_PASSWORD) {
    return res.status(401).json({ error: "invalid_password" });
  }

  return res.status(200).json({ ok: true, token: process.env.ACCESS_TOKEN });
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
