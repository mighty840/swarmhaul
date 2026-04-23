use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TaskSwarmAccount {
    pub task: Pubkey,
    pub total_legs: u8,
    pub assigned_legs: u8,
    pub completed_legs: u8,
    pub total_lamports: u64,
    pub status: TaskSwarmStatus,
    pub formed_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TaskSwarmStatus {
    Forming,
    Active,
    Settled,
    Failed,
}
