"""forge_markets client — built instructions are byte-exact, offline and $0.

Every assertion here is falsifiable with zero network: the discriminators, the account metas
(order + signer/writable flags), the Borsh args, the settle-arg mapping from the recorded
proof (the ts<-minTimestamp fix, the derived root PDA, NO predicate in settle), and the
Market decode. The live devnet leg (test_e2e_devnet) is the final smoke, not the debugger.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from solders.pubkey import Pubkey

from agentforge.forge_client import (
    COMPUTE_BUDGET_ID,
    DISCRIMINATORS,
    FORGE_PROGRAM_ID,
    SYSTEM_PROGRAM_ID,
    TXORACLE_PROGRAM_ID,
    Comparison,
    MarketAccount,
    TraderPredicate,
    build_claim_ix,
    build_create_market_ix,
    build_settle_ixs,
    build_stake_ix,
    daily_scores_roots_pda,
    decode_market,
    encode_settle_args,
    load_recorded_proof,
    market_pda,
    position_pda,
    side_index,
    to_lamports,
    vault_pda,
    winning_predicate,
)

PROOF_PATH = (
    Path(__file__).resolve().parent.parent / "scripts" / "fixtures" / "recorded_stat_proof.json"
)
PROOF = load_recorded_proof(PROOF_PATH)

FIXTURE_ID = 18179549
STAT_KEY = 1
# Verified against the deployed program / the probe's derivation.
KNOWN_ROOT = "DjE6qSDHJEUwbXXTV5v1YSQpzfsWcRsARbWqLqR3KoSA"
KNOWN_MARKET = "6AiyHQnCD4pFg8Pc5vJH1J9uNKJiskCRQLGdaaErsbz2"


# ── a tiny independent Borsh reader, to decode-back what the client encoded ────────
class _Reader:
    def __init__(self, data: bytes) -> None:
        self.d = data
        self.o = 0

    def take(self, n: int) -> bytes:
        b = self.d[self.o : self.o + n]
        self.o += n
        return b

    def u8(self) -> int:
        return self.take(1)[0]

    def u32(self) -> int:
        return int.from_bytes(self.take(4), "little")

    def i32(self) -> int:
        return int.from_bytes(self.take(4), "little", signed=True)

    def i64(self) -> int:
        return int.from_bytes(self.take(8), "little", signed=True)

    def arr32(self) -> list[int]:
        return list(self.take(32))

    def proof_vec(self) -> list[tuple[list[int], int]]:
        return [(self.arr32(), self.u8()) for _ in range(self.u32())]


# ── discriminators ────────────────────────────────────────────────────────────────
def test_discriminators_are_anchor_sha256():
    for name, disc in DISCRIMINATORS.items():
        assert disc == hashlib.sha256(f"global:{name}".encode()).digest()[:8]
        assert len(disc) == 8


# ── PDA anchors (known-good, verified on devnet) ──────────────────────────────────
def test_market_pda_matches_known_devnet_address():
    market, bump = market_pda(FIXTURE_ID, STAT_KEY)
    assert str(market) == KNOWN_MARKET
    assert 0 <= bump <= 255


def test_daily_scores_roots_pda_matches_known_root():
    min_ts = PROOF["summary"]["updateStats"]["minTimestamp"]
    root, _bump, epoch_day = daily_scores_roots_pda(min_ts)
    assert str(root) == KNOWN_ROOT
    assert epoch_day == min_ts // 86_400_000 == 20638


def test_position_and_vault_pdas_are_deterministic():
    market, _ = market_pda(FIXTURE_ID, STAT_KEY)
    v1, _ = vault_pda(market)
    v2, _ = vault_pda(market)
    assert v1 == v2
    staker = Pubkey.default()
    p1, _ = position_pda(market, staker)
    p2, _ = position_pda(market, staker)
    assert p1 == p2 and v1 != p1


# ── create_market ──────────────────────────────────────────────────────────────────
def test_create_market_ix_accounts_and_data():
    authority = Pubkey.from_string("3gtfwhBtFKB4k9M7vjcZ9qCAW6HwP4Y2WLJiJbimBbrj")
    pred = TraderPredicate(threshold=0, comparison=Comparison.GREATER_THAN)
    ix = build_create_market_ix(FIXTURE_ID, STAT_KEY, pred, authority)

    assert ix.program_id == FORGE_PROGRAM_ID
    market, _ = market_pda(FIXTURE_ID, STAT_KEY)
    vault, _ = vault_pda(market)
    metas = ix.accounts
    assert [m.pubkey for m in metas] == [market, vault, authority, SYSTEM_PROGRAM_ID]
    # Anchor account flags: market(w,ns), vault(r,ns), authority(w,signer), system(r,ns).
    assert [(m.is_signer, m.is_writable) for m in metas] == [
        (False, True),
        (False, False),
        (True, True),
        (False, False),
    ]
    r = _Reader(ix.data)
    assert r.take(8) == DISCRIMINATORS["create_market"]
    assert r.i64() == FIXTURE_ID
    assert r.u32() == STAT_KEY
    assert r.i32() == 0  # threshold
    assert r.u8() == int(Comparison.GREATER_THAN)
    assert r.o == len(ix.data)  # nothing extra


# ── stake ──────────────────────────────────────────────────────────────────────────
def test_stake_ix_accounts_and_data():
    staker = Pubkey.default()
    ix = build_stake_ix(FIXTURE_ID, STAT_KEY, staker, "Yes", 10_000_000)
    market, _ = market_pda(FIXTURE_ID, STAT_KEY)
    vault, _ = vault_pda(market)
    position, _ = position_pda(market, staker)
    metas = ix.accounts
    assert [m.pubkey for m in metas] == [market, position, vault, staker, SYSTEM_PROGRAM_ID]
    assert [(m.is_signer, m.is_writable) for m in metas] == [
        (False, True),
        (False, True),
        (False, True),
        (True, True),
        (False, False),
    ]
    r = _Reader(ix.data)
    assert r.take(8) == DISCRIMINATORS["stake"]
    assert r.u8() == side_index("Yes") == 0
    assert int.from_bytes(r.take(8), "little") == 10_000_000
    assert r.o == len(ix.data)


def test_stake_side_no_encodes_variant_one():
    ix = build_stake_ix(FIXTURE_ID, STAT_KEY, Pubkey.default(), "No", 5)
    assert ix.data[8] == side_index("No") == 1


# ── settle (the fixes: ts<-minTimestamp, derived root, NO predicate) ───────────────
def test_settle_ixs_have_compute_budget_prelude_then_settle():
    ixs = build_settle_ixs(FIXTURE_ID, STAT_KEY, PROOF)
    assert len(ixs) == 2
    cu, settle = ixs
    assert cu.program_id == COMPUTE_BUDGET_ID
    assert cu.data[0] == 2  # SetComputeUnitLimit
    assert int.from_bytes(cu.data[1:5], "little") >= 350_000
    assert settle.program_id == FORGE_PROGRAM_ID


def test_settle_account_order_and_flags():
    _cu, settle = build_settle_ixs(FIXTURE_ID, STAT_KEY, PROOF)
    market, _ = market_pda(FIXTURE_ID, STAT_KEY)
    root, _, _ = daily_scores_roots_pda(PROOF["summary"]["updateStats"]["minTimestamp"])
    metas = settle.accounts
    assert [m.pubkey for m in metas] == [market, root, TXORACLE_PROGRAM_ID]
    # market(w,ns), daily_scores_merkle_roots(r,ns), txoracle_program(r,ns).
    assert [(m.is_signer, m.is_writable) for m in metas] == [
        (False, True),
        (False, False),
        (False, False),
    ]


def test_settle_args_map_from_recorded_proof_with_ts_fix_and_no_predicate():
    summary = PROOF["summary"]
    us = summary["updateStats"]
    r = _Reader(encode_settle_args(PROOF))

    assert r.take(8) == DISCRIMINATORS["settle"]
    # THE FIX: ts is minTimestamp, NOT the proof's top-level ts.
    ts = r.i64()
    assert ts == us["minTimestamp"]
    assert ts != PROOF["ts"]
    # fixture_summary: ScoresBatchSummary
    assert r.i64() == summary["fixtureId"] == FIXTURE_ID
    assert r.i32() == us["updateCount"]
    assert r.i64() == us["minTimestamp"]
    assert r.i64() == us["maxTimestamp"]
    assert r.arr32() == list(summary["eventStatsSubTreeRoot"])
    # fixture_proof <- subTreeProof ; main_tree_proof <- mainTreeProof
    sub = r.proof_vec()
    assert [n[0] for n in sub] == [list(n["hash"]) for n in PROOF["subTreeProof"]]
    assert [n[1] for n in sub] == [1 if n["isRightSibling"] else 0 for n in PROOF["subTreeProof"]]
    main = r.proof_vec()
    assert [n[0] for n in main] == [list(n["hash"]) for n in PROOF["mainTreeProof"]]
    # stat_a comes DIRECTLY after main_tree_proof — no predicate in between.
    stat = PROOF["statToProve"]
    assert r.u32() == stat["key"] == 1
    assert r.i32() == stat["value"] == 1
    assert r.i32() == stat["period"] == 4
    assert r.arr32() == list(PROOF["eventStatRoot"])
    stat_proof = r.proof_vec()
    assert len(stat_proof) == len(PROOF["statProof"])
    # stat_b: Option = None ; op: Option = None
    assert r.u8() == 0
    assert r.u8() == 0
    assert r.o == len(r.d)  # consumed exactly — no trailing predicate/fields


def test_winning_predicate_holds_for_the_recorded_value():
    pred = winning_predicate(PROOF)
    value = PROOF["statToProve"]["value"]
    assert pred.comparison == Comparison.GREATER_THAN
    assert pred.threshold == value - 1
    assert value > pred.threshold  # holds -> settle records winner = Yes


# ── claim ──────────────────────────────────────────────────────────────────────────
def test_claim_ix_accounts_and_data():
    staker = Pubkey.default()
    ix = build_claim_ix(FIXTURE_ID, STAT_KEY, staker)
    market, _ = market_pda(FIXTURE_ID, STAT_KEY)
    vault, _ = vault_pda(market)
    position, _ = position_pda(market, staker)
    metas = ix.accounts
    assert [m.pubkey for m in metas] == [market, position, vault, staker, SYSTEM_PROGRAM_ID]
    # market(r,ns), position(w,ns), vault(w,ns), staker(w,signer), system(r,ns).
    assert [(m.is_signer, m.is_writable) for m in metas] == [
        (False, False),
        (False, True),
        (False, True),
        (True, True),
        (False, False),
    ]
    assert ix.data == DISCRIMINATORS["claim"]


# ── Market decode ──────────────────────────────────────────────────────────────────
def _market_bytes(*, stake_yes: int, stake_no: int, state: int, winner: int) -> bytes:
    body = bytearray()
    body += (0).to_bytes(8, "little")  # placeholder disc (decode skips 8)
    body += FIXTURE_ID.to_bytes(8, "little", signed=True)
    body += STAT_KEY.to_bytes(4, "little")
    body += (2).to_bytes(4, "little", signed=True)  # predicate.threshold
    body += bytes([int(Comparison.EQUAL_TO)])  # predicate.comparison
    body += bytes(Pubkey.default())  # vault
    body += stake_yes.to_bytes(8, "little")
    body += stake_no.to_bytes(8, "little")
    body += bytes([state, winner])
    body += bytes(Pubkey.default())  # authority
    body += bytes([254, 253, 1])  # bump, vault_bump, schema
    body += bytes(32)  # _reserved
    return bytes(body)


def test_decode_market_reads_winner_and_state():
    m = decode_market(_market_bytes(stake_yes=3, stake_no=1, state=1, winner=0))
    assert isinstance(m, MarketAccount)
    assert m.fixture_id == FIXTURE_ID and m.stat_key == STAT_KEY
    assert m.stake_yes == 3 and m.stake_no == 1
    assert m.state == "Settled"
    assert m.winner == "Yes"
    assert m.predicate == TraderPredicate(2, Comparison.EQUAL_TO)


def test_decode_market_no_winner_and_open():
    m = decode_market(_market_bytes(stake_yes=0, stake_no=7, state=0, winner=1))
    assert m.state == "Open"
    assert m.winner == "No"


# ── helpers ────────────────────────────────────────────────────────────────────────
def test_to_lamports_rounds_sol():
    assert to_lamports(0.01) == 10_000_000
    assert to_lamports(1.0) == 1_000_000_000
    assert to_lamports(0.005) == 5_000_000
