#!/usr/bin/env bash
# test-rings.sh — run the two OFFLINE test rings (program + backend/frontend).
#
# Ring 1: the Mollusk program suite   — proves the on-chain instruction logic.
# Ring 2: backend pytest + frontend vitest — proves every transaction is built
#         byte-correct and every wallet refusal fires, offline, $0.
#
# Ring 3 (the live devnet e2e) is NEVER run by this script: it broadcasts real
# transactions. See docs/TESTING.md § Ring 3 to run it deliberately.
#
# Each command is echoed before it runs so the script teaches while it checks.
set -euo pipefail
cd "$(dirname "$0")/.."

run() { echo; echo "──▶ $*"; "$@"; }

echo "════════════════════════════════════════════════════════════════════"
echo " Ring 1 — program instruction logic (Mollusk, in-process, offline)"
echo "════════════════════════════════════════════════════════════════════"
pushd program >/dev/null
if [ ! -f target/deploy/forge_markets.so ] || [ ! -f target/deploy/mock_txoracle.so ]; then
  # --ignore-keys: a fresh clone has no .deploy-keys (gitignored), so anchor
  # generates a throwaway program keypair that won't match the frozen
  # declare_id. Nothing deploys here — the .so is only loaded by Mollusk.
  run anchor build --ignore-keys
  run cargo build-sbf --manifest-path programs/mock-txoracle/Cargo.toml
fi
SBF_OUT_DIR="$(pwd)/target/deploy" run cargo test -p forge-markets-tests
popd >/dev/null

echo
echo "════════════════════════════════════════════════════════════════════"
echo " Ring 2 — backend: instruction bytes, wallet policy, coverage gate"
echo "════════════════════════════════════════════════════════════════════"
pushd backend >/dev/null
run uv run pytest tests/test_forge_client.py -q
run uv run pytest tests/test_wallets.py tests/test_privy_policy.py -q
run uv run pytest tests/test_staking.py tests/test_solana_rpc_guard.py -q
popd >/dev/null

echo
echo "════════════════════════════════════════════════════════════════════"
echo " Ring 2 — frontend: pinned instruction bytes + payout math (vitest)"
echo "════════════════════════════════════════════════════════════════════"
pushd frontend >/dev/null
run pnpm vitest run tests/forge-client.test.ts tests/claim.test.ts tests/payout.test.ts
popd >/dev/null

echo
echo "All offline rings green. Ring 3 (live devnet) is documented in"
echo "docs/TESTING.md — run it only when you mean to broadcast."
