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

    /// CHECK: PDA vault — surplus returned to shipper after optional platform fee
    #[account(
        mut,
        seeds = [b"dvault", task_account.key().as_ref()],
        bump = task_account.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: original shipper receives vault surplus (minus platform fee)
    #[account(
        mut,
        constraint = shipper.key() == task_account.shipper,
    )]
    pub shipper: SystemAccount<'info>,

    /// CHECK: platform wallet receives fee when fee_bps > 0
    #[account(mut)]
    pub platform_wallet: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// fee_bps: platform fee in basis points (0–10000). Pass 0 for no fee.
/// When fee_bps > 0 and surplus > 0, fee = surplus * fee_bps / 10000 goes to
/// platform_wallet; remainder goes to shipper.
pub fn handler(ctx: Context<SettleTask>, fee_bps: u16) -> Result<()> {
    require!(fee_bps <= 10_000, DigitalTaskError::InvalidFeeBps);

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

        let fee = if fee_bps > 0 {
            surplus.saturating_mul(fee_bps as u64) / 10_000
        } else {
            0
        };
        let shipper_refund = surplus.saturating_sub(fee);

        if fee > 0 {
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.platform_wallet.to_account_info(),
                    },
                    signer_seeds,
                ),
                fee,
            )?;
        }

        if shipper_refund > 0 {
            system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.shipper.to_account_info(),
                    },
                    signer_seeds,
                ),
                shipper_refund,
            )?;
        }

        emit!(TaskSettled {
            task_swarm: swarm_key,
            task: task_key,
            surplus_returned_lamports: shipper_refund,
            platform_fee_lamports: fee,
        });
    } else {
        emit!(TaskSettled {
            task_swarm: swarm_key,
            task: task_key,
            surplus_returned_lamports: 0,
            platform_fee_lamports: 0,
        });
    }

    Ok(())
}

#[event]
pub struct TaskSettled {
    pub task_swarm: Pubkey,
    pub task: Pubkey,
    pub surplus_returned_lamports: u64,
    pub platform_fee_lamports: u64,
}
