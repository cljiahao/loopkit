import { headers } from "next/headers";

type Limiter = { limit: (key: string) => Promise<{ success: boolean }> };

let cached: Limiter | null | undefined;

// Build the limiter once. Upstash is optional infra: when its env vars are
// absent the limiter is disabled and every request is allowed (fail-open) so
// the public flow keeps working without a Redis. The Upstash SDKs are imported
// dynamically so they never enter the bundle unless configured.
async function getLimiter(): Promise<Limiter | null> {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cached = null;
    return null;
  }
  const { Ratelimit } = await import("@upstash/ratelimit");
  const { Redis } = await import("@upstash/redis");
  cached = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(20, "60 s"),
    prefix: "loopkit:rl",
  }) as Limiter;
  return cached;
}

/**
 * Per-IP allow check for a public surface. Returns true when allowed (or when no
 * limiter is configured). `bucket` namespaces the limit (e.g. "c-check").
 */
export async function allowRequest(bucket: string): Promise<boolean> {
  const limiter = await getLimiter();
  if (!limiter) return true;
  const h = await headers();
  const ip =
    (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const { success } = await limiter.limit(`${bucket}:${ip}`);
  return success;
}
