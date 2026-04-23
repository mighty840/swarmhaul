use crate::instructions::list_digital_task::DigitalTaskError;
use crate::state::{
    AgentReputationAccount, DigitalTaskAccount, DigitalTaskStatus, TaskLegAccount,
    TaskSwarmAccount, TaskSwarmStatus,
};
use anchor_lang::prelude::*;
use anchor_lang::system_program;

// Coordinator-signs model for digital tasks.
//
// Unlike physical `confirm_leg` (where the next-hop courier or shipper signs to
// prove physical receipt), digital results are received by the coordinator as the
// trusted oracle. The coordinator therefore signs `confirm_task_leg` to release
// payment to the agent.
//
// Strict leg ordering is still enforced: leg_index == task_swarm.completed_legs.
#[derive(Accounts)]
pub struct ConfirmTaskLeg<'info> {
    /// Protocol coordinator — trusted oracle that receives AI results via API.
    #[account(
        mut,
        constraint = coordinator.key() == task_account.coordinator @ DigitalTaskError::UnauthorizedCoordinator,
    )]
    pub coordinator: Signer<'info>,

    /// CHECK: payout destination — must match task_leg_account.agent
    #[account(
        mut,
        constraint = agent.key() == task_leg_account.agent @ DigitalTaskError::NotAssignedAgent,
    )]
    pub agent: SystemAccount<'info>,

    #[account(
        mut,
        constraint = task_leg_account.task_swarm == task_swarm_account.key() @ DigitalTaskError::InvalidTaskStatus,
        constraint = !task_leg_account.confirmed @ DigitalTaskError::LegAlreadyConfirmed,
        constraint = task_leg_account.leg_index == task_swarm_account.completed_legs @ DigitalTaskError::LegOutOfOrder,
    )]
    pub task_leg_account: Account<'info, TaskLegAccount>,

    #[account(
        mut,
        constraint = task_swarm_account.status == TaskSwarmStatus::Active @ DigitalTaskError::SwarmNotActive,
        constraint = task_swarm_account.task == task_account.key() @ DigitalTaskError::InvalidTaskStatus,
    )]
    pub task_swarm_account: Account<'info, TaskSwarmAccount>,

    #[account(mut)]
    pub task_account: Account<'info, DigitalTaskAccount>,

    /// CHECK: PDA vault holding escrow funds for this task.
    #[account(
        mut,
        seeds = [b"dvault", task_account.key().as_ref()],
        bump = task_account.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"reputation", agent.key().as_ref()],
        bump = agent_reputation.bump,
        constraint = agent_reputation.agent == agent.key() @ DigitalTaskError::NotAssignedAgent,
    )]
    pub agent_reputation: Account<'info, AgentReputationAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ConfirmTaskLeg>) -> Result<()> {
    let payment = ctx.accounts.task_leg_account.payment_lamports;
    let task_key = ctx.accounts.task_account.key();
    let vault_bump = ctx.accounts.task_account.vault_bump;

    require!(
        ctx.accounts.vault.lamports() >= payment,
        DigitalTaskError::InsufficientVault
    );

    // CEI: mark confirmed before transfer
    let leg = &mut ctx.accounts.task_leg_account;
    leg.confirmed = true;
    let leg_agent = leg.agent;
    let leg_key = leg.key();

    let swarm = &mut ctx.accounts.task_swarm_account;
    swarm.completed_legs = swarm
        .completed_legs
        .checked_add(1)
        .ok_or(DigitalTaskError::Overflow)?;
    let completed_legs = swarm.completed_legs;
    let total_legs = swarm.total_legs;
    let swarm_key = swarm.key();

    // First confirmation flips task to InProgress
    let task = &mut ctx.accounts.task_account;
    if task.status == DigitalTaskStatus::SwarmForming {
        task.status = DigitalTaskStatus::InProgress;
    }

    // Bump shared reputation: legs_completed + recompute score
    let rep = &mut ctx.accounts.agent_reputation;
    rep.legs_completed = rep
        .legs_completed
        .checked_add(1)
        .ok_or(DigitalTaskError::Overflow)?;
    rep.recompute_score();

    // PDA-signed transfer from vault to agent
    let signer_seeds: &[&[&[u8]]] = &[&[b"dvault", task_key.as_ref(), &[vault_bump]]];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.agent.to_account_info(),
            },
            signer_seeds,
        ),
        payment,
    )?;

    emit!(TaskLegConfirmed {
        task_swarm: swarm_key,
        task_leg: leg_key,
        agent: leg_agent,
        payment_lamports: payment,
        completed_legs,
        total_legs,
    });

    Ok(())
}

#[event]
pub struct TaskLegConfirmed {
    pub task_swarm: Pubkey,
    pub task_leg: Pubkey,
    pub agent: Pubkey,
    pub payment_lamports: u64,
    pub completed_legs: u8,
    pub total_legs: u8,
}
