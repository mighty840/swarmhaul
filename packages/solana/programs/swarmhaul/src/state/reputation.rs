use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct AgentReputationAccount {
    pub agent: Pubkey,
    pub legs_completed: u32,
    pub legs_accepted: u32,
    pub total_delivery_time_sec: u64,
    pub reliability_score: u8, // 0-100
    pub bump: u8,
}
