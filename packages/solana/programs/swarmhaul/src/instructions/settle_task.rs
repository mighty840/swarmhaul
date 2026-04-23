use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::instructions::list_digital_task::DigitalTaskError;
use crate::state::{DigitalTaskAccount, DigitalTaskStatus, TaskSwarmAccount, TaskSwarmStatus};

#[derive(Accounts)]
pub struct SettleTask<'info> {
    #[account(mut)]
    pub coordinator: Signer<'info>,

    #[account(
        mut,
        close = shipper,
        constraint = task_swarm_account.status == TaskSwarmStatus::Active @ DigitalTaskError::SwarmNotActive,
        constraint = task_swarm_account.completed_legs >= task_swarm_account.total_legs @ DigitalTaskError::LegsNotComplete,
        constraint = task_swarm_account.task == task_account.key() @ DigitalTaskError::InvalidTaskStatus,
    )]
    pub task_swarm_account: Account<'info, TaskSwarmAccount>,

    #[account(
        mut,
        constraint = coordinator.key() == task_account.coordinator @ DigitalTaskError::UnauthorizedCoordinator,
    )]
    pub task_account: Account<'info, DigitalTaskAccount>,

    /// CHECK: PDA vault — surplus returned to shipper
    #[account(
        mut,
        seeds = [b"dvault", task_account.key().as_ref()],
        bump = task_account.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: original shipper receives vault surplus + swarm account rent
    #[account(
        mut,
        constraint = shipper.key() == task_account.shipper,
    )]
    pub shipper: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SettleTask>) -> Result<()> {
    let task_key = ctx.accounts.task_account.key();
    let vault_bump = ctx.accounts.task_account.vault_bump;
    let surplus = ctx.accounts.vault.lamports();

    let swarm = &mut ctx.accounts.task_swarm_account;
    swarm.status = TaskSwarmStatus::Settled;
    let swarm_key = swarm.key();

    let task = &mut ctx.accounts.task_account;
    task.status = DigitalTaskStatus::Completed;

    if surplus > 0 {
        let signer_seeds: &[&[&[u8]]] = &[&[b"dvault", task_key.as_ref(), &[vault_bump]]];

        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.shipper.to_account_info(),
                },
                signer_seeds,
            ),
            surplus,
        )?;
    }

    emit!(TaskSettled {
        task_swarm: swarm_key,
        task: task_key,
        surplus_returned_lamports: surplus,
    });

    Ok(())
}

#[event]
pub struct TaskSettled {
    pub task_swarm: Pubkey,
    pub task: Pubkey,
    pub surplus_returned_lamports: u64,
}
