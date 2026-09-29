import { pipeline, cmd, json, clientIdOf, redisReady, rateLimited } from "../lib/redis.js";

const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const BLOB_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;
const ID_RE = /^[a-z0-9]{6,40}$/;

function publicView(p, votes, voted, me) {
  const { ownerId, ...rest } = p;
  return { ...rest, votes: Number(votes) || 0, voted: Boolean(voted), mine: Boolean(me && ownerId === me) };
}

export async function GET(request) {
  if (!redisReady()) return json({ error: "Leaderboard storage is not connected" }, 503);
  const me = clientIdOf(request);
  const ids = (await cmd("ZREVRANGE", "pitches", "0", "299")) || [];
  const cmds = [];
  for (const id of ids) {
    cmds.push(["GET", `pitch:${id}`], ["SCARD", `votes:${id}`], ["SISMEMBER", `votes:${id}`, me || "-"]);
  }
  const res = await pipeline(cmds);
  const pitches = [];
  ids.forEach((id, i) => {
    const raw = res[i * 3];
    if (!raw) return;
    try { pitches.push(publicView(JSON.parse(raw), res[i * 3 + 1], res[i * 3 + 2], me)); } catch {}
  });
  return json({ pitches });
}

export async function POST(request) {
  if (!redisReady()) return json({ error: "Leaderboard storage is not connected" }, 503);
  const me = clientIdOf(request);
  if (!me) return json({ error: "Missing client id" }, 400);
  if (await rateLimited(me)) return json({ error: "Too many requests" }, 429);
  let body; try { body = await request.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const id = String(body.id || "");
  if (!ID_RE.test(id)) return json({ error: "Bad id" }, 400);
  const title = clip(body.title, 80), name = clip(body.name, 40);
  if (!title || !name) return json({ error: "Title and name are required" }, 400);

  const existingRaw = await cmd("GET", `pitch:${id}`);
  const existing = existingRaw ? JSON.parse(existingRaw) : null;
  if (existing && existing.ownerId !== me) return json({ error: "Not your pitch" }, 403);

  const deckUrl = BLOB_RE.test(body.deckUrl || "") ? clip(body.deckUrl, 500) : "";
  const deckLink = /^https?:\/\//i.test(body.deckLink || "") ? clip(body.deckLink, 500) : "";
  const now = new Date().toISOString();
  const pitch = {
    id, title, name,
    oneLiner: clip(body.oneLiner, 280),
    sector: clip(body.sector, 60), customer: clip(body.customer, 60), model: clip(body.model, 60),
    deckUrl, deckName: deckUrl ? clip(body.deckName, 120) : "", deckLink,
    postedAt: existing ? existing.postedAt : now, updatedAt: now,
    ownerId: me,
  };
  await pipeline([
    ["SET", `pitch:${id}`, JSON.stringify(pitch)],
    ["ZADD", "pitches", String(Date.parse(pitch.postedAt)), id],
  ]);
  return json({ ok: true });
}

export async function DELETE(request) {
  if (!redisReady()) return json({ error: "Leaderboard storage is not connected" }, 503);
  const me = clientIdOf(request);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!me || !ID_RE.test(id)) return json({ error: "Bad request" }, 400);
  const raw = await cmd("GET", `pitch:${id}`);
  if (!raw) return json({ ok: true });
  if (JSON.parse(raw).ownerId !== me) return json({ error: "Not your pitch" }, 403);
  await pipeline([["DEL", `pitch:${id}`, `votes:${id}`], ["ZREM", "pitches", id]]);
  return json({ ok: true });
}
