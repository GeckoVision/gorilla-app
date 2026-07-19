# Testing the transactions — three rings, inside out

Everything of value in Gorilla Markets moves through **four transactions** against
the `forge_markets` program: `create_market` → `stake` → `settle` → `claim`.
The test suite is organised as three concentric rings around those four
transactions. Each ring answers one question:

| Ring | Question it answers | Where | Network | Cost |
|---|---|---|---|---|
| **1 — program** | *Given a transaction, does the on-chain logic do the right thing?* | `program/tests/` (Mollusk) | none | $0 |
| **2 — clients** | *Do we build every transaction byte-correct, and refuse the wrong ones before signing?* | `backend/tests/` (pytest) + `frontend/tests/` (vitest) | none | $0 |
| **3 — devnet e2e** | *Does the whole loop land against the REAL deployed program and the REAL oracle?* | `backend/scripts/e2e_settlement.py` | devnet, **broadcasts** | faucet SOL |

Rings 1 and 2 are the debugger — offline, deterministic, falsifiable, safe to run
in a loop. Ring 3 is the confirmation — it is never the place you find a bug
first.

**One command for the offline rings:** `./scripts/test-rings.sh` (echoes each
command as it runs; never touches ring 3).

---

## Ring 1 — program instruction logic (Mollusk, offline)

**What it proves about the transactions.** The suite drives the compiled
`forge_markets.so` in-process with [Mollusk](https://github.com/anza-xyz/mollusk)
— real BPF execution, no validator, no network — against `mock-txoracle`, a test
double loaded at the real oracle's address that byte-exactly models
`txoracle::validate_stat` (same Anchor discriminator, same `Ok(bool)`
return-data encoding, reverts on a root mismatch). It covers, per transaction:

- `create_market` — opens the escrow, stores predicate + period, vault holds
  exactly the pot after stakes (`create_market_opens_market`).
- `settle`, the trust-critical one:
  - valid proof ⇒ CPI `Ok(true)` ⇒ `winner = Yes`, `Settled`, winner claims the
    pot, loser's claim fails (`happy_path_valid_proof_settles_yes_and_pays_out`);
  - valid proof, **false predicate** ⇒ CPI `Ok(false)` ⇒ `winner = No` — the
    regression test for the bug where a false predicate was mis-recorded as a
    YES win (`predicate_false_settles_no_and_pays_the_no_side`);
  - **tampered proof** (one flipped root byte) ⇒ CPI `Err` ⇒ `settle` reverts,
    market stays `Open` — the trust headline (`tampered_proof_reverts_settle`);
  - a look-alike oracle program id is rejected before any CPI
    (`settle_rejects_wrong_oracle_program`);
  - the **F1 market-binding rejections** (settle is permissionless; the proof
    must be pinned to THIS market): wrong `fixture_id`, wrong `stat_key`, a
    smuggled second stat/op, wrong `period` — all rejected *before* the CPI,
    market stays `Open` (`settle_rejects_fixture_id_mismatch`,
    `settle_rejects_stat_key_mismatch`, `settle_rejects_multi_stat_expression`,
    `settle_rejects_period_mismatch`).
- `claim` — pro-rata payout via the vault PDA's signed transfer; a losing
  position cannot claim (asserted inside the happy-path and Ok(false) tests).
- CPI byte-exactness — our Anchor-derived `validate_stat` discriminator equals
  the txoracle IDL's (`anchor_disc_matches_idl`).

**Run it** (from `program/`; first build the two `.so`s Mollusk loads):

```bash
cd program
anchor build --ignore-keys        # --ignore-keys: fresh clones have no .deploy-keys
                                  # (gitignored); nothing deploys — Mollusk only loads the .so
cargo build-sbf --manifest-path programs/mock-txoracle/Cargo.toml
SBF_OUT_DIR="$(pwd)/target/deploy" cargo test -p forge-markets-tests
```

**Expected output** (real run, 2026-07-19):

```
running 10 tests
test anchor_disc_matches_idl ... ok
test settle_rejects_wrong_oracle_program ... ok
test tampered_proof_reverts_settle ... ok
test predicate_false_settles_no_and_pays_the_no_side ... ok
test happy_path_valid_proof_settles_yes_and_pays_out ... ok
test settle_rejects_fixture_id_mismatch ... ok
test settle_rejects_multi_stat_expression ... ok
test settle_rejects_stat_key_mismatch ... ok
test create_market_opens_market ... ok
test settle_rejects_period_mismatch ... ok
test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.06s
```

**How to add a case.** `program/tests/src/lib.rs` is the toolkit: `Env`
(Mollusk + account store), `ix_create_market` / `ix_stake` / `ix_settle` /
`ix_claim` builders, `settle_args_with_value(root, stat_value)` (drive YES vs NO
by choosing the stat value relative to the predicate threshold; drive a revert
by tampering the root), and `decode_market` / `decode_position` for asserting
on-chain state. Copy the shape of `settle_rejects_period_mismatch` in
`program/tests/tests/settlement_tests.rs`: set up an open market, mutate ONE
field of the honest settle args, assert the error **and** that the market stayed
`Open`.

---

## Ring 2 — clients: byte-pinned transactions + policy refusals (offline, $0)

**What it proves about the transactions.** Ring 1 trusts the transaction it is
given; ring 2 proves both clients *construct* those transactions byte-for-byte
correctly, and that the wallet layer refuses a wrong transaction **before a
signature exists**. No network anywhere — RPC and Privy are injected fakes.

Backend (pytest, from `backend/`; the repo convention is **targeted node ids,
never a bare sweep as the default**):

```bash
cd backend

# instruction building, byte-pinned: discriminators are re-derived from
# sha256("global:<name>"), PDAs asserted against REAL devnet addresses, account
# order + signer/writable flags pinned per instruction, the settle args mapped
# from the real recorded proof:
uv run pytest tests/test_forge_client.py -q                       # 21 passed

# wallet policy refusals (the custody thesis): over-cap, off-allow-list,
# smuggled discriminator, missing policy, second-signer, failed simulation
# never broadcasts — for BOTH the local signer and the Privy enclave client:
uv run pytest tests/test_wallets.py tests/test_privy_policy.py -q # 40 passed

# staking orchestration + the oracle coverage gate (an uncovered fixture is
# refused BEFORE anything is sent) + the devnet-only RPC guard:
uv run pytest tests/test_staking.py tests/test_solana_rpc_guard.py -q  # 25 passed

# single-test style when iterating:
uv run pytest "tests/test_forge_client.py::test_settle_account_order_and_flags" -q
```

Frontend (vitest via pnpm, from `frontend/` — the browser builds `create_market`,
`stake` and `claim` itself, so its bytes are pinned too, against fixtures
captured from the real devnet accounts):

```bash
cd frontend
pnpm vitest run tests/forge-client.test.ts tests/claim.test.ts tests/payout.test.ts
```

**Expected output** (real runs, 2026-07-19):

```
21 passed in 0.09s      # test_forge_client.py
40 passed in 0.05s      # test_wallets.py + test_privy_policy.py
25 passed in 0.04s      # test_staking.py + test_solana_rpc_guard.py

 Test Files  3 passed (3)
      Tests  39 passed (39)   # forge-client + claim + payout (vitest)
```

(The full offline suites — `uv run pytest -q` → 183 passed, 1 skipped (the
skip *is* ring 3, opt-in); `pnpm vitest run` → 191 passed — are fine locally;
the targeted invocations above are the documented default.)

**How to add a case.**
- Backend: byte-pinning tests assert on `ix.data` / `ix.accounts` of the
  builders in `gorilla/forge_client.py` — pin the exact bytes, don't re-derive
  them with the code under test (see
  `test_create_market_ix_accounts_and_data`). Policy tests inject a fake RPC /
  fake Privy transport and assert the refusal happens with **zero** transport
  calls (see `test_privy_over_cap_never_calls_privy`).
- Frontend: fixtures in `frontend/tests/fixtures.ts` are real devnet account
  bytes (market `3urJ…rVL8`); payout tests mirror the program's u128
  floor-division math (`tests/payout.test.ts`).

---

## Ring 3 — live devnet e2e: real transactions, deliberately

> **⚠️ This ring broadcasts.** Five real transactions are signed and sent to
> Solana devnet, and the market it creates is permanent on-chain history. Run it
> when you *mean* to. It spends only faucet (devnet) SOL — no real value — but
> it is never run by CI or `scripts/test-rings.sh`.

**What it proves about the transactions.** The one thing rings 1–2 cannot: the
loop lands against the **real deployed program** and the **real TxODDS oracle**
(`6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`) with a **real recorded World
Cup Merkle proof**. A passing settle confirms the one live assumption the mock
models: the oracle returns `Ok(bool)` as Anchor return data that the program's
decoder reads. If the encoding ever differed, settle fails **closed** (funds
stay in the vault) and the captured bytes are printed for reconciliation.

**What it does, step by step** (`backend/gorilla/settlement.py::run_settlement`;
the script is a thin CLI over it):

1. `create_market` — the funder opens a market whose YES predicate provably
   HOLDS for the recorded proof (`stat > value − 1`), bound to the proof's
   period.
2. `stake` YES — the *agent* path: replay a real captured odds stream, detect
   the sharp move, size the bet inside a `RiskPolicy`, sign through a
   policy-gated wallet (default 0.01 SOL).
3. `stake` NO — a counterparty wallet funds the other side (default 0.005 SOL).
4. `settle` — first **simulated unsigned** (no signature, no spend; captures the
   oracle's return data). Only if the simulation is clean is the real settle
   signed and broadcast — a doomed settle never leaves the machine. The CPI hits
   the real oracle; the outcome is whatever bool it certifies.
5. `claim` — the winner is read from the on-chain `Market.winner` (not assumed)
   and that wallet claims the pot.

Every transaction is signed inside a `ChainPolicy` that grants each wallet
*only* its purposes (funder: create+settle; stakers: bet+claim) with a spend
cap — the same custody seam ring 2 tests.

**Prerequisites.**

- A funded devnet keypair at `program/.deploy-keys/deploy-authority.json`
  (gitignored — create one: `solana-keygen new -o
  program/.deploy-keys/deploy-authority.json` then `solana airdrop 2 <pubkey>
  --url devnet`). Staker keypairs are created automatically under
  `backend/scripts/keys/` (also gitignored) and topped up from the funder.
- Cost per run: ≈ **0.04 devnet SOL** net of the reclaimed pot (stakes + two
  account rents + fees), all faucet money.

**Run it** (from `backend/`):

```bash
cd backend
PYTHONPATH=. uv run python scripts/e2e_settlement.py            # first run
PYTHONPATH=. uv run python scripts/e2e_settlement.py --nonce 7  # any later run
```

`--nonce N` offsets the fixture id so the market PDA is fresh — a market PDA
can exist only once per `(fixture_id, stat_key)`, so a re-run without a fresh
nonce refuses early with "market … already exists". There is also a pytest
wrapper, opt-in behind an env var so a bare `pytest` can never broadcast:

```bash
GORILLA_LIVE_E2E=1 uv run pytest tests/test_e2e_devnet.py -q -s
```

**Expected output** (shape; signatures below are from the verified prior run
that produced the example market — this doc's authoring deliberately did not
broadcast a new one):

```
==============================================================================
Gorilla — live on-chain settlement loop (devnet, real TxODDS proof)
==============================================================================
funder (authority)   : <pubkey>  x.xxxx SOL
market fixture/stat  : 181795xx / 1  (proof fixture 18179549)
policies: funder{create-market,settle} · yes{place-bet,claim} · no{place-bet,claim}

1 · create_market  <market>  (predicate: stat > 0)  https://explorer.solana.com/tx/…
2 · agent bets Yes 0.01 SOL  (<sharp-move rationale>)  https://explorer.solana.com/tx/…
3 · counterparty bets No 0.005 SOL  https://explorer.solana.com/tx/…
4 · settle via real txoracle proof  returnData(b64)=AQ==  https://explorer.solana.com/tx/…
5 · winner=Yes claims pot (0.015 SOL)  https://explorer.solana.com/tx/…

==============================================================================
SETTLED · market <market>
  winner = Yes  state = Settled  pot = 0.015 SOL
```

**How to read the explorer links.** Open the settle tx: under *Instruction 2
(forge_markets: settle)* you'll see the inner CPI to the txoracle program and
its *Program return* data (`AQ==` = the byte `0x01` = `true`); the market
account's data change flips `state` to `Settled`. The claim tx shows the vault
PDA's balance going to the winner. A fully worked, transaction-by-transaction
reading of the real example market is in [`docs/SETTLEMENT.md`](SETTLEMENT.md).

**How to add a case.** Don't — extend rings 1–2 instead, then re-run ring 3
once as confirmation. The e2e is intentionally a single canonical happy path;
its negative paths (tamper, F1 mismatches, over-cap) are proven offline where
they are free and deterministic.

---

## Coverage gaps (named on purpose)

Honest holes between the rings and the transactions they guard — finding these
is how the suite improves:

1. **`run_settlement` has no offline test.** The ring-3 orchestrator
   (`backend/gorilla/settlement.py`) is exercised *only* by the live e2e. Its
   fail-closed branches — simulation error ⇒ `SettlementError` before any
   broadcast, "market already exists", "market did not settle" — are exactly the
   branches you want falsified offline with a fake RPC + fake wallets (the fakes
   already exist in `tests/test_staking.py` / `tests/test_wallets.py`).
2. **No Mollusk case for the stranded-pot path.** `claim` fails with
   `NoWinningStake` when the winning side staked zero (see `claim.rs`), leaving
   the pot stuck — behaviour that is documented but never executed in ring 1
   (settle a one-sided market, assert every claim fails, pot stays in the
   vault). Same for `AlreadyClaimed` (double-claim) and a multi-staker pro-rata
   split with floor-division dust — all ring-1 claims are a single winner
   taking the whole pot.
3. **No Mollusk case for post-settle lifecycle rejections.** `stake` after
   `Settled` and a second `settle` should both fail `MarketNotOpen`; neither is
   asserted in ring 1 (the frontend "join an existing market" flow makes the
   first one reachable by real users).
4. **The oracle return-data fail-closed decoders are untested.**
   `OracleNoReturnData` / `OracleReturnWrongProgram` / `OracleBadReturnData`
   (errors 6008–6010) have no ring-1 case — the mock always returns well-formed
   data. A second mock variant (or a flag on `mock-txoracle`) that returns
   nothing / garbage would prove settle fails closed instead of mispaying.
5. **Deployed-binary drift (devnet).** The devnet binary currently deployed at
   `7Pvo…UFt6` predates the F1 market-binding checks — the deployed program's
   binary contains the `Ok(bool)` decode but **not** the
   `FixtureMismatch`/`StatMismatch`/`MultiStatNotAllowed`/`PeriodMismatch`
   rejections (verified by inspecting the on-chain program data account). F1 is
   proven in ring 1 and ships with the next devnet redeploy; until then ring 3
   runs against the older binary. See also `docs/SETTLEMENT.md` § Known limits.
6. **Ring 3 has no scheduled/CI execution.** It is manual by design (it
   broadcasts), so drift like #5 is only caught when someone runs it and reads
   the output. A periodic founder-run with the checklist in this doc is the
   current mitigation.
