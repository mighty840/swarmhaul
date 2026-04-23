use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::instructions::list_digital_task::DigitalTaskError;
use crate::state::{DigitalTaskAccount, DigitalTaskStatus};

// Shipper can cancel a task that is still in Listed status (no agents assigned yet).
// The vault is fully refunded and the task account is closed.
// There is no TTL — shipper may cancel at any time before bids arrive.
#[derive(Accounts)]
pub struct CancelDigitalTask<'info> {
    #[account(
        mut,
        constraint = shipper.key() == task_account.shipper @ DigitalTaskError::UnauthorizedCoordinator,
    )]
    pub shipper: Signer<'info>,

    #[account(
        mut,
        close = shipper,
        constraint = task_account.status == DigitalTaskStatus::Listed @ DigitalTaskError::InvalidTaskStatus,
    )]
    pub task_account: Account<'info, DigitalTaskAccount>,

    /// CHECK: PDA vault — all funds returned to shipper
    #[account(
        mut,
        seeds = [b"dvault", task_account.key().as_ref()],
        bump = task_account.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CancelDigitalTask>) -> Result<()> {
    let task_key = ctx.accounts.task_account.key();
    let vault_bump = ctx.accounts.task_account.vault_bump;
    let refund = ctx.accounts.vault.lamports();

    if refund > 0 {
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
            refund,
        )?;
    }

    emit!(DigitalTaskCancelled {
        task: task_key,
        refunded_lamports: refund,
    });

    Ok(())
}

#[event]
pub struct DigitalTaskCancelled {
    pub task: Pubkey,
    pub refunded_lamports: u64,
}
