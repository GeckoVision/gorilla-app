//! mock-txoracle — a TEST DOUBLE for TxODDS `txoracle::validate_stat`.
//!
//! ── What this is, and what it is NOT ─────────────────────────────────────────
//! It is a Mollusk-only stand-in loaded AT the real txoracle program id
//! (`6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`) so the settlement suite can
//! prove the `settle → validate_stat` CPI wiring WITHOUT reconstructing txoracle's
//! exact Merkle hashing (its leaf/node hash scheme is not in the IDL and is out of
//! reach for Phase A). It is NEVER deployed.
//!
//! ── Why a double is faithful for the two things that matter ──────────────────
//!   1. BYTE-EXACT SERIALIZATION. Because this program `validate_stat` has the
//!      EXACT IDL argument signature and is itself an Anchor program, Anchor here
//!      re-derives the SAME 8-byte discriminator (`sha256("global:validate_stat")`)
//!      and Borsh-DESERIALIZES the full argument tree the settlement program
//!      serialized. If forge-markets' wire bytes were off by a single byte,
//!      this deserialization would fail and the happy-path test would fail. So the
//!      double is a real check on the CPI encoding, not a bypass.
//!   2. TRUST WIRING + Ok(bool) OUTCOME. The mock models "proof root matches the
//!      on-chain root" by comparing `fixture_summary.events_sub_tree_root` (the
//!      root the settler submits) to the 32 bytes the seeded
//!      `daily_scores_merkle_roots` account holds. Mismatch (a tampered proof) →
//!      `Err` → the CPI fails → `settle` reverts. Match → the proof is "valid",
//!      so — mirroring the REAL oracle's `Ok(bool)` contract — the mock EVALUATES
//!      the market predicate over the submitted stat value and returns
//!      `Ok(true)` (predicate held → YES) or `Ok(false)` (did not → NO), NOT an
//!      `Err`. Anchor serializes that returned bool as a single return-data byte,
//!      which `settle` reads via `get_return_data` to set the winner. A test drives
//!      the outcome by choosing the stat value relative to the predicate threshold.
//!
//! ── What it does NOT prove (flagged) ─────────────────────────────────────────
//! The real txoracle Merkle math (the double checks root EQUALITY, not the real
//! leaf/node hashing) and the real multi-term predicate algebra (`stat_b`/`op` are
//! ignored — only the single-term `stat_a` comparison is modelled). Verifying those
//! is a devnet probe tx against the live program with a real proof fixture
//! (founder-gated) — see the plan's "risks / unknowns".

#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

declare_id!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

// ── Mirrored IDL argument types (must match txoracle_cpi.rs byte-for-byte) ──────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct TraderPredicate {
    pub threshold: i32,
    pub comparison: Comparison,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StatTerm {
    pub stat_to_prove: ScoreStat,
    pub event_stat_root: [u8; 32],
    pub stat_proof: Vec<ProofNode>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum BinaryExpression {
    Add,
    Subtract,
}

#[error_code]
pub enum MockOracleError {
    #[msg("Proof root does not match the on-chain daily_scores_merkle_roots")]
    RootMismatch,
    #[msg("daily_scores_merkle_roots account is too small to hold a 32-byte root")]
    RootAccountTooSmall,
}

#[program]
pub mod mock_txoracle {
    use super::*;

    /// Same signature, (Anchor-derived) discriminator, AND `Ok(bool)` return
    /// contract as the real `txoracle::validate_stat`.
    ///
    /// - Submitted sub-tree root ≠ seeded on-chain root (a tampered proof) → `Err`
    ///   (the CPI fails → `settle` reverts). This is the trust headline.
    /// - Root matches (proof "valid") → evaluate the market predicate over the
    ///   submitted stat value and return `Ok(true)` (held → YES) or `Ok(false)`
    ///   (not held → NO). Returning `Ok(false)` — NOT `Err` — is the whole point:
    ///   a false predicate is a legitimate settled outcome, not a revert. Anchor
    ///   serializes the returned bool as one return-data byte (`0x00`/`0x01`).
    #[allow(clippy::too_many_arguments)]
    pub fn validate_stat(
        ctx: Context<ValidateStat>,
        _ts: i64,
        fixture_summary: ScoresBatchSummary,
        _fixture_proof: Vec<ProofNode>,
        _main_tree_proof: Vec<ProofNode>,
        predicate: TraderPredicate,
        stat_a: StatTerm,
        _stat_b: Option<StatTerm>,
        _op: Option<BinaryExpression>,
    ) -> Result<bool> {
        let data = ctx.accounts.daily_scores_merkle_roots.try_borrow_data()?;
        require!(data.len() >= 32, MockOracleError::RootAccountTooSmall);

        // The on-chain "true" root the test seeds at bytes[0..32].
        let mut onchain_root = [0u8; 32];
        onchain_root.copy_from_slice(&data[0..32]);

        // A tampered proof flips a byte in the submitted sub-tree root → mismatch
        // → Err → the CPI (and `settle`) reverts. The program never decides.
        require!(
            onchain_root == fixture_summary.events_sub_tree_root,
            MockOracleError::RootMismatch
        );

        // Proof is "valid" in the double's model → evaluate the predicate over the
        // submitted stat value (the single-term model; stat_b/op are ignored).
        // `Ok(true)` = predicate held (YES); `Ok(false)` = did not (NO).
        let value = stat_a.stat_to_prove.value;
        let held = match predicate.comparison {
            Comparison::GreaterThan => value > predicate.threshold,
            Comparison::LessThan => value < predicate.threshold,
            Comparison::EqualTo => value == predicate.threshold,
        };
        Ok(held)
    }
}

#[derive(Accounts)]
pub struct ValidateStat<'info> {
    /// CHECK: raw root store; the mock reads its first 32 bytes.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,
}
