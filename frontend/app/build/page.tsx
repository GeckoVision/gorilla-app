import type { Metadata } from "next";
import { ArrowRight, ShieldCheck, Trophy, Umbrella } from "lucide-react";

import { ExplorerLink } from "@/components/shared/explorer-link";
import { explorerTx } from "@/lib/solana/config";

export const metadata: Metadata = {
  title: "Gorilla Settlement — settle your own markets on real sports results",
  description:
    "A reusable on-chain settlement engine (settlement-core) on Solana devnet. Pass a PredicateQuery, get a proof-verified bool back. One call, no oracle to run — the fixture/stat/period binding is enforced inside the engine.",
};

// ── Real, deployed on-chain identities (devnet) ─────────────────────────────
// The engine + its two reference consumers. Every id below is deployed and
// executable on devnet; every tx below is a real settle signature pulled from
// backend/scripts/live-engine-settlements.json + live-insurance-settlement.json.
const ENGINE_ID = "9S6SwSp5ShrDV7NLhtUCqttHTgXTPp7PCNuWuSeHjEjT";
const FORGE_MARKETS_ID = "7Pvo6SEh1zBa1Euvj5QQ4td9GpfsQosTpxhqwWtWUFt6";
const FORGE_INSURANCE_ID = "F8kKN4syidmfRuy5atqhUuJPVQFM4DYH5xmqQ9pSQ22A";

// A settled market and a settled policy — both CPI the SAME engine (their tx
// logs show `Program 9S6SwSp5…invoke`). Fixture 17588235, stat_key 1.
const MARKET_SETTLE_TX =
  "GprYXh2mzUjHVNAcNbCJhtqVFmWgSxh6XuFr2R3CJgPBDB2AGZ4Wro4C6XpxP4yj4Vu1DgHqrhchg1ZAHBjXoiv";
const INSURANCE_SETTLE_TX =
  "2jwFUAXv8LLqRiTBGoAd4Uk9aqTg5UWofqeeNfe24tv7qxysDdhTsEDoeRPXVRoXGMnnXnMUeJ6RWYb5Dw2Mo17c";

// The consumer call, verbatim in shape from forge-markets settle.rs — the
// PredicateQuery it builds + the settlement_core::client::resolve(...) call.
// Nothing here is invented: it re-implements no CPI or binding logic.
const INTEGRATION_SNIPPET = `use settlement_core::{client, PredicateQuery};

// 1. Declare what THIS market resolves. The engine binds the caller's oracle
//    args to exactly this tuple before it proves anything — you can't get it wrong.
let query = PredicateQuery {
    fixture_id: market.fixture_id, // engine asserts fixture_summary.fixture_id == this
    stat_key:   market.stat_key,   // engine asserts stat_a.stat_to_prove.key    == this
    period:     market.period,     // engine asserts stat_a.stat_to_prove.period == this
    predicate:  market.predicate,  // the YES condition, forwarded to txoracle
};

// 2. One CPI. F1-binding + txoracle proof + fail-closed decode all live inside.
let predicate_held: bool = client::resolve(
    &ctx.accounts.settlement_engine.to_account_info(),        // engine, pinned by addr
    &ctx.accounts.daily_scores_merkle_roots.to_account_info(), // txoracle daily roots
    &ctx.accounts.txoracle_program.to_account_info(),         // txoracle, pinned by addr
    &query, ts, &fixture_summary, &fixture_proof, &main_tree_proof,
    &stat_a, &stat_b, &op,
)?; // Err = tampered/unbound proof -> your instruction reverts. Fail-closed.

// 3. Apply the outcome. This is the only market-specific line you write.
market.winner = if predicate_held { Side::Yes } else { Side::No };`;

/** Dim comment lines so the ~10 load-bearing lines carry the eye. */
function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="mono-s overflow-x-auto rounded-xl border border-border bg-popover/60 p-5 leading-relaxed">
      <code>
        {code.split("\n").map((line, i) => {
          const isComment = line.trimStart().startsWith("//");
          return (
            <span
              key={i}
              className={
                isComment ? "block text-muted-foreground/55" : "block text-foreground"
              }
            >
              {line || " "}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

const CONSUMERS = [
  {
    icon: Trophy,
    kind: "Market",
    programLabel: "forge-markets",
    programId: FORGE_MARKETS_ID,
    body: "A pari-mutuel prop market. Reads its (fixture, stat, period, predicate), CPIs the engine, maps the bool to a Side. Escrows SOL.",
    settleTx: MARKET_SETTLE_TX,
  },
  {
    icon: Umbrella,
    kind: "Insurance policy",
    programLabel: "forge-insurance",
    programId: FORGE_INSURANCE_ID,
    body: "A structurally different product — fixed indemnity, asymmetric insurer/insured roles, USDC. Same engine, re-implements zero settlement logic.",
    settleTx: INSURANCE_SETTLE_TX,
  },
] as const;

const QUERY_FIELDS = [
  ["fixture_id", "i64", "engine asserts fixture_summary.fixture_id == this"],
  ["stat_key", "u32", "engine asserts stat_a.stat_to_prove.key == this"],
  ["period", "i32", "engine asserts stat_a.stat_to_prove.period == this"],
  ["predicate", "TraderPredicate", "the YES condition, forwarded to txoracle"],
] as const;

const ACCOUNTS = [
  ["settlement_engine", "the engine program — makes the resolve CPI callable"],
  ["daily_scores_merkle_roots", "txoracle-owned daily roots; threaded straight through"],
  ["txoracle_program", "txoracle, pinned by address at both hops"],
] as const;

export default function BuildPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
      {/* ── 1. Value prop ─────────────────────────────────────────────────── */}
      <section>
        <p className="eyebrow flex items-center gap-2 text-primary">
          <span aria-hidden className="font-display text-base">
            {"//"}
          </span>
          Gorilla Settlement · for developers
        </p>
        <h1 className="display-l mt-4 max-w-3xl text-balance">
          Settle your own markets against real sports results.
        </h1>
        <p className="body-l mt-6 max-w-2xl text-muted-foreground text-pretty">
          One call, no oracle to run. Pass a{" "}
          <code className="mono-s text-foreground">PredicateQuery</code> —{" "}
          <code className="mono-s text-foreground">fixture_id</code>,{" "}
          <code className="mono-s text-foreground">stat_key</code>,{" "}
          <code className="mono-s text-foreground">period</code>,{" "}
          <code className="mono-s text-foreground">predicate</code> — and get a
          proof-verified bool back, or a revert. The fixture/stat/period binding is
          enforced <em>inside</em> the engine, so you can&apos;t get it wrong.
        </p>
        <div className="mt-6 max-w-2xl rounded-lg border border-border bg-card/50 p-4">
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            <span className="font-medium text-foreground">Honest scope:</span> the
            engine adds no cryptographic trust over CPIing TxLINE&apos;s oracle
            directly — the oracle is already the trust root. Its value is the{" "}
            <span className="text-foreground">forced binding</span> every consumer
            is routed through, plus{" "}
            <span className="text-foreground">one audited deployment</span> instead
            of each product re-implementing settlement.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="eyebrow text-muted-foreground">Engine · settlement-core</span>
          <ExplorerLink value={ENGINE_ID} short={false} className="text-sm" />
        </div>
      </section>

      {/* ── 2. Live proof — two consumers, one engine ─────────────────────── */}
      <section className="mt-20">
        <h2 className="display-poster text-balance">One engine, two products.</h2>
        <p className="body-l mt-4 max-w-2xl text-muted-foreground text-pretty">
          Two structurally different consumers settle through the{" "}
          <em>same</em> engine on devnet. Verify it on chain — each settle tx&apos;s
          logs show{" "}
          <code className="mono-s text-foreground">Program 9S6SwSp5…invoke</code>.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {CONSUMERS.map((c) => (
            <div
              key={c.kind}
              className="flex flex-col gap-4 rounded-xl border border-border bg-card/70 p-6"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/25">
                  <c.icon className="size-5" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">{c.kind}</h3>
                  <span className="mono-s text-muted-foreground/70">
                    {c.programLabel}
                  </span>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                {c.body}
              </p>
              <div className="mt-auto flex flex-col gap-2 border-t border-border/60 pt-4">
                <div className="flex items-center gap-2">
                  <span className="mono-s w-16 shrink-0 text-muted-foreground/60">
                    program
                  </span>
                  <ExplorerLink value={c.programId} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="mono-s w-16 shrink-0 text-muted-foreground/60">
                    settle tx
                  </span>
                  <ExplorerLink value={c.settleTx} kind="tx" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/[0.06] p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold ring-1 ring-gold/25">
            <ShieldCheck className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground text-pretty">
            <span className="font-medium text-foreground">
              Both CPI the same engine
            </span>{" "}
            — <ExplorerLink value={ENGINE_ID} className="text-sm" />. One deployment
            to audit; two products that share zero settlement code.
          </p>
        </div>
      </section>

      {/* ── 3. The minimalist SDK ─────────────────────────────────────────── */}
      <section className="mt-20">
        <p className="eyebrow text-primary">The integration, in ~10 lines</p>
        <h2 className="display-l mt-3 text-balance">Consume it from your program.</h2>
        <p className="body-l mt-4 max-w-2xl text-muted-foreground text-pretty">
          This is the actual call — the shape lifted verbatim from{" "}
          <code className="mono-s text-foreground">forge-markets</code>&apos;s{" "}
          <code className="mono-s text-foreground">settle.rs</code>. It
          re-implements no CPI or binding logic: build the query from your
          market&apos;s tuple, thread the three accounts, read the result
          fail-closed.
        </p>

        <div className="mt-6">
          <CodeBlock code={INTEGRATION_SNIPPET} />
        </div>

        <p className="mt-4 max-w-2xl text-sm text-muted-foreground text-pretty">
          <span className="font-medium text-foreground">How it fails:</span> a
          tampered proof makes the inner CPI <code className="mono-s">Err</code>, so{" "}
          <code className="mono-s">resolve</code> reverts and your instruction with
          it. A proof for the wrong fixture never even reaches the oracle — the
          engine rejects it with{" "}
          <code className="mono-s text-foreground">FixtureMismatch</code>.
        </p>
        <p className="mt-3 max-w-2xl text-xs text-muted-foreground/70">
          Reference, not a released package — there is no npm/crate to install.
          Copy the call; the engine is deployed.
        </p>
      </section>

      {/* ── 4. Interface reference ────────────────────────────────────────── */}
      <section className="mt-20">
        <p className="eyebrow text-primary">Interface reference</p>
        <h2 className="display-l mt-3 text-balance">
          <code className="mono-s align-middle text-2xl text-foreground">
            client::resolve(query, proof) -&gt; Result&lt;bool&gt;
          </code>
        </h2>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {/* PredicateQuery */}
          <div className="rounded-xl border border-border bg-card/70 p-6">
            <h3 className="mono-s text-foreground">PredicateQuery</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              What you declare you&apos;re resolving — the engine binds the proof to it.
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {QUERY_FIELDS.map(([name, ty, note]) => (
                <li key={name} className="flex flex-col gap-0.5">
                  <span className="mono-s">
                    <span className="text-foreground">{name}</span>
                    <span className="text-muted-foreground/60">: {ty}</span>
                  </span>
                  <span className="text-xs text-muted-foreground/80">{note}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Accounts + return */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-card/70 p-6">
              <h3 className="mono-s text-foreground">Accounts (in order)</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {ACCOUNTS.map(([name, note]) => (
                  <li key={name} className="flex flex-col gap-0.5">
                    <span className="mono-s text-foreground">{name}</span>
                    <span className="text-xs text-muted-foreground/80">{note}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-card/70 p-6">
              <h3 className="mono-s text-foreground">Returns</h3>
              <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                <li className="flex items-baseline gap-2">
                  <code className="mono-s text-yes">Ok(true)</code>
                  <span className="text-muted-foreground">predicate held</span>
                </li>
                <li className="flex items-baseline gap-2">
                  <code className="mono-s text-foreground">Ok(false)</code>
                  <span className="text-muted-foreground">did not hold</span>
                </li>
                <li className="flex items-baseline gap-2">
                  <code className="mono-s text-no">Err</code>
                  <span className="text-muted-foreground">
                    tampered / undecodable / unbound → the caller reverts
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* The one gotcha */}
        <div className="mt-4 rounded-xl border border-primary/25 bg-primary/[0.05] p-5">
          <p className="mono-s text-primary">
            <span aria-hidden>{"// "}</span>the one gotcha
          </p>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Read the return data <span className="text-foreground">immediately</span>{" "}
            after the engine CPI — no intervening CPI. The engine CPIs txoracle, then
            re-sets the return data to its own bool;{" "}
            <code className="mono-s">client::resolve</code> reads it right away and
            decodes fail-closed. Slip another CPI in between and you&apos;d read the
            wrong program&apos;s bytes. This is the whole two-hop return-data contract.
          </p>
        </div>
      </section>

      {/* ── footer nav within the page ────────────────────────────────────── */}
      <div className="mt-20 border-t border-border/60 pt-8">
        <a
          href={explorerTx(MARKET_SETTLE_TX)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-accent"
        >
          Verify a live settlement on chain
          <ArrowRight className="size-4" />
        </a>
      </div>
    </div>
  );
}
