const https = require("https");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function supabaseRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    const payload = body ? JSON.stringify(body) : null;
    const isUpsert = method === "POST" && path.includes("on_conflict");
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": isUpsert
          ? "resolution=merge-duplicates,return=representation"
          : "return=representation",
      },
    };
    if (payload) options.headers["Content-Length"] = Buffer.byteLength(payload);
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data || "[]") }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

exports.handler = async function (event) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Supabase env vars not set. Add SUPABASE_URL and SUPABASE_SERVICE_KEY in Netlify." }),
    };
  }

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors, body: "" };

  const action = event.path
    .replace(/.*\/api\/db\/?/, "")
    .replace(/.*\.netlify\/functions\/db\/?/, "");
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    let result;

    // ── contacts (unified — includes player data) ──
    if (action === "contacts/list") {
      result = await supabaseRequest("GET", "contacts?order=name");
    } else if (action === "contacts/upsert") {
      result = await supabaseRequest("POST", "contacts?on_conflict=id", body);
    } else if (action === "contacts/delete") {
      result = await supabaseRequest("DELETE", `contacts?id=eq.${body.id}`);

    // ── schedules ──
    } else if (action === "schedules/list") {
      result = await supabaseRequest("GET", "schedules?order=created_at.desc");
    } else if (action === "schedules/save") {
      const row = { ...body, updated_at: new Date().toISOString() };
      result = await supabaseRequest("POST", "schedules?on_conflict=id", row);
    } else if (action === "schedules/delete") {
      result = await supabaseRequest("DELETE", `schedules?id=eq.${body.id}`);

    // ── settings ──
    } else if (action === "settings/get") {
      result = await supabaseRequest("GET", "settings?id=eq.1");
    } else if (action === "settings/save") {
      result = await supabaseRequest("POST", "settings?on_conflict=id", { id: 1, ...body });

    } else {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ error: "Unknown action: " + action }) };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify(result.body) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
