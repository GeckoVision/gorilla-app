//! txoracle CPI — the trustless seam.
//!
//! `forge-markets` NEVER decides a market's outcome. It hands the caller-
//! supplied 3-stage Merkle proof + the market's predicate to TxODDS's on-chain
//! `txoracle::validate_stat`, and trusts the Result: a successful CPI means the
//! oracle proved the stat against its own on-chain root AND the predicate holds.
//!
//! ── Why these types are MIRRORED, not imported ───────────────────────────────
//! txoracle is a foreign program (devnet `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`).
//! We do not depend on its crate; we mirror EXACTLY the argument types the IDL
//! declares for `validate_stat`, so the CPI's instruction data is byte-for-byte
//! the wire format txoracle expects. The coupling is the DATA (the IDL), not code
//! (same pattern as the receipt/firewall frozen-interface duplication).
//!
//! Source of truth: `tx-on-chain/examples/devnet/idl/txoracle.json`, instruction
//! `validate_stat`, discriminator `[107,197,232,90,191,136,105,185]`
//! (== the Anchor default `sha256("global:validate_stat")[..8]`, since txoracle is
//! an Anchor program — verified against the IDL).

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::{get_return_data, invoke};

use crate::errors::SettlementError;

/// TxODDS `txoracle` program id — the CPI target the `settle` context pins by address.
///
/// Devnet by default; the `mainnet-oracle` feature flips it to the TxODDS mainnet
/// deployment (`9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`, verified live +
/// actively publishing daily roots — same `validate_stat` interface, confirmed by a
/// Surfpool mainnet-fork profile that CPIs it and returns `Ok(true)`). A mainnet deploy
/// MUST build with this feature, else `settle` rejects the mainnet oracle with
/// `WrongOracleProgram`. The two ids are the ONLY cluster-specific bytes in the program.
#[cfg(not(feature = "mainnet-oracle"))]
pub const TXORACLE_PROGRAM_ID: Pubkey = pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
#[cfg(feature = "mainnet-oracle")]
pub const TXORACLE_PROGRAM_ID: Pubkey = pubkey!("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");

/// Anchor discriminator for `txoracle::validate_stat` (from the IDL, verbatim).
pub const VALIDATE_STAT_DISCRIMINATOR: [u8; 8] = [107, 197, 232, 90, 191, 136, 105, 185];

// ── Mirrored IDL types (validate_stat argument tree) ─────────────────────────
// Every derive is `AnchorSerialize`/`AnchorDeserialize` (== Borsh) so the on-wire
// bytes match txoracle's Anchor deserialization exactly. Enums serialize as a
// single u8 variant index (Borsh), matching the IDL enum encoding.

/// IDL `ScoresUpdateStats`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

/// IDL `ScoresBatchSummary`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}

/// IDL `ProofNode` — one hop in a Merkle proof.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

/// IDL `Comparison`. Borsh variant index: GreaterThan=0, LessThan=1, EqualTo=2.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

/// IDL `TraderPredicate`. Stored on the `Market` (hence `InitSpace`/`Copy`).
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Debug, PartialEq, Eq)]
pub struct TraderPredicate {
    pub threshold: i32,
    pub comparison: Comparison,
}

/// IDL `ScoreStat`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct ScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

/// IDL `StatTerm` — a stat + its proof against the event sub-tree root.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct StatTerm {
    pub stat_to_prove: ScoreStat,
    pub event_stat_root: [u8; 32],
    pub stat_proof: Vec<ProofNode>,
}

/// IDL `BinaryExpression`. Borsh variant index: Add=0, Subtract=1.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinaryExpression {
    Add,
    Subtract,
}

/// The full argument set of `validate_stat`, in IDL order. `predicate` is the
/// market's own stored predicate (the program does not let the caller override
/// the condition being proven).
#[allow(clippy::too_many_arguments)]
pub fn validate_stat_ix_data(
    ts: i64,
    fixture_summary: &ScoresBatchSummary,
    fixture_proof: &[ProofNode],
    main_tree_proof: &[ProofNode],
    predicate: &TraderPredicate,
    stat_a: &StatTerm,
    stat_b: &Option<StatTerm>,
    op: &Option<BinaryExpression>,
) -> Result<Vec<u8>> {
    let mut data = Vec::with_capacity(256);
    data.extend_from_slice(&VALIDATE_STAT_DISCRIMINATOR);
    ts.serialize(&mut data)?;
    fixture_summary.serialize(&mut data)?;
    fixture_proof.to_vec().serialize(&mut data)?;
    main_tree_proof.to_vec().serialize(&mut data)?;
    predicate.serialize(&mut data)?;
    stat_a.serialize(&mut data)?;
    stat_b.serialize(&mut data)?;
    op.serialize(&mut data)?;
    Ok(data)
}

/// CPI into `txoracle::validate_stat` and return the predicate outcome the oracle
/// certifies.
///
/// `validate_stat` returns `Ok(bool)`, NOT `Ok`/`Err`, for a well-formed proof:
///   - proof valid + predicate held      → `Ok(true)`  → this fn returns `Ok(true)`  (YES)
///   - proof valid + predicate NOT held   → `Ok(false)` → this fn returns `Ok(false)` (NO)
///   - proof invalid / tampered           → the CPI `invoke` itself returns `Err`,
///     which propagates and MUST abort the enclosing `settle` (that revert is the
///     whole trust claim). We never inspect the proof; the revert is the guarantee.
///
/// The returned bool travels as Solana return data: Anchor serializes the oracle's
/// `bool` as a single byte (`0x00`/`0x01`). We read it with `get_return_data`,
/// pin the returning program to `TXORACLE_PROGRAM_ID`, and Borsh-decode the bool.
/// Any deviation (no return data / wrong program / undecodable) FAILS CLOSED with an
/// `Err` — we never silently assume an outcome, least of all YES.
///
/// `daily_scores_merkle_roots` is the txoracle-owned account holding the on-chain
/// roots; `txoracle_program` is the executable program account. Both are passed
/// through by the caller — this program hardcodes only the program id it will
/// accept (checked in the `settle` context), never the root itself.
#[allow(clippy::too_many_arguments)]
pub fn cpi_validate_stat<'info>(
    txoracle_program: &AccountInfo<'info>,
    daily_scores_merkle_roots: &AccountInfo<'info>,
    ts: i64,
    fixture_summary: &ScoresBatchSummary,
    fixture_proof: &[ProofNode],
    main_tree_proof: &[ProofNode],
    predicate: &TraderPredicate,
    stat_a: &StatTerm,
    stat_b: &Option<StatTerm>,
    op: &Option<BinaryExpression>,
) -> Result<bool> {
    let data = validate_stat_ix_data(
        ts,
        fixture_summary,
        fixture_proof,
        main_tree_proof,
        predicate,
        stat_a,
        stat_b,
        op,
    )?;

    let ix = Instruction {
        program_id: TXORACLE_PROGRAM_ID,
        accounts: vec![AccountMeta::new_readonly(
            *daily_scores_merkle_roots.key,
            false,
        )],
        data,
    };

    // A tampered proof makes THIS invoke return Err → propagates → settle reverts.
    invoke(
        &ix,
        &[daily_scores_merkle_roots.clone(), txoracle_program.clone()],
    )?;

    // Well-formed proof: the oracle certified an outcome via return data. Decode it
    // fail-closed — no return data / wrong program / bad bytes are all hard errors.
    let (returning_program, return_data) =
        get_return_data().ok_or(SettlementError::OracleNoReturnData)?;
    require_keys_eq!(
        returning_program,
        TXORACLE_PROGRAM_ID,
        SettlementError::OracleReturnWrongProgram
    );
    let predicate_held =
        bool::try_from_slice(&return_data).map_err(|_| SettlementError::OracleBadReturnData)?;
    Ok(predicate_held)
}
