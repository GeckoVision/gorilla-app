import { NextRequest, NextResponse } from "next/server";

import { createRpcCache, isCacheable, rpcCacheKey } from "@/lib/rpc/cache";
import { createLimiter, forwardRpc, type ForwardResult } from "@/lib/rpc/forward";
import { maxConcurrency, resolveUpstream, type RpcMode } from "@/lib/rpc/upstream";

/**
 * Same-origin Solana RPC proxy.
 *
 * The browser talks JSON-RPC to `/api/rpc`; this thin handler resolves the
 * upstream SERVER-SIDE (so the Helius key never reaches the client bundle) and
 * forwards through the robust core in `lib/rpc/*`:
 *   - a coalescing + short-TTL cache (identical concurrent reads → ONE upstream
 *     call — the fix for public-devnet 429 storms),
 *   - a concurrency limiter (never stampede the RPC),
 *   - retry-with-backoff + a per-attempt timeout.
 * The upstream is chosen from a fixed set keyed by `mode`, never from the
 * request — so the proxy cannot be pointed at an arbitrary host (no SSRF).
 */

export const runtime = "nodejs";

// Module-level, shared across concurrent requests handled by this server instance.
const limit = createLimiter(maxConcurrency());
const cache = createRpcCache<ForwardResult>({ ttlMs: 8000 });

export async function POST(req: NextRequest) {
  const mode = (req.nextUrl.searchParams.get("mode") as RpcMode) || "devnet";
  const upstream = resolveUpstream(mode);
  if (!upstream) {
    return NextResponse.json(
      { error: `RPC upstream for mode "${mode}" is not configured on the server.` },
      { status: 501 },
    );
  }

  const body = await req.text();
  const produce = () => limit(() => forwardRpc({ upstream, body }));

  const cacheable = rpcCacheKey(mode, body);
  const result =
    cacheable && isCacheable(cacheable.method)
      ? await cache.run(cacheable.key, produce)
      : await produce();

  return new NextResponse(result.body, {
    status: result.status,
    headers: { "content-type": result.contentType },
  });
}
