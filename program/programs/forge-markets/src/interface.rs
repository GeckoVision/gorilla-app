//! Frozen PDA seeds + schema constants for `forge-markets`.
//!
//! Duplicated (not imported) into the off-chain Python client + the Mollusk test
//! crate — the coupling is DATA, not code. Changing any seed / layout is a
//! coordinated schema bump.

/// `Market` PDA — one per (fixture_id, stat_key). Seeds:
/// `[b"market", fixture_id.to_le_bytes(), stat_key.to_le_bytes()]`.
pub const MARKET_SEED: &[u8] = b"market";

/// SOL vault PDA — one per market, system-owned, holds the pot. Seeds:
/// `[b"vault", market.key()]`.
pub const VAULT_SEED: &[u8] = b"vault";

/// `Position` PDA — one per (market, staker). Seeds:
/// `[b"position", market.key(), staker.key()]`.
pub const POSITION_SEED: &[u8] = b"position";

/// Schema version (`forge:v1`).
pub const SCHEMA_VERSION: u8 = 1;
