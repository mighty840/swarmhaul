use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct SwarmAccount {
    pub package: Pubkey,
    pub total_legs: u8,
    pub completed_legs: u8,
    pub total_lamports: u64,
    pub status: SwarmStatus,
    pub formed_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum SwarmStatus {
    Forming,
    Active,
    Settled,
    Failed,
}
