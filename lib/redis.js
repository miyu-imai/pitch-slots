// Tiny Upstash Redis client over its REST API (no extra packages needed).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const redisReady = () => Boolean(URL_ && TOKEN);

export async function pipeline(commands) {
  if (!commands.length) return [];
  const res = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const out = await res.json();
  return out.map((r) => { if (r.error) throw new Error(r.error); return r.result; });
}

export const cmd = async (...args) => (await pipeline([args]))[0];

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export function clientIdOf(request) {
  const id = request.headers.get("x-client-id") || "";
  return /^[a-z0-9]{16,40}$/.test(id) ? id : null;
}

// Allow at most `limit` writes per client per minute.
export async function rateLimited(clientId, limit = 30) {
  const key = `rl:${clientId}:${Math.floor(Date.now() / 60000)}`;
  const [n] = await pipeline([["INCR", key], ["EXPIRE", key, "70"]]);
  return n > limit;
}
