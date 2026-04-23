use anchor_lang::prelude::*;
use crate::instructions::list_digital_task::DigitalTaskError;
use crate::state::{
    AgentReputationAccount, DigitalTaskAccount, TaskLegAccount, TaskSwarmAccount, TaskSwarmStatus,
};

#[derive(Accounts)]
#[instruction(leg_index: u8, agent: Pubkey, payment_lamports: u64)]
pub struct AssignTaskLeg<'info> {
    #[account(mut)]
    pub coordinator: Signer<'info>,

    #[account(
        constraint = coordinator.key() == task_account.coordinator @ DigitalTaskError::UnauthorizedCoordinator,
    )]
    pub task_account: Account<'info, DigitalTaskAccount>,

    #[account(
        mut,
        constraint = task_swarm_account.task == task_account.key() @ DigitalTaskError::InvalidTaskStatus,
        constraint = task_swarm_account.status == TaskSwarmStatus::Forming @ DigitalTaskError::SwarmNotForming,
    )]
    pub task_swarm_account: Account<'info, TaskSwarmAccount>,

    #[account(
        init,
        payer = coordinator,
        space = 8 + TaskLegAccount::INIT_SPACE,
        seeds = [b"dtleg", task_swarm_account.key().as_ref(), &[leg_index]],
        bump,
    )]
    pub task_leg_account: Account<'info, TaskLegAccount>,

    /// Shared reputation PDA — same seeds as physical assign_leg,
    /// so digital and physical legs all count toward the same score.
    #[account(
        init_if_needed,
        payer = coordinator,
        space = 8 + AgentReputationAccount::INIT_SPACE,
        seeds = [b"reputation", agent.as_ref()],
        bump,
    )]
    pub agent_reputation: Account<'info, AgentReputationAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<AssignTaskLeg>,
    leg_index: u8,
    agent: Pubkey,
    payment_lamports: u64,
) -> Result<()> {
    let swarm = &mut ctx.accounts.task_swarm_account;

    require!(leg_index < swarm.total_legs, DigitalTaskError::LegIndexOutOfBounds);
    require!(swarm.assigned_legs < swarm.total_legs, DigitalTaskError::AllLegsAssigned);
    require!(payment_lamports > 0, DigitalTaskError::ZeroLegs);

    let leg = &mut ctx.accounts.task_leg_account;
    leg.task_swarm = swarm.key();
    leg.leg_index = leg_index;
    leg.agent = agent;
    leg.payment_lamports = payment_lamports;
    leg.confirmed = false;
    leg.bump = ctx.bumps.task_leg_account;

    swarm.assigned_legs = swarm
        .assigned_legs
        .checked_add(1)
        .ok_or(DigitalTaskError::Overflow)?;

    if swarm.assigned_legs == swarm.total_legs {
        swarm.status = TaskSwarmStatus::Active;
    }

    // Bump the shared reputation counter for legs_accepted
    let rep = &mut ctx.accounts.agent_reputation;
    if rep.agent == Pubkey::default() {
        rep.agent = agent;
        rep.bump = ctx.bumps.agent_reputation;
    }
    rep.legs_accepted = rep
        .legs_accepted
        .checked_add(1)
        .ok_or(DigitalTaskError::Overflow)?;
    rep.recompute_score();

    let leg_key = leg.key();
    let swarm_key = swarm.key();
    emit!(TaskLegAssigned {
        task_swarm: swarm_key,
        task_leg: leg_key,
        leg_index,
        agent,
        payment_lamports,
    });

    Ok(())
}

#[event]
pub struct TaskLegAssigned {
    pub task_swarm: Pubkey,
    pub task_leg: Pubkey,
    pub leg_index: u8,
    pub agent: Pubkey,
    pub payment_lamports: u64,
}
