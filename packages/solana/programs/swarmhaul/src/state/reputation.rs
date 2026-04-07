use anchor_lang::prelude::*;

/// On-chain reputation for an autonomous agent.
///
/// Mutated only by `assign_leg` (legs_accepted++) and `confirm_leg`
/// (legs_completed++, total_delivery_time_sec += elapsed). There is no
/// standalone `update_reputation` instruction — every counter movement
/// is bound to a verified protocol action.
///
/// `reliability_score` is computed on read as
///   floor(legs_completed / legs_accepted * 100)
/// and exposed as a stored field for cheap leaderboard queries.
///
/// PDA seeds: [b"reputation", agent_pubkey]
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

impl AgentReputationAccount {
    /// Recompute reliability_score from current counters.
    /// Deterministic: legs_completed / legs_accepted * 100, floor.
    /// Returns 0 if no bids accepted yet (no signal).
    pub fn recompute_score(&mut self) {
        if self.legs_accepted == 0 {
            self.reliability_score = 0;
            return;
        }
        let score = (self.legs_completed as u64)
            .saturating_mul(100)
            .saturating_div(self.legs_accepted as u64);
        self.reliability_score = score.min(100) as u8;
    }
}
