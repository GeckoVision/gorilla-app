//! Shared fixtures + builders for the forge-markets Mollusk suite.
//!
//! In-process SVM via Mollusk (the repo's proven test stack: Mollusk 0.13 +
//! solana-sdk 3). We build Anchor's wire format by hand so this crate pulls NO
//! anchor crates (which would drag in the solana 2.x tree and clash):
//!   - instruction discriminator = sha256("global:<ix>")[0..8]
//!   - instruction data          = disc(8) ++ borsh(args, in declared order)
//!   - account decode            = borsh over data[8..] (skip the 8-byte disc)
//!
//! ── The CPI double ───────────────────────────────────────────────────────────
//! `settle` CPIs `txoracle::validate_stat`. Reconstructing txoracle's real Merkle
//! hashing byte-for-byte is out of reach for Phase A (its hash scheme is not in
//! the IDL), so the suite loads a PROGRAM DOUBLE — `mock_txoracle` — AT the real
//! txoracle program id. The double has the EXACT IDL `validate_stat` signature, so
//! it Borsh-deserializes the full argument tree the settlement program serialized
//! (a real check that the CPI encoding is byte-exact), and it decides Ok/Err by
//! comparing the submitted sub-tree root to the seeded on-chain root (modelling
//! "proof matches the root"). See programs/mock-txoracle/src/lib.rs.

use borsh::{BorshDeserialize, BorshSerialize};
use mollusk_svm::program::create_program_account_loader_v3;
use mollusk_svm::Mollusk;
use sha2::{Digest, Sha256};
use solana_sdk::account::Account;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use std::collections::HashMap;

pub const SOL: u64 = 1_000_000_000;

/// forge-markets program id — matches `declare_id!` in the program.
pub const SETTLEMENT_ID: Pubkey =
    solana_sdk::pubkey!("7Pvo6SEh1zBa1Euvj5QQ4td9GpfsQosTpxhqwWtWUFt6");

/// TxODDS txoracle program id (devnet) — the double is loaded here.
pub const TXORACLE_ID: Pubkey = solana_sdk::pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

pub const SYSTEM_PROGRAM: Pubkey = solana_sdk::pubkey!("11111111111111111111111111111111");

/// The IDL-declared discriminator for `txoracle::validate_stat` (verbatim). The
/// suite asserts our Anchor-derived disc equals this — the cheapest byte-exact check.
pub const VALIDATE_STAT_DISC_IDL: [u8; 8] = [107, 197, 232, 90, 191, 136, 105, 185];

// ---- frozen seeds (mirror forge-markets/src/interface.rs) ------------------
pub const MARKET_SEED: &[u8] = b"market";
pub const VAULT_SEED: &[u8] = b"vault";
pub const POSITION_SEED: &[u8] = b"position";

// ============================ mirrored borsh types ============================
// Byte-for-byte the settlement program's Anchor types (Anchor == Borsh).

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, PartialEq, Debug)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, PartialEq, Debug)]
pub struct TraderPredicate {
    pub threshold: i32,
    pub comparison: Comparison,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, PartialEq, Debug)]
pub enum Side {
    Yes,
    No,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, PartialEq, Debug)]
pub enum MarketState {
    Open,
    Settled,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct ScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct StatTerm {
    pub stat_to_prove: ScoreStat,
    pub event_stat_root: [u8; 32],
    pub stat_proof: Vec<ProofNode>,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug)]
pub enum BinaryExpression {
    Add,
    Subtract,
}

// ============================ decoded account views ===========================

/// Decoded `Market` (field order mirrors state.rs exactly).
#[derive(BorshDeserialize, Debug)]
pub struct MarketView {
    pub fixture_id: i64,
    pub stat_key: u32,
    pub predicate: TraderPredicate,
    pub vault: [u8; 32],
    pub stake_yes: u64,
    pub stake_no: u64,
    pub state: MarketState,
    pub winner: Side,
    pub authority: [u8; 32],
    pub bump: u8,
    pub vault_bump: u8,
    pub schema_version: u8,
    pub period: i32,
    pub _reserved: [u8; 28],
}

/// Decoded `Position`.
#[derive(BorshDeserialize, Debug)]
pub struct PositionView {
    pub market: [u8; 32],
    pub owner: [u8; 32],
    pub side: Side,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
    pub _reserved: [u8; 16],
}

pub fn decode_market(data: &[u8]) -> Option<MarketView> {
    if data.len() < 8 {
        return None;
    }
    MarketView::try_from_slice(&data[8..]).ok()
}

pub fn decode_position(data: &[u8]) -> Option<PositionView> {
    if data.len() < 8 {
        return None;
    }
    PositionView::try_from_slice(&data[8..]).ok()
}

// ============================ discriminators / PDAs ============================

pub fn ix_disc(name: &str) -> [u8; 8] {
    let mut h = Sha256::new();
    h.update(b"global:");
    h.update(name.as_bytes());
    let out = h.finalize();
    let mut d = [0u8; 8];
    d.copy_from_slice(&out[0..8]);
    d
}

pub fn market_pda(fixture_id: i64, stat_key: u32) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            MARKET_SEED,
            &fixture_id.to_le_bytes(),
            &stat_key.to_le_bytes(),
        ],
        &SETTLEMENT_ID,
    )
}

pub fn vault_pda(market: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_SEED, market.as_ref()], &SETTLEMENT_ID)
}

pub fn position_pda(market: &Pubkey, staker: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[POSITION_SEED, market.as_ref(), staker.as_ref()],
        &SETTLEMENT_ID,
    )
}

// ============================ account fixtures ================================

pub fn funded(lamports: u64) -> Account {
    Account {
        lamports,
        data: vec![],
        owner: SYSTEM_PROGRAM,
        executable: false,
        rent_epoch: 0,
    }
}

pub fn system_program_entry() -> (Pubkey, Account) {
    (
        SYSTEM_PROGRAM,
        Account {
            lamports: 1,
            data: vec![],
            owner: solana_sdk::pubkey!("NativeLoader1111111111111111111111111111111"),
            executable: true,
            rent_epoch: 0,
        },
    )
}

/// The txoracle program account (loader-v3 stub). The compiled ELF lives in the
/// Mollusk program cache (added via `add_program`); this account just makes the
/// runtime treat `TXORACLE_ID` as an executable program for the CPI.
pub fn txoracle_program_entry() -> (Pubkey, Account) {
    (TXORACLE_ID, create_program_account_loader_v3(&TXORACLE_ID))
}

/// The txoracle-owned `daily_scores_merkle_roots` account. The double reads its
/// first 32 bytes as the on-chain root.
pub fn daily_roots_account(root: &[u8; 32]) -> Account {
    let mut data = vec![0u8; 64];
    data[0..32].copy_from_slice(root);
    Account {
        lamports: 5_000_000,
        data,
        owner: TXORACLE_ID,
        executable: false,
        rent_epoch: 0,
    }
}

// ============================ instruction-data builders =======================

pub fn data_create_market(
    fixture_id: i64,
    stat_key: u32,
    predicate: &TraderPredicate,
    period: i32,
) -> Vec<u8> {
    let mut d = ix_disc("create_market").to_vec();
    d.extend_from_slice(&borsh::to_vec(&fixture_id).unwrap());
    d.extend_from_slice(&borsh::to_vec(&stat_key).unwrap());
    d.extend_from_slice(&borsh::to_vec(predicate).unwrap());
    d.extend_from_slice(&borsh::to_vec(&period).unwrap());
    d
}

pub fn data_stake(side: Side, amount: u64) -> Vec<u8> {
    let mut d = ix_disc("stake").to_vec();
    d.extend_from_slice(&borsh::to_vec(&side).unwrap());
    d.extend_from_slice(&borsh::to_vec(&amount).unwrap());
    d
}

#[allow(clippy::too_many_arguments)]
pub fn data_settle(
    ts: i64,
    fixture_summary: &ScoresBatchSummary,
    fixture_proof: &Vec<ProofNode>,
    main_tree_proof: &Vec<ProofNode>,
    stat_a: &StatTerm,
    stat_b: &Option<StatTerm>,
    op: &Option<BinaryExpression>,
) -> Vec<u8> {
    let mut d = ix_disc("settle").to_vec();
    d.extend_from_slice(&borsh::to_vec(&ts).unwrap());
    d.extend_from_slice(&borsh::to_vec(fixture_summary).unwrap());
    d.extend_from_slice(&borsh::to_vec(fixture_proof).unwrap());
    d.extend_from_slice(&borsh::to_vec(main_tree_proof).unwrap());
    d.extend_from_slice(&borsh::to_vec(stat_a).unwrap());
    d.extend_from_slice(&borsh::to_vec(stat_b).unwrap());
    d.extend_from_slice(&borsh::to_vec(op).unwrap());
    d
}

pub fn data_claim() -> Vec<u8> {
    ix_disc("claim").to_vec()
}

// ============================ instruction builders ============================
// Account order MUST match each #[derive(Accounts)] field order.

pub fn ix_create_market(
    authority: &Pubkey,
    fixture_id: i64,
    stat_key: u32,
    predicate: &TraderPredicate,
    period: i32,
) -> Instruction {
    let (market, _) = market_pda(fixture_id, stat_key);
    let (vault, _) = vault_pda(&market);
    Instruction {
        program_id: SETTLEMENT_ID,
        accounts: vec![
            AccountMeta::new(market, false),
            AccountMeta::new_readonly(vault, false),
            AccountMeta::new(*authority, true),
            AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
        ],
        data: data_create_market(fixture_id, stat_key, predicate, period),
    }
}

pub fn ix_stake(market: &Pubkey, staker: &Pubkey, side: Side, amount: u64) -> Instruction {
    let (vault, _) = vault_pda(market);
    let (position, _) = position_pda(market, staker);
    Instruction {
        program_id: SETTLEMENT_ID,
        accounts: vec![
            AccountMeta::new(*market, false),
            AccountMeta::new(position, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(*staker, true),
            AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
        ],
        data: data_stake(side, amount),
    }
}

#[allow(clippy::too_many_arguments)]
pub fn ix_settle(
    market: &Pubkey,
    daily_roots: &Pubkey,
    txoracle_program: &Pubkey,
    ts: i64,
    fixture_summary: &ScoresBatchSummary,
    fixture_proof: &Vec<ProofNode>,
    main_tree_proof: &Vec<ProofNode>,
    stat_a: &StatTerm,
    stat_b: &Option<StatTerm>,
    op: &Option<BinaryExpression>,
) -> Instruction {
    Instruction {
        program_id: SETTLEMENT_ID,
        accounts: vec![
            AccountMeta::new(*market, false),
            AccountMeta::new_readonly(*daily_roots, false),
            AccountMeta::new_readonly(*txoracle_program, false),
        ],
        data: data_settle(
            ts,
            fixture_summary,
            fixture_proof,
            main_tree_proof,
            stat_a,
            stat_b,
            op,
        ),
    }
}

pub fn ix_claim(market: &Pubkey, staker: &Pubkey) -> Instruction {
    let (vault, _) = vault_pda(market);
    let (position, _) = position_pda(market, staker);
    Instruction {
        program_id: SETTLEMENT_ID,
        accounts: vec![
            AccountMeta::new_readonly(*market, false),
            AccountMeta::new(position, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(*staker, true),
            AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
        ],
        data: data_claim(),
    }
}

// ============================ the threaded env ================================

/// A tiny stateful harness: loads both programs into Mollusk and carries account
/// state forward between instructions (Mollusk itself is per-instruction).
pub struct Env {
    pub mollusk: Mollusk,
    pub store: HashMap<Pubkey, Account>,
}

impl Env {
    /// Load forge_markets (primary) + mock_txoracle (the CPI double, at the
    /// real txoracle id) from SBF_OUT_DIR.
    pub fn new() -> Self {
        let mut mollusk = Mollusk::new(&SETTLEMENT_ID, "forge_markets");
        mollusk.add_program(&TXORACLE_ID, "mock_txoracle");
        let mut store = HashMap::new();
        let (sp, spa) = system_program_entry();
        store.insert(sp, spa);
        let (tp, tpa) = txoracle_program_entry();
        store.insert(tp, tpa);
        Self { mollusk, store }
    }

    pub fn set(&mut self, key: Pubkey, account: Account) {
        self.store.insert(key, account);
    }

    pub fn get(&self, key: &Pubkey) -> Account {
        self.store.get(key).cloned().unwrap_or_else(|| funded(0))
    }

    /// Process an instruction using the account keys it references (pulled from the
    /// store), then, if it succeeded, fold the resulting accounts back in.
    pub fn process(&mut self, ix: &Instruction) -> mollusk_svm::result::InstructionResult {
        let accounts: Vec<(Pubkey, Account)> = ix
            .accounts
            .iter()
            .map(|meta| (meta.pubkey, self.get(&meta.pubkey)))
            .collect();
        let res = self.mollusk.process_instruction(ix, &accounts);
        if res.program_result.is_ok() {
            for (k, a) in &res.resulting_accounts {
                self.store.insert(*k, a.clone());
            }
        }
        res
    }
}

impl Default for Env {
    fn default() -> Self {
        Self::new()
    }
}
