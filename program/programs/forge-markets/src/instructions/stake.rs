//! `stake(side, amount)` — back YES or NO with SOL. Transfers `amount` lamports
//! into the market vault and records a `Position` for pro-rata claim.
//!
//! v1: one stake per staker per market (`init`, not the banned `init_if_needed`).

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::errors::SettlementError;
use crate::interface::{POSITION_SEED, VAULT_SEED};
use crate::state::{Market, MarketState, Position, Side};

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        mut,
        seeds = [
            crate::interface::MARKET_SEED,
            &market.fixture_id.to_le_bytes(),
            &market.stat_key.to_le_bytes(),
        ],
        bump = market.bump,
        constraint = market.state == MarketState::Open @ SettlementError::MarketNotOpen,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = staker,
        space = Position::DISCRIMINATOR.len() + Position::INIT_SPACE,
        seeds = [POSITION_SEED, market.key().as_ref(), staker.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump = market.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub staker: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn stake_handler(ctx: Context<Stake>, side: Side, amount: u64) -> Result<()> {
    require!(amount > 0, SettlementError::ZeroStake);

    // Move the stake into the vault (staker signs normally).
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.staker.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    let market = &mut ctx.accounts.market;
    match side {
        Side::Yes => {
            market.stake_yes = market
                .stake_yes
                .checked_add(amount)
                .ok_or(SettlementError::Overflow)?
        }
        Side::No => {
            market.stake_no = market
                .stake_no
                .checked_add(amount)
                .ok_or(SettlementError::Overflow)?
        }
    }

    let position = &mut ctx.accounts.position;
    position.market = market.key();
    position.owner = ctx.accounts.staker.key();
    position.side = side;
    position.amount = amount;
    position.claimed = false;
    position.bump = ctx.bumps.position;
    position._reserved = [0u8; 16];

    Ok(())
}
