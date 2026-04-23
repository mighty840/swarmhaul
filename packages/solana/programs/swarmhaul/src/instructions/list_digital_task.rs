use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{DigitalTaskAccount, DigitalTaskStatus};

#[derive(Accounts)]
#[instruction(task_id: [u8; 16], max_budget_lamports: u64, coordinator: Pubkey)]
pub struct ListDigitalTask<'info> {
    #[account(mut)]
    pub shipper: Signer<'info>,

    #[account(
        init,
        payer = shipper,
        space = 8 + DigitalTaskAccount::INIT_SPACE,
        seeds = [b"dtask", task_id.as_ref()],
        bump,
    )]
    pub task_account: Account<'info, DigitalTaskAccount>,

    /// CHECK: PDA vault that holds the escrow funds for this digital task.
    #[account(
        mut,
        seeds = [b"dvault", task_account.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ListDigitalTask>,
    task_id: [u8; 16],
    max_budget_lamports: u64,
    coordinator: Pubkey,
) -> Result<()> {
    require!(max_budget_lamports > 0, DigitalTaskError::ZeroBudget);

    let task = &mut ctx.accounts.task_account;
    task.shipper = ctx.accounts.shipper.key();
    task.coordinator = coordinator;
    task.task_id = task_id;
    task.max_budget_lamports = max_budget_lamports;
    task.status = DigitalTaskStatus::Listed;
    task.created_at = Clock::get()?.unix_timestamp;
    task.vault_bump = ctx.bumps.vault;
    task.bump = ctx.bumps.task_account;

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.shipper.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        max_budget_lamports,
    )?;

    emit!(DigitalTaskListed {
        task: task.key(),
        shipper: task.shipper,
        coordinator: task.coordinator,
        max_budget_lamports,
    });

    Ok(())
}

#[event]
pub struct DigitalTaskListed {
    pub task: Pubkey,
    pub shipper: Pubkey,
    pub coordinator: Pubkey,
    pub max_budget_lamports: u64,
}

#[error_code]
pub enum DigitalTaskError {
    #[msg("Budget must be greater than zero")]
    ZeroBudget,
    #[msg("Task must be in Listed status")]
    InvalidTaskStatus,
    #[msg("Only the task coordinator can manage this task")]
    UnauthorizedCoordinator,
    #[msg("total_legs must be greater than zero")]
    ZeroLegs,
    #[msg("total_lamports exceeds task max_budget_lamports")]
    BudgetExceeded,
    #[msg("Task swarm must be in Forming status")]
    SwarmNotForming,
    #[msg("Task swarm must be in Active status")]
    SwarmNotActive,
    #[msg("All legs must be completed before settlement")]
    LegsNotComplete,
    #[msg("Leg index out of bounds")]
    LegIndexOutOfBounds,
    #[msg("All leg slots already assigned")]
    AllLegsAssigned,
    #[msg("This leg has already been confirmed")]
    LegAlreadyConfirmed,
    #[msg("Agent does not match the leg's assigned agent")]
    NotAssignedAgent,
    #[msg("Insufficient vault balance for payment")]
    InsufficientVault,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Legs must be confirmed in strict index order")]
    LegOutOfOrder,
    #[msg("fee_bps must be between 0 and 10000")]
    InvalidFeeBps,
}
