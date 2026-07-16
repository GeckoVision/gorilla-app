import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin Solana RPC proxy.
 *
 * The browser talks JSON-RPC to `/api/rpc`; this handler forwards to the real
 * upstream. The upstream (and thus the Helius API key) is resolved SERVER-SIDE
 * from env and never reaches the client bundle. The upstream is chosen from a
 * fixed set keyed by `mode` — it is never taken from the request — so the proxy
 * cannot be pointed at an arbitrary host (no SSRF).
 */

export const runtime = "nodejs";

type Mode = "devnet" | "mainnet-sim";

const PUBLIC_DEVNET = "https://api.devnet.solana.com";

function resolveUpstream(mode: Mode): string | null {
  if (mode === "mainnet-sim") {
    // Future toggle: a mainnet-fork endpoint. Not configured by default.
    return process.env.MAINNET_SIM_RPC_URL ?? null;
  }
  // devnet: an explicit URL wins; else build the Helius devnet URL from the key;
  // else the public devnet RPC so `pnpm dev` works with no secrets at all.
  if (process.env.DEVNET_RPC_URL) return process.env.DEVNET_RPC_URL;
  const key = process.env.HELIUS_API_KEY;
  if (key) return `https://devnet.helius-rpc.com/?api-key=${key}`;
  return PUBLIC_DEVNET;
}

export async function POST(req: NextRequest) {
  const mode = (req.nextUrl.searchParams.get("mode") as Mode) || "devnet";
  const upstream = resolveUpstream(mode);
  if (!upstream) {
    return NextResponse.json(
      { error: `RPC upstream for mode "${mode}" is not configured on the server.` },
      { status: 501 },
    );
  }

  const body = await req.text();
  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    // Never echo the upstream URL (it may embed the key) into an error.
    return NextResponse.json({ error: "Upstream RPC request failed." }, { status: 502 });
  }
}
