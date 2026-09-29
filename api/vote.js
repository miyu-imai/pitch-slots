import { pipeline, cmd, json, clientIdOf, redisReady, rateLimited } from "../lib/redis.js";

export async function POST(request) {
  if (!redisReady()) return json({ error: "Leaderboard storage is not connected" }, 503);
  const me = clientIdOf(request);
  if (!me) return json({ error: "Missing client id" }, 400);
  if (await rateLimited(me, 60)) return json({ error: "Too many requests" }, 429);
  let body; try { body = await request.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const id = String(body.id || "");
  if (!/^[a-z0-9]{6,40}$/.test(id)) return json({ error: "Bad id" }, 400);
  const raw = await cmd("GET", `pitch:${id}`);
  if (!raw) return json({ error: "Pitch not found" }, 404);
  if (JSON.parse(raw).ownerId === me) return json({ error: "You can't vote for your own pitch" }, 403);
  const key = `votes:${id}`;
  const has = await cmd("SISMEMBER", key, me);
  const [, votes] = await pipeline([[has ? "SREM" : "SADD", key, me], ["SCARD", key]]);
  return json({ voted: !has, votes: Number(votes) || 0 });
}
