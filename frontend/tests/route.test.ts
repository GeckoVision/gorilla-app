import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/rpc/route";
import { PUBLIC_DEVNET } from "@/lib/rpc/upstream";

/**
 * The `/api/rpc` POST handler is the single entry point EVERY live chain
 * read/send flows through. Its own logic — mode defaulting, the "upstream not
 * configured" 501, the cacheable-vs-passthrough branch, and response
 * passthrough — is what these tests pin. The robust core it wires
 * (forward/upstream/cache) is covered by its own unit suites; here we exercise
 * the handler end-to-end with a stubbed global `fetch` so no network is hit.
 */

const ENV_KEYS = ["DEVNET_RPC_URL", "HELIUS_API_KEY", "MAINNET_SIM_RPC_URL"] as const;

function rpcRequest(query: string, body: unknown) {
  return new NextRequest(`http://localhost/api/rpc${query}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function jsonResponse(status: number, body: string) {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

const OK = (result: unknown, id = 1) => JSON.stringify({ jsonrpc: "2.0", id, result });

describe("POST /api/rpc — the same-origin RPC proxy handler", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns 501 without touching the network when the mode's upstream is unconfigured", async () => {
    delete process.env.MAINNET_SIM_RPC_URL; // mainnet-sim has no default → null upstream
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(rpcRequest("?mode=mainnet-sim", { jsonrpc: "2.0", id: 1, method: "getHealth" }));

    expect(res.status).toBe(501);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards to the resolved upstream and passes status, body and content-type through", async () => {
    process.env.DEVNET_RPC_URL = "https://fake-upstream.test";
    const body = OK("healthy", 7);
    const fetchMock = vi.fn(async () => jsonResponse(200, body));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      rpcRequest("?mode=devnet", { jsonrpc: "2.0", id: 7, method: "sendTransaction", params: ["tx"] }),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(body);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://fake-upstream.test", expect.objectContaining({ method: "POST" }));
  });

  it("defaults to devnet (public fallback) when no mode is given — never a 501", async () => {
    delete process.env.DEVNET_RPC_URL;
    delete process.env.HELIUS_API_KEY; // → public devnet fallback, still resolves
    const fetchMock = vi.fn(async () => jsonResponse(200, OK("ok")));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(rpcRequest("", { jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [] }));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(PUBLIC_DEVNET, expect.anything());
  });

  it("caches an idempotent read — a repeated getAccountInfo within TTL hits ONE upstream call", async () => {
    process.env.DEVNET_RPC_URL = "https://fake-upstream.test";
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return jsonResponse(200, OK({ value: null }));
      }),
    );
    const make = () =>
      rpcRequest("?mode=devnet", {
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: ["route-cache-branch-unique-pubkey"],
      });

    await POST(make());
    await POST(make());

    expect(calls).toBe(1); // second served from the short-TTL cache
  });

  it("never caches a write — sendTransaction hits the upstream every time", async () => {
    process.env.DEVNET_RPC_URL = "https://fake-upstream.test";
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return jsonResponse(200, OK("sig"));
      }),
    );
    const make = () =>
      rpcRequest("?mode=devnet", { jsonrpc: "2.0", id: 1, method: "sendTransaction", params: ["tx"] });

    await POST(make());
    await POST(make());

    expect(calls).toBe(2); // writes pass straight through, never coalesced/cached
  });
});
