"""Settle ONE parametric-insurance policy end-to-end through the DEPLOYED engine.

The "one engine, two products" proof, LIVE on devnet: the SAME settlement-core engine that
settles the match-bet markets also decides an insurance payout. For a harvested TxLINE proof
(a real settled World Cup fixture) run the full policy loop against the live programs:

    open_policy   — the insurer (deploy authority) posts coverage into the policy vault
    bind_policy   — the insured (a throwaway funded keypair) pays the premium → Funded
    settle_policy — CPI the SAME engine with the proof; predicate holds → event_occurred = true
    claim_policy  — the insured withdraws the coverage indemnity

The predicate/period come from the proof (via forge_client.winning_predicate / proof_period),
so the engine's F1 binding passes by construction and the event occurs → the insured is paid.
Every send is PRE-SIMULATED (fail-closed): a doomed tx never broadcasts. Some proofs overflow
inside the engine decode (the market run saw ~half reject); this tries the next proof until one
settles cleanly, and reports which fixture worked.

    cd backend && PYTHONPATH=. .venv/bin/python scripts/live_insurance_demo.py

DEVNET ONLY. Faucet SOL. The funder/insurer is the deploy authority.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

from solders.hash import Hash
from solders.instruction import Instruction
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.transaction import Transaction

from gorilla.forge_client import proof_period, to_lamports, winning_predicate
from gorilla.insurance_client import (
    INSURANCE_ERRORS,
    bind_policy_tx,
    claim_policy_tx,
    open_policy_tx,
    policy_pda,
    settle_policy_tx,
)
from gorilla.solana_rpc import RpcError, SolanaRpc
from gorilla.wallets import fund_if_low, load_keypair, load_or_create_keypair

_HERE = Path(__file__).resolve().parent
FUNDER_KEY = _HERE.parent.parent / "program" / ".deploy-keys" / "deploy-authority.json"
KEYS_DIR = _HERE / "keys"
HARVEST = Path(
    "/home/nan/PycharmProjects/Gecko/sharp-detector/data/txodds-history/proofs/harvest.jsonl"
)
ENGINE_SETTLEMENTS = _HERE / "live-engine-settlements.json"
OUT = _HERE / "live-insurance-settlement.json"

COVERAGE_SOL = 0.02
PREMIUM_SOL = 0.005


class InsuranceDemoError(Exception):
    """The live insurance loop could not complete for a given proof (settle would revert)."""


def _explorer(sig: str) -> str:
    return f"https://explorer.solana.com/tx/{sig}?cluster=devnet"


def _name_err(err: object) -> str:
    """Name a forge_insurance custom error (6000+idx); else JSON-dump the raw error."""
    if isinstance(err, dict):
        ie = err.get("InstructionError")
        if isinstance(ie, list) and len(ie) == 2 and isinstance(ie[1], dict):
            code = ie[1].get("Custom")
            if isinstance(code, int):
                return (
                    f"instruction {ie[0]}: {INSURANCE_ERRORS.get(code, f'custom {code}')} ({code})"
                )
    return json.dumps(err)


def _simulate(rpc: SolanaRpc, payer: Pubkey, ixs: list[Instruction]) -> dict[str, Any]:
    """Simulate UNSIGNED (sigVerify off, blockhash replaced) — no key, no spend. Fail-closed."""
    msg = Message.new_with_blockhash(ixs, payer, Hash.default())
    tx = Transaction.new_unsigned(msg)
    return rpc.simulate(base64.b64encode(bytes(tx)).decode())


def _send(rpc: SolanaRpc, payer: Keypair, ixs: list[Instruction], label: str) -> str:
    """Pre-simulate (fail-closed), then sign + send + confirm. ``payer`` is fee payer + signer
    (every insurance ix needs at most this one signature)."""
    sim = _simulate(rpc, payer.pubkey(), ixs)
    if sim.get("err") is not None:
        raise InsuranceDemoError(
            f"{label} would revert (fail-closed, funds safe): {_name_err(sim['err'])} · "
            f"logs={sim.get('logs')}"
        )
    tx = Transaction.new_signed_with_payer(
        ixs, payer.pubkey(), [payer], Hash.from_string(rpc.latest_blockhash())
    )
    sig = rpc.send(base64.b64encode(bytes(tx)).decode())
    rpc.confirm(sig)
    return sig


def _settled_fixtures_first(proofs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Order harvest records so fixtures the market run ALREADY settled through the engine come
    first — those proofs are known to decode cleanly, so the first insurance attempt lands."""
    known: set[tuple[int, int]] = set()
    if ENGINE_SETTLEMENTS.exists():
        for m in json.loads(ENGINE_SETTLEMENTS.read_text()):
            known.add((int(m["fixtureId"]), int(m["statKey"])))
    return sorted(proofs, key=lambda r: (int(r["fixtureId"]), int(r["statKey"])) not in known)


def main() -> int:
    rpc = SolanaRpc()
    funder_kp = load_keypair(str(FUNDER_KEY))  # insurer + fee payer (deploy authority)
    insured_kp = load_or_create_keypair(KEYS_DIR / "live-insured.json")  # the insured party
    print(
        f"insurer (authority): {funder_kp.pubkey()}  {rpc.get_balance(str(funder_kp.pubkey())) / 1e9:.3f} SOL"
    )
    print(f"insured (throwaway): {insured_kp.pubkey()}\n")

    coverage = to_lamports(COVERAGE_SOL)
    premium = to_lamports(PREMIUM_SOL)
    # the insured needs the premium + a fee buffer (bind + claim signatures).
    fund_if_low(rpc, funder_kp, insured_kp.pubkey(), PREMIUM_SOL + 0.02)

    proofs = [json.loads(line) for line in open(HARVEST)]
    result: dict[str, Any] | None = None
    for rec in _settled_fixtures_first(proofs):
        fixture_id, stat_key, proof = rec["fixtureId"], rec["statKey"], rec["proof"]
        predicate = winning_predicate(proof)  # HOLDS for this proof → event occurs → insured paid
        period = proof_period(proof)
        policy, _ = policy_pda(fixture_id, stat_key, insured_kp.pubkey())
        if rpc.get_account_data(str(policy)) is not None:
            continue  # a policy for this (fixture, stat, insured) already exists — skip

        print(
            f"── fixture {fixture_id} · stat {stat_key} · value {proof['statToProve']['value']} ──"
        )
        print(f"   policy {policy}  (event: stat > {predicate.threshold})")
        try:
            open_ix = open_policy_tx(
                fixture_id,
                stat_key,
                period,
                predicate,
                coverage,
                insured_kp.pubkey(),
                funder_kp.pubkey(),
            ).instructions
            open_sig = _send(rpc, funder_kp, list(open_ix), "open_policy")
            print(f"   1 · open_policy   insurer posts {COVERAGE_SOL:g} SOL  {_explorer(open_sig)}")

            bind_ix = bind_policy_tx(
                fixture_id, stat_key, insured_kp.pubkey(), premium
            ).instructions
            bind_sig = _send(rpc, insured_kp, list(bind_ix), "bind_policy")
            print(
                f"   2 · bind_policy   insured pays {PREMIUM_SOL:g} SOL premium  {_explorer(bind_sig)}"
            )

            settle_ix = settle_policy_tx(
                fixture_id, stat_key, insured_kp.pubkey(), proof
            ).instructions
            settle_sig = _send(rpc, funder_kp, list(settle_ix), "settle_policy")
            print(f"   3 · settle_policy CPI the engine (F1-bound)  {_explorer(settle_sig)}")

            claim_ix = claim_policy_tx(
                fixture_id, stat_key, insured_kp.pubkey(), funder_kp.pubkey(), insured_kp.pubkey()
            ).instructions
            claim_sig = _send(rpc, insured_kp, list(claim_ix), "claim_policy")
            print(
                f"   4 · claim_policy  insured withdraws {COVERAGE_SOL:g} SOL indemnity  {_explorer(claim_sig)}\n"
            )
        except (InsuranceDemoError, RpcError) as e:
            print(f"   rejected (fail-closed): {str(e)[:160]}\n")
            continue

        result = {
            "fixtureId": fixture_id,
            "statKey": stat_key,
            "policy": str(policy),
            "insured": str(insured_kp.pubkey()),
            "insurer": str(funder_kp.pubkey()),
            "coverageSol": COVERAGE_SOL,
            "premiumSol": PREMIUM_SOL,
            "links": {
                "open_policy": _explorer(open_sig),
                "bind_policy": _explorer(bind_sig),
                "settle_policy": _explorer(settle_sig),
                "claim_policy": _explorer(claim_sig),
            },
        }
        break

    if result is None:
        print("no proof settled cleanly — nothing written")
        return 1

    OUT.write_text(json.dumps(result, indent=1))
    print(
        f"=== ONE policy settled end-to-end through the engine (fixture {result['fixtureId']}) ==="
    )
    print(f"summary written: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
