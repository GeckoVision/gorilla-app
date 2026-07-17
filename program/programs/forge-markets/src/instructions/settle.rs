//! `settle(ts, fixture_summary, fixture_proof, main_tree_proof, stat_a, stat_b?, op?)`
//! — the trustless heart of the program.
//!
//! It CPIs `txoracle::validate_stat` with the market's OWN predicate and the
//! caller-supplied 3-stage Merkle proof. The oracle proves the stat against its
//! on-chain root, evaluates the predicate, and returns `Ok(bool)` — the outcome:
//!   - CPI `Ok(true)`  ⇒ the predicate held        ⇒ `winner = Yes`, `state = Settled`.
//!   - CPI `Ok(false)` ⇒ the predicate did NOT hold ⇒ `winner = No`,  `state = Settled`.
//!   - CPI `Err`       ⇒ the proof was invalid (tampered) ⇒ the error PROPAGATES and
//!     the whole `settle` reverts, market stays `Open`. **The program never inspects
//!     the proof or evaluates the predicate itself — the oracle's Ok/Err (revert) and
//!     the returned bool ARE the trust guarantee.**
//!
//! Both YES and NO are captured in this single `settle`: a false predicate is a
//! legitimate `Ok(false)` outcome (read from the CPI's return data), NOT a revert,
//! so no separate `settle_no` / complementary-predicate proof is needed. Only a
//! tampered proof reverts.

use anchor_lang::prelude::*;

use crate::errors::SettlementError;
use crate::interface::MARKET_SEED;
use crate::state::{Market, MarketState, Side};
use crate::txoracle_cpi::{
    cpi_validate_stat, BinaryExpression, ProofNode, ScoresBatchSummary, StatTerm,
    TXORACLE_PROGRAM_ID,
};

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        mut,
        seeds = [
            MARKET_SEED,
            &market.fixture_id.to_le_bytes(),
            &market.stat_key.to_le_bytes(),
        ],
        bump = market.bump,
        constraint = market.state == MarketState::Open @ SettlementError::MarketNotOpen,
    )]
    pub market: Account<'info, Market>,

    /// CHECK: The txoracle-owned account holding the daily Merkle roots. It is
    /// passed straight through to `validate_stat`; this program never interprets
    /// its bytes (that is the oracle's job), so it is an unchecked passthrough.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,

    /// CHECK: The txoracle program. Pinned by address to the known program id so a
    /// caller cannot redirect the CPI to a look-alike program.
    #[account(address = TXORACLE_PROGRAM_ID @ SettlementError::WrongOracleProgram)]
    pub txoracle_program: UncheckedAccount<'info>,
}

#[allow(clippy::too_many_arguments)]
pub fn settle_handler(
    ctx: Context<Settle>,
    ts: i64,
    fixture_summary: ScoresBatchSummary,
    fixture_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
    stat_a: StatTerm,
    stat_b: Option<StatTerm>,
    op: Option<BinaryExpression>,
) -> Result<()> {
    // ── F1: bind the caller-supplied oracle args to THIS market BEFORE the CPI ──
    // `settle` is permissionless. `validate_stat` only proves "this stat is genuine
    // in a genuine fixture" — it has NO concept of the market. So without these
    // checks an attacker submits a genuine proof for a DIFFERENT TxODDS data point
    // whose value yields their preferred outcome and drains the pot. Pin the proof
    // to the market's fixture, stat, single-stat shape, and period.
    require!(
        fixture_summary.fixture_id == ctx.accounts.market.fixture_id,
        SettlementError::FixtureMismatch
    );
    require!(
        stat_a.stat_to_prove.key == ctx.accounts.market.stat_key,
        SettlementError::StatMismatch
    );
    // The market predicate is single-stat; a two-stat Add/Subtract could move the
    // evaluated value off the bound stat_key, so no stat_b / op is permitted.
    require!(
        stat_b.is_none() && op.is_none(),
        SettlementError::MultiStatNotAllowed
    );
    // Period binds the proof to the market's phase (e.g. full-time, not half-time):
    // the same fixture+stat has different values per period, which would flip the
    // outcome if left unbound.
    require!(
        stat_a.stat_to_prove.period == ctx.accounts.market.period,
        SettlementError::PeriodMismatch
    );

    let predicate = ctx.accounts.market.predicate;

    // Trustless outcome: the oracle CPI decides. A tampered proof makes the CPI
    // return Err, which aborts settle (the revert IS the guarantee). A well-formed
    // proof returns Ok(bool): true = predicate held (YES), false = did not (NO).
    let predicate_held = cpi_validate_stat(
        &ctx.accounts.txoracle_program.to_account_info(),
        &ctx.accounts.daily_scores_merkle_roots.to_account_info(),
        ts,
        &fixture_summary,
        &fixture_proof,
        &main_tree_proof,
        &predicate,
        &stat_a,
        &stat_b,
        &op,
    )?;

    // Record the outcome the oracle certified — YES or NO. Both are Settled.
    let winner = if predicate_held { Side::Yes } else { Side::No };
    let market = &mut ctx.accounts.market;
    market.winner = winner;
    market.state = MarketState::Settled;

    emit!(MarketSettled {
        market: market.key(),
        winner,
        ts,
    });
    Ok(())
}

#[event]
pub struct MarketSettled {
    pub market: Pubkey,
    pub winner: Side,
    pub ts: i64,
}
