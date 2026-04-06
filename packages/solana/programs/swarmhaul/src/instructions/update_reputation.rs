use anchor_lang::prelude::*;
use crate::state::AgentReputationAccount;

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + AgentReputationAccount::INIT_SPACE,
        seeds = [b"reputation", agent.key().as_ref()],
        bump,
    )]
    pub reputation: Account<'info, AgentReputationAccount>,

    /// CHECK: the agent whose reputation is being updated
    pub agent: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<UpdateReputation>,
    legs_completed_delta: u32,
    legs_accepted_delta: u32,
    delivery_time_sec: u64,
) -> Result<()> {
    let rep = &mut ctx.accounts.reputation;
    rep.agent = ctx.accounts.agent.key();
    rep.legs_completed += legs_completed_delta;
    rep.legs_accepted += legs_accepted_delta;
    rep.total_delivery_time_sec += delivery_time_sec;
    rep.bump = ctx.bumps.reputation;

    // Calculate reliability score: completed / accepted * 100
    if rep.legs_accepted > 0 {
        rep.reliability_score =
            ((rep.legs_completed as u64 * 100) / rep.legs_accepted as u64) as u8;
    }

    msg!(
        "Reputation updated for {}: score {}",
        ctx.accounts.agent.key(),
        rep.reliability_score
    );
    Ok(())
}
