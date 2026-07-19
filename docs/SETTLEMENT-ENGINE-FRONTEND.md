# Settlement Engine — frontend & product plan

> Companion to `docs/SETTLEMENT-ENGINE.md` (the on-chain design). The engine
> (`settlement-core`, id `Et7X2jeZY6iNVDjz3jUUydm3ni3vWi8sPB4t59okNdxT`) +
> a second consumer (`forge-insurance`) are built and Mollusk-proven (18/18),
> merged on main, undeployed. This plans what the *frontend* implements next —
> founder-decided 2026-07-19.

## The decision that shapes this: showcase, not product

The engine is dev-facing infrastructure. But we do **not** yet know that
developers will come — so we build the reusable-engine story as a **showcase
that proves the thesis**, not a product that bets on demand for it. (Founder
call: "it sounds more like a showcase; this kind of solution can sound
confusing.") Concretely:

- The bettor app (Face 1) is the product. It changes as little as possible.
- The developer surface (Face 2) is a **showcase** — it proves "one engine,
  two products" and shows a dev what integration looks like, without shipping a
  supported product for users who may not exist.

## The problem the engine solves for a developer (the answer to "what do we
## solve for devs?")

A developer building *anything* that pays out on a sports result — a friends'
pool, a "rain delay" insurance, a corners prop market — otherwise has to solve
trustworthy settlement alone: run an oracle, or trust a judge/vote. The engine
gives them **one call** (`client::resolve(query, proof)`) that settles against
the real result, with the safety **built in** — they physically cannot forget
the fixture/stat/period binding, because the engine enforces it, not their code.
`forge-insurance` is the living proof: a structurally different product, on the
same engine, re-implementing zero settlement logic. That is the showcase.

This is a real problem, but **unvalidated demand**. So: prove it, don't
productize it, until a design-partner dev appears.

---

## Face 1 — the bettor app (the product; minimal change)

### 1a. REQUIRED — wire the frontend settle path to the new engine account
**This is the one non-optional item** and it's a correctness fix, not a feature.
The on-chain `settle` account list changed: a `settlement_engine` account was
inserted after `market` (`settle.rs:46`), and the consumer now threads
`daily_scores_merkle_roots` + `txoracle_program` through the engine. The
off-chain builders must match or a devnet settle will fail:
- `backend/gorilla/forge_client.py` — `build_settle_ixs` account list.
- `frontend/lib/solana/forge-client.ts` — if it builds settle (check; settle may
  be backend/keeper-only today).
Blocks the devnet e2e in the deploy bundle. Do this first, with a test.

### 1b. LOW-EFFORT, judge-visible — "settled through the engine" on the receipt
The receipt/proof view (`frontend/lib/solana/proof.ts`, `merkleStages`) already
renders the Merkle proof. Add one line: the payout was decided by the shared
engine, verified by proof, not by Gorilla. This is the on-screen version of the
"nobody in the middle" claim from the landing.

### 1c. THE SHOWCASE BEAT — "one engine, two products" (inside the app)
A small section (own block on `/` or a `/how` panel) showing the *same* engine
settling a **market** and an **insurance policy**, each with explorer links once
deployed (Mollusk/recorded evidence, honestly labeled, until then). This is the
reusability proof a non-dev — and a judge watching the demo — can see. It is the
minimum that earns the track's "reusable settlement engine" criterion.

---

## Face 2 — the developer showcase (named lightly: "Gorilla Settlement")

Named for devs only, invisible in the bettor app (founder call). Scoped as a
**showcase**, per the decision above.

### 2a. A minimal, honest "SDK" — the example, not a published package
Founder asked for an SDK during the hackathon; the showcase-correct version is
**the smallest real thing that proves integration is trivial**, not a supported
npm package. Ship:
- A single documented example — `examples/settle-your-own/` — showing a consumer
  calling `client::resolve(query, proof)`: the `PredicateQuery` (fixture_id,
  stat_key, period, predicate), the three threaded accounts (engine,
  daily-roots, txoracle), the fail-closed read. ~10 lines of the call + comments.
- A one-file TS helper mirroring it for a client-side caller, if a consumer
  settles from the browser. Clearly labeled "reference, not a released SDK."

This satisfies "a dev could integrate in ~10 lines" as a *demonstrated* fact,
without productizing an unvalidated audience.

### 2b. A lean `/build` (or `/settlement-engine`) page — dev value prop + the two
consumers
- Plain dev pitch: *"Settle your own markets against real sports results — one
  call, no oracle to run. The safety is built in."*
- The two reference consumers side by side (market + insurance), each with its
  explorer link — the composability claim, verifiable.
- The interface, rendered from `docs/SETTLEMENT-ENGINE.md` (don't re-author):
  the `PredicateQuery` contract, the accounts, the return value, the one gotcha
  (read return-data immediately after the CPI).

### NOT now (post-hackathon, only if demand appears)
A published/supported npm SDK, an engine-activity registry view, a
scaffold-a-consumer quickstart, the permissionless cache PDA. All bet on demand
we have not validated.

---

## Two audiences, two languages (do not collapse)

- Face 1 speaks bar language (`docs/positioning.md`): no "CPI", no "settlement",
  no "oracle". A bettor never sees the engine.
- Face 2 speaks dev language: the interface, the CU envelope, the example. A dev
  never sees a "no hidden tricks" hero.

The engine is the seam between them. The strategic echo (internal only,
gecko-invisible in public copy): this dev-facing infra is the same *shape* as
Gecko's dev-facing comprehension layer — builders consume it; end users get the
benefit without meeting the tool.

---

## Sequencing

1. **1a (settle account wiring)** — first, blocks the devnet e2e. Backend +
   frontend builders + a test. Bundles with the founder-run deploy (#43 F1 +
   #36 lock_ts + the engine).
2. **1b + 1c (receipt line + two-product beat)** — the judge-visible Face-1
   work; can land pre-deploy on Mollusk/recorded evidence.
3. **2a + 2b (example SDK + /build showcase)** — the dev showcase; real once the
   engine is deployed and the two consumers have live explorer links.

## Honesty gates (unchanged)

Never imply mainnet/real-money; the two-consumer claim is "verified in tests +
devnet," not "in production." The engine adds no cryptographic trust over CPIing
txoracle directly — its value is forced binding + one audited deployment. Say it
that way, or a judge calls it ceremony.
