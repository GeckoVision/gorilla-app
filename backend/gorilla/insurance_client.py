"""forge_insurance on-chain client — build the four instructions, first-call-correct.

The SECOND consumer of the deployed ``settlement_core`` engine. Where
:mod:`gorilla.forge_client` turns an intent into a ``forge_markets`` instruction, this turns
the parametric-insurance intents (open a cover, bind it, settle it, claim it) into the EXACT
``forge_insurance`` instruction the deployed devnet program expects: right 8-byte Anchor
discriminator, right account metas (order + signer/writable flags), right Borsh args, right
PDA derivations. The program (``program/programs/forge-insurance``) is frozen; this module
mirrors its wire format as DATA, the same duplication pattern the Rust test crate uses.

The point of this module is "one engine, two products": ``settle_policy`` threads the SAME
engine accounts (``settlement_engine`` / ``daily_scores_merkle_roots`` / ``txoracle_program``)
in the SAME order and encodes the SAME proof args as ``forge_markets`` settle — so both
products settle on the same on-chain ``resolve`` CPI. The engine-facing plumbing is imported
from :mod:`gorilla.forge_client` (single source of truth): the roots-PDA derivation, the
Borsh writer, the proof-vec encoder, and the ComputeBudget prelude are shared, not re-declared.

Nothing here signs or sends — it only *builds*. A demo funder signs + broadcasts; the loop
pre-simulates every settle (fail-closed) exactly like :mod:`gorilla.settlement`.
"""

from __future__ import annotations

import os
from typing import Any

from solders.instruction import AccountMeta, Instruction
from solders.pubkey import Pubkey

# Shared engine/oracle plumbing — imported, NEVER re-declared (single source of truth).
from .forge_client import (
    SETTLEMENT_ENGINE_PROGRAM_ID,
    SYSTEM_PROGRAM_ID,
    TXORACLE_PROGRAM_ID,
    TraderPredicate,
    UnsignedTx,
    _Borsh,
    _proof_vec,
    compute_unit_limit_ix,
    daily_scores_roots_pda,
)

# ── program identity (frozen; verified deployed + executable on devnet) ───────────
# Env-overridable to mirror forge_client's style — a mainnet build would be a pure-config
# change (the engine is a single deployment; only this consumer's id would move).
INSURANCE_PROGRAM_ID_STR = "F8kKN4syidmfRuy5atqhUuJPVQFM4DYH5xmqQ9pSQ22A"
INSURANCE_PROGRAM_ID = Pubkey.from_string(
    os.environ.get("GORILLA_INSURANCE_ID", INSURANCE_PROGRAM_ID_STR)
)
# Re-exported so a caller reads "which engine does insurance settle on" from one place; it is
# the exact same deployed engine forge_markets settles on (settle_policy pins it by address).
SETTLEMENT_ENGINE = SETTLEMENT_ENGINE_PROGRAM_ID

# ── PDA seeds (mirror forge-insurance/src/interface.rs) ───────────────────────────
POLICY_SEED = b"policy"
PVAULT_SEED = b"pvault"

# ── Anchor discriminators = sha256("global:<ix>")[..8] (verified in the test) ─────
DISCRIMINATORS: dict[str, bytes] = {
    "open_policy": bytes([30, 48, 161, 67, 189, 208, 101, 181]),
    "bind_policy": bytes([210, 238, 69, 221, 145, 190, 238, 219]),
    "settle_policy": bytes([180, 234, 21, 174, 50, 214, 91, 113]),
    "claim_policy": bytes([22, 237, 159, 131, 245, 225, 254, 16]),
}


class InsuranceError(Exception):
    """Building a forge_insurance instruction failed (bad proof shape, out-of-range value)."""


# ── PDA derivations (mirror the #[account(seeds = ...)] in each context) ───────────
def policy_pda(fixture_id: int, stat_key: int, insured: Pubkey) -> tuple[Pubkey, int]:
    """`[b"policy", fixture_id.to_le_bytes(), stat_key.to_le_bytes(), insured]` — the seed set
    every instruction re-derives (open inits it; bind/settle/claim bind it by ``policy.bump``)."""
    return Pubkey.find_program_address(
        [
            POLICY_SEED,
            fixture_id.to_bytes(8, "little", signed=True),
            stat_key.to_bytes(4, "little"),
            bytes(insured),
        ],
        INSURANCE_PROGRAM_ID,
    )


def pvault_pda(policy: Pubkey) -> tuple[Pubkey, int]:
    """`[b"pvault", policy]` — the system-owned SOL vault holding coverage + premium."""
    return Pubkey.find_program_address([PVAULT_SEED, bytes(policy)], INSURANCE_PROGRAM_ID)


# ── instruction builders (account order MUST match each #[derive(Accounts)]) ──────
def build_open_policy_ix(
    fixture_id: int,
    stat_key: int,
    period: int,
    predicate: TraderPredicate,
    coverage_lamports: int,
    insured: Pubkey,
    insurer: Pubkey,
) -> Instruction:
    """``open_policy(fixture_id, stat_key, period, predicate, coverage)``. Accounts mirror
    ``OpenPolicy<'info>`` top-to-bottom: policy(init,w), pvault(w), insured(r), insurer(w,signer),
    system_program. Arg order mirrors the handler: fixture_id, stat_key, period, predicate,
    coverage."""
    if coverage_lamports <= 0:
        raise InsuranceError("coverage must be positive")
    policy, _ = policy_pda(fixture_id, stat_key, insured)
    pvault, _ = pvault_pda(policy)
    data = (
        DISCRIMINATORS["open_policy"]
        + _Borsh()
        .i64(fixture_id)
        .u32(stat_key)
        .i32(period)
        .i32(predicate.threshold)
        .u8(int(predicate.comparison))
        .u64(coverage_lamports)
        .bytes()
    )
    metas = [
        AccountMeta(policy, is_signer=False, is_writable=True),
        AccountMeta(pvault, is_signer=False, is_writable=True),
        AccountMeta(insured, is_signer=False, is_writable=False),
        AccountMeta(insurer, is_signer=True, is_writable=True),
        AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
    ]
    return Instruction(INSURANCE_PROGRAM_ID, data, metas)


def build_bind_policy_ix(
    fixture_id: int, stat_key: int, insured: Pubkey, premium_lamports: int
) -> Instruction:
    """``bind_policy(premium)``. Accounts mirror ``BindPolicy<'info>``: policy(w), pvault(w),
    insured(w,signer), system_program. The insured is BOTH the PDA-seed key and the signer."""
    if premium_lamports <= 0:
        raise InsuranceError("premium must be positive")
    policy, _ = policy_pda(fixture_id, stat_key, insured)
    pvault, _ = pvault_pda(policy)
    data = DISCRIMINATORS["bind_policy"] + _Borsh().u64(premium_lamports).bytes()
    metas = [
        AccountMeta(policy, is_signer=False, is_writable=True),
        AccountMeta(pvault, is_signer=False, is_writable=True),
        AccountMeta(insured, is_signer=True, is_writable=True),
        AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
    ]
    return Instruction(INSURANCE_PROGRAM_ID, data, metas)


def encode_settle_policy_args(proof: dict[str, Any]) -> bytes:
    """Borsh-encode ``settle_policy`` args from a recorded txoracle proof — byte-identical in
    LAYOUT to ``forge_markets`` settle (no predicate: the program uses the policy's stored one).

    ``ts`` <- ``summary.updateStats.minTimestamp`` (the daily-root seed, NOT ``proof['ts']`` —
    the same fix the market settle carries). stat_b / op are ``None``. Arg order mirrors the
    handler: ts, fixture_summary, fixture_proof, main_tree_proof, stat_a, stat_b, op."""
    summary = proof["summary"]
    us = summary["updateStats"]
    b = _Borsh()
    b.buf += DISCRIMINATORS["settle_policy"]
    b.i64(us["minTimestamp"])  # ts — the FIX (not proof["ts"])
    # fixture_summary: ScoresBatchSummary
    b.i64(summary["fixtureId"])
    b.i32(us["updateCount"]).i64(us["minTimestamp"]).i64(us["maxTimestamp"])
    b.arr32(list(summary["eventStatsSubTreeRoot"]))
    # fixture_proof <- subTreeProof ; main_tree_proof <- mainTreeProof
    _proof_vec(b, proof["subTreeProof"])
    _proof_vec(b, proof["mainTreeProof"])
    # stat_a: StatTerm = statToProve + eventStatRoot + statProof
    stat = proof["statToProve"]
    b.u32(stat["key"]).i32(stat["value"]).i32(stat["period"])
    b.arr32(list(proof["eventStatRoot"]))
    _proof_vec(b, proof["statProof"])
    # stat_b: Option<StatTerm> = None ; op: Option<BinaryExpression> = None
    b.u8(0).u8(0)
    return b.bytes()


def build_settle_policy_ixs(
    fixture_id: int, stat_key: int, insured: Pubkey, proof: dict[str, Any]
) -> list[Instruction]:
    """[ComputeBudget prelude, settle_policy]. The settle_policy account order mirrors
    ``SettlePolicy<'info>`` top-to-bottom: policy(w), settlement_engine(r),
    daily_scores_merkle_roots(r), txoracle_program(r) — the SAME three engine accounts, in the
    SAME order, ``forge_markets`` settle threads. The ``resolve`` CPI burns ~205k CU, so the
    prelude raises the limit exactly as the market settle does."""
    policy, _ = policy_pda(fixture_id, stat_key, insured)
    roots, _, _ = daily_scores_roots_pda(proof["summary"]["updateStats"]["minTimestamp"])
    settle = Instruction(
        INSURANCE_PROGRAM_ID,
        encode_settle_policy_args(proof),
        [
            AccountMeta(policy, is_signer=False, is_writable=True),
            AccountMeta(SETTLEMENT_ENGINE_PROGRAM_ID, is_signer=False, is_writable=False),
            AccountMeta(roots, is_signer=False, is_writable=False),
            AccountMeta(TXORACLE_PROGRAM_ID, is_signer=False, is_writable=False),
        ],
    )
    return [compute_unit_limit_ix(), settle]


def build_claim_policy_ix(
    fixture_id: int, stat_key: int, insured: Pubkey, insurer: Pubkey, claimant: Pubkey
) -> Instruction:
    """``claim_policy()`` (no args). Accounts mirror ``ClaimPolicy<'info>``: policy(w),
    pvault(w), insured(w), insurer(w), claimant(signer), system_program. Funds only ever go to
    the stored insured/insurer; a party (either) triggers the pull-payment release."""
    policy, _ = policy_pda(fixture_id, stat_key, insured)
    pvault, _ = pvault_pda(policy)
    metas = [
        AccountMeta(policy, is_signer=False, is_writable=True),
        AccountMeta(pvault, is_signer=False, is_writable=True),
        AccountMeta(insured, is_signer=False, is_writable=True),
        AccountMeta(insurer, is_signer=False, is_writable=True),
        AccountMeta(claimant, is_signer=True, is_writable=False),
        AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
    ]
    return Instruction(INSURANCE_PROGRAM_ID, DISCRIMINATORS["claim_policy"], metas)


# ── UnsignedTx wrappers (carry the allow-list identity a wallet would check) ──────
def open_policy_tx(
    fixture_id: int,
    stat_key: int,
    period: int,
    predicate: TraderPredicate,
    coverage_lamports: int,
    insured: Pubkey,
    insurer: Pubkey,
) -> UnsignedTx:
    ix = build_open_policy_ix(
        fixture_id, stat_key, period, predicate, coverage_lamports, insured, insurer
    )
    return UnsignedTx((ix,), INSURANCE_PROGRAM_ID, "open_policy")


def bind_policy_tx(
    fixture_id: int, stat_key: int, insured: Pubkey, premium_lamports: int
) -> UnsignedTx:
    ix = build_bind_policy_ix(fixture_id, stat_key, insured, premium_lamports)
    return UnsignedTx((ix,), INSURANCE_PROGRAM_ID, "bind_policy")


def settle_policy_tx(
    fixture_id: int, stat_key: int, insured: Pubkey, proof: dict[str, Any]
) -> UnsignedTx:
    ixs = build_settle_policy_ixs(fixture_id, stat_key, insured, proof)
    return UnsignedTx(tuple(ixs), INSURANCE_PROGRAM_ID, "settle_policy")


def claim_policy_tx(
    fixture_id: int, stat_key: int, insured: Pubkey, insurer: Pubkey, claimant: Pubkey
) -> UnsignedTx:
    ix = build_claim_policy_ix(fixture_id, stat_key, insured, insurer, claimant)
    return UnsignedTx((ix,), INSURANCE_PROGRAM_ID, "claim_policy")


# Human names for the program's custom errors (code = 6000 + variant index), mirroring
# forge_client.SETTLEMENT_ERRORS — so a live failure reports the fail-closed reason by name.
INSURANCE_ERRORS: dict[int, str] = {
    6000: "PolicyNotOpen",
    6001: "PolicyNotFunded",
    6002: "PolicyNotSettled",
    6003: "AlreadyClaimed",
    6004: "ZeroCoverage",
    6005: "ZeroPremium",
    6006: "NotInsured",
    6007: "NotAParty",
    6008: "WrongRecipient",
    6009: "WrongEngineProgram",
    6010: "WrongOracleProgram",
    6011: "Overflow",
}
