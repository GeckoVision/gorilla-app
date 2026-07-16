//! Custom errors. Anchor 1.0 allows EXACTLY ONE `#[error_code]` enum per program.
//! Variant ORDER is the ABI (code = 6000 + index) — append at the END, never
//! reorder.

use anchor_lang::prelude::*;

#[error_code]
pub enum SettlementError {
    #[msg("Market is not Open (already settled or closed)")]
    MarketNotOpen,

    #[msg("Market is not Settled yet — cannot claim")]
    MarketNotSettled,

    #[msg("Stake amount must be greater than zero")]
    ZeroStake,

    #[msg("This position is on the losing side")]
    NotWinningSide,

    #[msg("Position payout already claimed")]
    AlreadyClaimed,

    #[msg("The winning side has zero total stake — nothing to claim")]
    NoWinningStake,

    #[msg("Supplied txoracle program account does not match the expected program id")]
    WrongOracleProgram,

    #[msg("Arithmetic overflow")]
    Overflow,

    // ── appended (fail-closed oracle-return decoding; never reorder the above) ──
    #[msg("txoracle CPI set no return data — cannot determine the outcome")]
    OracleNoReturnData,

    #[msg("txoracle CPI return data came from an unexpected program")]
    OracleReturnWrongProgram,

    #[msg("txoracle CPI return data was not a decodable bool")]
    OracleBadReturnData,
}
