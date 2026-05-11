const https = require("https");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function supabaseGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "GET",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data || "[]")); }
        catch { resolve([]); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function escapeIcs(str) {
  return (str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldLine(line) {
  // ICS spec: lines must be max 75 octets, fold with CRLF + space
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let pos = 0;
  let first = true;
  while (pos < bytes.length) {
    const max = first ? 75 : 74;
    parts.push((first ? "" : " ") + bytes.slice(pos, pos + max).toString("utf8"));
    pos += max;
    first = false;
  }
  return parts.join("\r\n");
}

function parseScheduleDate(dateStr, timeHint) {
  // dateStr is like "Sunday, May 18, 2025"
  // Returns a Date object
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch { return null; }
}

function toIcsDate(date, includeTime, timeStr) {
  // timeStr like "09:00" (24h)
  const pad = n => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  if (!includeTime || !timeStr) {
    return `${y}${m}${d}`;
  }
  const [h, min] = timeStr.split(":").map(Number);
  return `${y}${m}${d}T${pad(h)}${pad(min || 0)}00`;
}

function makeUID(scheduleId, host) {
  return `pickleball-${scheduleId}@${host}`;
}

exports.handler = async function (event) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, body: "Supabase not configured" };
  }

  try {
    const [schedules, contacts] = await Promise.all([
      supabaseGet("schedules?order=created_at.desc&limit=50"),
      supabaseGet("contacts?is_player=eq.true&order=name"),
    ]);

    const host = event.headers.host || "pickleball.netlify.app";
    const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Sunday Pickleball Scheduler//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Sunday Pickleball",
      "X-WR-CALDESC:Pickleball schedule and player list",
      "X-WR-TIMEZONE:America/Chicago",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
    ];

    for (const sched of schedules) {
      if (!sched.date) continue;

      const date = parseScheduleDate(sched.date);
      if (!date) continue;

      // If contact filter is set, only include schedules where that contact RSVPed yes
      const contactId = event.queryStringParameters && event.queryStringParameters.contact
        ? +event.queryStringParameters.contact : null;
      if (contactId) {
        const rsvps = sched.rsvps || {};
        if (rsvps[String(contactId)] !== "yes") continue;
      }

      // Get player list — look up who was selected
      const selected = sched.selected || [];
      const playerNames = selected
        .map(id => contacts.find(c => c.id === id || c.id === +id))
        .filter(Boolean)
        .map(c => c.name);

      // Build description
      let desc = "";
      if (playerNames.length) {
        desc = `Playing (${playerNames.length}): ${playerNames.join(", ")}`;
      } else if (sched.rsvps) {
        // Fall back to RSVPs
        const inIds = Object.entries(sched.rsvps)
          .filter(([, v]) => v === "yes")
          .map(([id]) => +id);
        const inNames = inIds
          .map(id => contacts.find(c => c.id === id))
          .filter(Boolean)
          .map(c => c.name);
        if (inNames.length) desc = `In (${inNames.length}): ${inNames.join(", ")}`;
      }

      // Parse time from description if available — look for time pattern in name or desc
      // We store start/end times in invite_msg but not on the schedule directly
      // Use all-day event if no time info available
      const dtstart = toIcsDate(date, false);
      const dtend_date = new Date(date);
      dtend_date.setDate(dtend_date.getDate() + 1);
      const dtend = toIcsDate(dtend_date, false);

      const uid = makeUID(sched.id, host);
      const summary = escapeIcs(sched.name || "Pickleball");

      lines.push("BEGIN:VEVENT");
      lines.push(foldLine(`UID:${uid}`));
      lines.push(`DTSTAMP:${now}`);
      lines.push(`DTSTART;VALUE=DATE:${dtstart}`);
      lines.push(`DTEND;VALUE=DATE:${dtend}`);
      lines.push(foldLine(`SUMMARY:🏓 ${summary}`));
      if (desc) lines.push(foldLine(`DESCRIPTION:${escapeIcs(desc)}`));
      lines.push(`STATUS:${sched.generated ? "CONFIRMED" : "TENTATIVE"}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    const icsContent = lines.join("\r\n") + "\r\n";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="pickleball.ics"',
        "Cache-Control": "no-cache, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
      body: icsContent,
    };
  } catch (err) {
    return { statusCode: 500, body: `Error: ${err.message}` };
  }
};
