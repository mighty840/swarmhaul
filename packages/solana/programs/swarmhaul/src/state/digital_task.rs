use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct DigitalTaskAccount {
    pub shipper: Pubkey,
    pub coordinator: Pubkey,
    pub task_id: [u8; 16],
    pub max_budget_lamports: u64,
    pub status: DigitalTaskStatus,
    pub created_at: i64,
    pub vault_bump: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum DigitalTaskStatus {
    Listed,
    SwarmForming,
    InProgress,
    Completed,
    Failed,
}
