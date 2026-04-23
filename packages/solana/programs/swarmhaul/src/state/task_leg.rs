use anchor_lang::prelude::*;

/// Per-leg state for digital tasks, created by coordinator via `assign_task_leg`.
///
/// PDA seeds: [b"dtleg", task_swarm_pubkey, &[leg_index]]
#[account]
#[derive(InitSpace)]
pub struct TaskLegAccount {
    pub task_swarm: Pubkey,
    pub leg_index: u8,
    pub agent: Pubkey,
    pub payment_lamports: u64,
    pub confirmed: bool,
    pub bump: u8,
}
