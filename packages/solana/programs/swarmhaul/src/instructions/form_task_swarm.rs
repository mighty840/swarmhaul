use crate::instructions::list_digital_task::DigitalTaskError;
use crate::state::{DigitalTaskAccount, DigitalTaskStatus, TaskSwarmAccount, TaskSwarmStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct FormTaskSwarm<'info> {
    #[account(mut)]
    pub coordinator: Signer<'info>,

    #[account(
        mut,
        constraint = task_account.status == DigitalTaskStatus::Listed @ DigitalTaskError::InvalidTaskStatus,
        constraint = coordinator.key() == task_account.coordinator @ DigitalTaskError::UnauthorizedCoordinator,
    )]
    pub task_account: Account<'info, DigitalTaskAccount>,

    #[account(
        init,
        payer = coordinator,
        space = 8 + TaskSwarmAccount::INIT_SPACE,
        seeds = [b"dtswarm", task_account.key().as_ref()],
        bump,
    )]
    pub task_swarm_account: Account<'info, TaskSwarmAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<FormTaskSwarm>, total_legs: u8, total_lamports: u64) -> Result<()> {
    require!(total_legs > 0, DigitalTaskError::ZeroLegs);
    require!(
        total_lamports <= ctx.accounts.task_account.max_budget_lamports,
        DigitalTaskError::BudgetExceeded
    );

    let task = &mut ctx.accounts.task_account;
    task.status = DigitalTaskStatus::SwarmForming;

    let swarm = &mut ctx.accounts.task_swarm_account;
    swarm.task = task.key();
    swarm.total_legs = total_legs;
    swarm.assigned_legs = 0;
    swarm.completed_legs = 0;
    swarm.total_lamports = total_lamports;
    swarm.status = TaskSwarmStatus::Forming;
    swarm.formed_at = Clock::get()?.unix_timestamp;
    swarm.bump = ctx.bumps.task_swarm_account;

    emit!(TaskSwarmFormed {
        task_swarm: swarm.key(),
        task: swarm.task,
        coordinator: ctx.accounts.coordinator.key(),
        total_legs,
        total_lamports,
    });

    Ok(())
}

#[event]
pub struct TaskSwarmFormed {
    pub task_swarm: Pubkey,
    pub task: Pubkey,
    pub coordinator: Pubkey,
    pub total_legs: u8,
    pub total_lamports: u64,
}
