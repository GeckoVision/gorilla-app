"""forge_insurance client — built instructions are byte-exact, offline and $0.

Every assertion is falsifiable with zero network: the discriminators
(``sha256("global:<ix>")[..8]``), the account metas (order + signer/writable flags mirroring
each ``#[derive(Accounts)]`` context), the Borsh args, and the settle_policy proof-arg mapping
(the ts<-minTimestamp fix, the SHARED engine accounts in the same order forge_markets uses).
The live devnet leg (scripts/live_insurance_demo.py) is the final smoke, not the debugger.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from solders.pubkey import Pubkey

from gorilla.forge_client import (
    COMPUTE_BUDGET_ID,
    SETTLEMENT_ENGINE_PROGRAM_ID,
    SYSTEM_PROGRAM_ID,
    TXORACLE_PROGRAM_ID,
    Comparison,
    TraderPredicate,
    daily_scores_roots_pda,
    load_recorded_proof,
)
from gorilla.insurance_client import (
    DISCRIMINATORS,
    INSURANCE_PROGRAM_ID,
    build_bind_policy_ix,
    build_claim_policy_ix,
    build_open_policy_ix,
    build_settle_policy_ixs,
    encode_settle_policy_args,
    policy_pda,
    pvault_pda,
)

PROOF_PATH = (
    Path(__file__).resolve().parent.parent / "scripts" / "fixtures" / "recorded_stat_proof.json"
)
PROOF = load_recorded_proof(PROOF_PATH)

FIXTURE_ID = 18179549
STAT_KEY = 1
PERIOD = 4  # mirrors the recorded proof's statToProve.period (bound at settle — F1)
INSURED = Pubkey.from_string("3gtfwhBtFKB4k9M7vjcZ9qCAW6HwP4Y2WLJiJbimBbrj")
INSURER = Pubkey.from_string("6AiyHQnCD4pFg8Pc5vJH1J9uNKJiskCRQLGdaaErsbz2")


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

    def u64(self) -> int:
        return int.from_bytes(self.take(8), "little")

    def arr32(self) -> list[int]:
        return list(self.take(32))

    def proof_vec(self) -> list[tuple[list[int], int]]:
        return [(self.arr32(), self.u8()) for _ in range(self.u32())]


# ── discriminators ────────────────────────────────────────────────────────────────
def test_discriminators_are_anchor_sha256():
    for name, disc in DISCRIMINATORS.items():
        assert disc == hashlib.sha256(f"global:{name}".encode()).digest()[:8]
        assert len(disc) == 8


# ── PDA derivations (mirror the frozen seeds in interface.rs) ──────────────────────
def test_policy_and_pvault_pdas_are_deterministic_and_seeded():
    policy, bump = policy_pda(FIXTURE_ID, STAT_KEY, INSURED)
    policy2, _ = policy_pda(FIXTURE_ID, STAT_KEY, INSURED)
    assert policy == policy2
    assert 0 <= bump <= 255
    # the insured is part of the seed: a different insured yields a different policy
    other, _ = policy_pda(FIXTURE_ID, STAT_KEY, INSURER)
    assert other != policy
    pvault, _ = pvault_pda(policy)
    assert pvault != policy


# ── open_policy ────────────────────────────────────────────────────────────────────
def test_open_policy_ix_accounts_and_data():
    pred = TraderPredicate(threshold=1, comparison=Comparison.GREATER_THAN)
    ix = build_open_policy_ix(FIXTURE_ID, STAT_KEY, PERIOD, pred, 20_000_000, INSURED, INSURER)
    assert ix.program_id == INSURANCE_PROGRAM_ID
    policy, _ = policy_pda(FIXTURE_ID, STAT_KEY, INSURED)
    pvault, _ = pvault_pda(policy)
    metas = ix.accounts
    # OpenPolicy<'info> top-to-bottom: policy, pvault, insured, insurer, system_program.
    assert [m.pubkey for m in metas] == [policy, pvault, INSURED, INSURER, SYSTEM_PROGRAM_ID]
    # policy(init→w,ns), pvault(w,ns), insured(r,ns), insurer(w,signer), system(r,ns).
    assert [(m.is_signer, m.is_writable) for m in metas] == [
        (False, True),
        (False, True),
        (False, False),
        (True, True),
        (False, False),
    ]
    r = _Reader(ix.data)
    assert r.take(8) == DISCRIMINATORS["open_policy"]
    assert r.i64() == FIXTURE_ID
    assert r.u32() == STAT_KEY
    assert r.i32() == PERIOD
    assert r.i32() == 1  # predicate.threshold
    assert r.u8() == int(Comparison.GREATER_THAN)
    assert r.u64() == 20_000_000  # coverage
    assert r.o == len(ix.data)


# ── bind_policy ──────────────────────────────────────────────────────────────────
def test_bind_policy_ix_accounts_and_data():
    ix = build_bind_policy_ix(FIXTURE_ID, STAT_KEY, INSURED, 5_000_000)
    policy, _ = policy_pda(FIXTURE_ID, STAT_KEY, INSURED)
    pvault, _ = pvault_pda(policy)
    metas = ix.accounts
    # BindPolicy<'info>: policy, pvault, insured(signer), system_program.
    assert [m.pubkey for m in metas] == [policy, pvault, INSURED, SYSTEM_PROGRAM_ID]
    assert [(m.is_signer, m.is_writable) for m in metas] == [
        (False, True),
        (False, True),
        (True, True),
        (False, False),
    ]
    r = _Reader(ix.data)
    assert r.take(8) == DISCRIMINATORS["bind_policy"]
    assert r.u64() == 5_000_000  # premium
    assert r.o == len(ix.data)


# ── settle_policy (SAME engine accounts + proof-arg layout as forge_markets) ───────
def test_settle_policy_ixs_have_compute_budget_prelude_then_settle():
    ixs = build_settle_policy_ixs(FIXTURE_ID, STAT_KEY, INSURED, PROOF)
    assert len(ixs) == 2
    cu, settle = ixs
    assert cu.program_id == COMPUTE_BUDGET_ID
    assert cu.data[0] == 2  # SetComputeUnitLimit
    assert int.from_bytes(cu.data[1:5], "little") >= 350_000
    assert settle.program_id == INSURANCE_PROGRAM_ID


def test_settle_policy_account_order_and_flags_match_the_engine_seam():
    _cu, settle = build_settle_policy_ixs(FIXTURE_ID, STAT_KEY, INSURED, PROOF)
    policy, _ = policy_pda(FIXTURE_ID, STAT_KEY, INSURED)
    root, _, _ = daily_scores_roots_pda(PROOF["summary"]["updateStats"]["minTimestamp"])
    metas = settle.accounts
    # SettlePolicy<'info> top-to-bottom — the SAME three engine accounts, same order, as
    # forge_markets settle threads (policy stands in for market):
    #   policy → settlement_engine → daily_scores_merkle_roots → txoracle_program.
    assert [m.pubkey for m in metas] == [
        policy,
        SETTLEMENT_ENGINE_PROGRAM_ID,
        root,
        TXORACLE_PROGRAM_ID,
    ]
    assert [(m.is_signer, m.is_writable) for m in metas] == [
        (False, True),
        (False, False),
        (False, False),
        (False, False),
    ]


def test_settle_policy_args_map_from_recorded_proof_with_ts_fix():
    summary = PROOF["summary"]
    us = summary["updateStats"]
    r = _Reader(encode_settle_policy_args(PROOF))

    assert r.take(8) == DISCRIMINATORS["settle_policy"]
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
    # stat_a comes DIRECTLY after main_tree_proof — no predicate (the policy stores its own).
    stat = PROOF["statToProve"]
    assert r.u32() == stat["key"]
    assert r.i32() == stat["value"]
    assert r.i32() == stat["period"]
    assert r.arr32() == list(PROOF["eventStatRoot"])
    stat_proof = r.proof_vec()
    assert len(stat_proof) == len(PROOF["statProof"])
    # stat_b: Option = None ; op: Option = None
    assert r.u8() == 0
    assert r.u8() == 0
    assert r.o == len(r.d)  # consumed exactly — no trailing fields


# ── claim_policy ─────────────────────────────────────────────────────────────────
def test_claim_policy_ix_accounts_and_data():
    ix = build_claim_policy_ix(FIXTURE_ID, STAT_KEY, INSURED, INSURER, INSURED)
    policy, _ = policy_pda(FIXTURE_ID, STAT_KEY, INSURED)
    pvault, _ = pvault_pda(policy)
    metas = ix.accounts
    # ClaimPolicy<'info>: policy, pvault, insured, insurer, claimant(signer), system_program.
    assert [m.pubkey for m in metas] == [
        policy,
        pvault,
        INSURED,
        INSURER,
        INSURED,  # claimant == insured here (a party triggers the release)
        SYSTEM_PROGRAM_ID,
    ]
    assert [(m.is_signer, m.is_writable) for m in metas] == [
        (False, True),
        (False, True),
        (False, True),
        (False, True),
        (True, False),  # claimant signs but is not writable
        (False, False),
    ]
    # no args — just the discriminator
    assert bytes(ix.data) == DISCRIMINATORS["claim_policy"]
