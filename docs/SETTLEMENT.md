# A settled market, transaction by transaction

This walks the **real, verifiable on-chain history** of the example settled
market — every claim below can be checked in the explorer, nothing is a mock:

- **Market account:** [`3urJkTFSAf6QXLU6QvkbbS4GjLn3Tos8VQjKgGmRrVL8`](https://explorer.solana.com/address/3urJkTFSAf6QXLU6QvkbbS4GjLn3Tos8VQjKgGmRrVL8?cluster=devnet)
- **Program:** `forge_markets` [`7Pvo6SEh1zBa1Euvj5QQ4td9GpfsQosTpxhqwWtWUFt6`](https://explorer.solana.com/address/7Pvo6SEh1zBa1Euvj5QQ4td9GpfsQosTpxhqwWtWUFt6?cluster=devnet) (devnet)
- **Oracle CPI'd at settle:** TxODDS `txoracle` `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`
- Settled **2026-07-16 (UTC)**; the whole loop (create → two stakes → settle →
  claim) landed in ~12 seconds, produced by one run of
  `backend/scripts/e2e_settlement.py`.

The market's full transaction history is exactly five transactions (oldest
first) — the four instructions of the program's lifecycle, with `stake` twice:

| # | Instruction | Tx |
|---|---|---|
| 1 | `create_market` | [`3xZBdK…VuGBD`](https://explorer.solana.com/tx/3xZBdKjQz91PHhoQacyiwReuiEMvvefVTzT7dsBe4fP46dFjxqxDhD4GNJnSouJEV91Sdz4JSFWpibikwG1VuGBD?cluster=devnet) |
| 2 | `stake` YES 0.01 SOL | [`4UumJG…ydYUZf`](https://explorer.solana.com/tx/4UumJGt9Hw1Aphav2FkorQrLQoBAejVYsneX5Yp48UBZi7ThLShXU1b2i422DePXfLXg4hUgctmiv1vGDtydYUZf?cluster=devnet) |
| 3 | `stake` NO 0.005 SOL | [`3e3sqJ…vEFeKd`](https://explorer.solana.com/tx/3e3sqJde3YfwukDvbXF6iNcnT3YdExiTpsEwCVSvNeT3airMEseSaj43DifbqQaGbP25387DZ1uiThGsufvEFeKd?cluster=devnet) |
| 4 | `settle` (oracle CPI) | [`3dUkS8…fd4Te6`](https://explorer.solana.com/tx/3dUkS8WwrZ7pegSWE2jvwT9XAzyueNk4q2MoSVzJxw6QvnKB8XB7rTLXwdgTKjNeaJVoc9PkBjWTXXLUqKfd4Te6?cluster=devnet) |
| 5 | `claim` (winner paid) | [`2WXRrm…aHPtCC`](https://explorer.solana.com/tx/2WXRrmgXJeZEV1bdee8Qb6tD51SEGNffiRbr39Yr7tf5Xj4ZZ3LxMc6n43Mt2uqutCXoQfpYZSpk5HSqfJaHPtCC?cluster=devnet) |

---

## 1 · `create_market` — the terms go on-chain first

[`create_market.rs`](../program/programs/forge-markets/src/instructions/create_market.rs)
opens the escrow at a deterministic PDA — seeds `[b"market", fixture_id,
stat_key]` — and stores the market's terms *before any money moves*:

- **fixture** `18179551`, **stat key** `1` (a goals stat of the recorded World
  Cup fixture),
- the **YES predicate**: `stat > 0` (`TraderPredicate { threshold: 0,
  GreaterThan }`) — decoded straight from this tx's instruction bytes,
- the vault PDA (`[b"vault", market]`) that will hold the pot.

The predicate is the market's entire ruleset: at settle time the *oracle* — not
this program, not the creator — evaluates it against a proven stat value.

Markets created from today's source additionally store the stat **period**
(full-time vs half-time — `create_market.rs`, `state.rs:65`), which `settle`
enforces. This historical market predates the period argument: its create
instruction data is 17 bytes (no trailing `i32` period) — see *Known limits*
below.

## 2–3 · `stake` — both sides fund the vault

[`stake.rs`](../program/programs/forge-markets/src/instructions/stake.rs)
transfers lamports into the vault and records a `Position` PDA per staker —
seeds `[b"position", market, staker]` (`state.rs:72`), holding side, amount and
a `claimed` flag:

- Tx 2: `side = Yes` (byte `0x00`), `amount = 10,000,000` lamports = **0.01 SOL**
  — placed by the *agent* through its policy-gated wallet.
- Tx 3: `side = No` (byte `0x01`), `amount = 5,000,000` lamports = **0.005 SOL**
  — the counterparty.

(Those side/amount bytes are readable in each transaction's instruction data;
`backend/tests/test_forge_client.py` and `frontend/tests/forge-client.test.ts`
pin this exact encoding offline.)

The vault now holds the whole pot: **0.015 SOL**. `Market.stake_yes /
stake_no` track the two sides for the payout math.

## 4 · `settle` — the oracle decides, not the program

The heart of the thesis, in
[`settle.rs`](../program/programs/forge-markets/src/instructions/settle.rs).
Open tx 4 in the explorer and look inside the `forge_markets: settle`
instruction: there is an **inner CPI to the txoracle program** — that CPI *is*
the settlement.

What the code does, in order:

1. **Bind the proof to this market** (`settle.rs:65-91`, the F1 checks —
   `settle` is permissionless, so the caller-supplied proof must match the
   market's `fixture_id`, `stat_key`, single-stat shape, and `period`;
   otherwise a genuine proof about some *other* data point could settle this
   market). See the ring-1 tests `settle_rejects_*` and the deployed-binary
   note under *Known limits*.
2. **CPI `txoracle::validate_stat`** (`settle.rs:98`) with the market's *stored*
   predicate and the caller's 3-stage Merkle proof. The oracle verifies the
   proof against **its own** on-chain daily root and evaluates the predicate.
3. **Decode the oracle's answer** from CPI return data: this tx returned
   `AQ==` (base64 for the byte `0x01`) — `Ok(true)`, the predicate held —
   so `winner = Yes`, `state = Settled` (`settle.rs:112-115`). Had it returned
   `0x00` (`Ok(false)`), the market would settle **No** — a legitimate outcome,
   not an error.
4. **Tamper ⇒ revert.** A proof that doesn't fold up to the oracle's root makes
   the CPI fail; the error propagates and the whole `settle` reverts — market
   stays `Open`, funds untouched. That revert is the trust guarantee, proven in
   ring 1 by `tampered_proof_reverts_settle` (a single flipped root byte).

The program never inspects the proof and never evaluates the predicate itself.

## 5 · `claim` — pro-rata payout, signed by the vault PDA

[`claim.rs`](../program/programs/forge-markets/src/instructions/claim.rs)
requires `state == Settled` and `position.side == market.winner`, then pays
(`claim.rs:77-84`):

```
payout = pot × position.amount ÷ winning_side_total        (u128, floor division)
```

With this market's real numbers:

```
pot                = 10,000,000 + 5,000,000 = 15,000,000 lamports (0.015 SOL)
winner             = Yes; winning-side total = 10,000,000
YES staker payout  = 15,000,000 × 10,000,000 ÷ 10,000,000 = 15,000,000 lamports
                   = 0.015 SOL — the whole pot (sole winning staker)
```

The vault PDA signs the outbound transfer with its stored bump seeds; the
position is marked `claimed` (double-claim ⇒ `AlreadyClaimed`). Tx 5 shows the
vault's 0.015 SOL arriving at the YES staker.

---

## "Isn't the demo rigged? The predicate always wins."

Head-on: for the *end-to-end demo*, yes — the market is opened with a predicate
chosen to hold. `winning_predicate`
(`backend/gorilla/forge_client.py:408`) builds `stat > value − 1` from the
recorded proof's own value, which is always true, so a scripted e2e run
deterministically exercises the *full* five-transaction loop including a
winner's claim. That is a **demo-determinism choice in the market that gets
created, not a bias in the program**: the on-chain `settle` treats YES and NO
symmetrically — the oracle returns `Ok(true|false)` and the program records
whichever side the proof certifies. The `Ok(false) → No` path (a false
predicate settles NO and pays the NO side) is proven in ring 1 by
`predicate_false_settles_no_and_pays_the_no_side`, and a tampered proof
reverts rather than settling either way. Open a market with `stat > 99` against
the same proof and the same code settles it **No**.

---

## Known limits (v1, devnet)

Named deliberately — these are the sharp edges a reviewer should know about:

- **No kickoff cutoff.** `Open` is the only stake gate — stakes are accepted
  until someone settles, including after the outcome is knowable. A `lock_ts`
  is planned, drawn from the `Market._reserved` tail so existing accounts stay
  decodable (`stake.rs:23-27`, `state.rs:67`).
- **One stake per staker per market.** The `Position` PDA is `init`, not
  `init_if_needed` (banned) — a second stake from the same wallet fails.
  Deliberate v1 scope; re-staking/averaging is deferred (`state.rs:72-74`).
- **No reclaim for a stranded pot.** If a market settles with an *empty*
  winning side, every claim fails with `NoWinningStake` and the pot stays in
  the vault — there is no refund instruction yet for the losing stakers (one is
  spec'd). Same for a market that can never be settled (its proof never
  materialises): funds wait in the vault indefinitely (`claim.rs:71-75`,
  `errors.rs` `NoWinningStake`).
- **Floor-division dust.** The pro-rata division floors; with multiple winning
  stakers a few lamports can remain in the vault after all claims. They are
  not stealable (only `claim` moves vault funds) but are currently
  unrecoverable — same future reclaim instruction.
- **Deployed-binary drift (honesty note).** The devnet binary deployed at
  `7Pvo…UFt6` predates the F1 market-binding checks (step 1 above) and the
  `period` argument — which is also why this example market's create carries
  no period. F1 is in the source you are reading and proven by the ring-1
  Mollusk suite (`docs/TESTING.md`), and lands on-chain with the next devnet
  redeploy.
