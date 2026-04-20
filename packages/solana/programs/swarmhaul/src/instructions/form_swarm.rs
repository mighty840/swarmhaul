use crate::state::{PackageAccount, PackageStatus, SwarmAccount, SwarmStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct FormSwarm<'info> {
    #[account(mut)]
    pub coordinator: Signer<'info>,

    #[account(
        mut,
        constraint = package_account.status == PackageStatus::Listed @ SwarmError::InvalidPackageStatus,
        constraint = coordinator.key() == package_account.coordinator @ SwarmError::UnauthorizedCoordinator,
    )]
    pub package_account: Account<'info, PackageAccount>,

    #[account(
        init,
        payer = coordinator,
        space = 8 + SwarmAccount::INIT_SPACE,
        seeds = [b"swarm", package_account.key().as_ref()],
        bump,
    )]
    pub swarm_account: Account<'info, SwarmAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<FormSwarm>, total_legs: u8, total_lamports: u64) -> Result<()> {
    require!(total_legs > 0, SwarmError::ZeroLegs);
    require!(
        total_lamports <= ctx.accounts.package_account.max_budget_lamports,
        SwarmError::BudgetExceeded
    );

    let package = &mut ctx.accounts.package_account;
    package.status = PackageStatus::SwarmForming;

    let swarm = &mut ctx.accounts.swarm_account;
    swarm.package = ctx.accounts.package_account.key();
    swarm.total_legs = total_legs;
    swarm.assigned_legs = 0;
    swarm.completed_legs = 0;
    swarm.total_lamports = total_lamports;
    swarm.status = SwarmStatus::Forming;
    swarm.formed_at = Clock::get()?.unix_timestamp;
    swarm.bump = ctx.bumps.swarm_account;

    emit!(SwarmFormed {
        swarm: swarm.key(),
        package: swarm.package,
        coordinator: ctx.accounts.coordinator.key(),
        total_legs,
        total_lamports,
    });

    Ok(())
}

#[event]
pub struct SwarmFormed {
    pub swarm: Pubkey,
    pub package: Pubkey,
    pub coordinator: Pubkey,
    pub total_legs: u8,
    pub total_lamports: u64,
}

#[error_code]
pub enum SwarmError {
    #[msg("Package must be in Listed status to form a swarm")]
    InvalidPackageStatus,
    #[msg("Only the package coordinator can form/assign/settle this swarm")]
    UnauthorizedCoordinator,
    #[msg("total_legs must be greater than zero")]
    ZeroLegs,
    #[msg("total_lamports exceeds package max_budget_lamports")]
    BudgetExceeded,
    #[msg("Swarm must be in Forming status")]
    SwarmNotForming,
    #[msg("Swarm must be in Active status")]
    SwarmNotActive,
    #[msg("All legs must be completed before settlement")]
    LegsNotComplete,
    #[msg("Leg index out of bounds")]
    LegIndexOutOfBounds,
    #[msg("All leg slots already assigned")]
    AllLegsAssigned,
    #[msg("This leg has already been confirmed")]
    LegAlreadyConfirmed,
    #[msg("Signer does not match the leg's assigned courier")]
    NotAssignedCourier,
    #[msg("Insufficient vault balance for payment")]
    InsufficientVault,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Signer is not the shipper/recipient authorized to confirm delivery")]
    UnauthorizedRecipient,
    #[msg("Legs must be confirmed in strict index order — a prior leg is still pending")]
    LegOutOfOrder,
    #[msg("Intermediate leg confirm requires next_leg_account to identify the next-hop courier")]
    MissingNextLeg,
    #[msg("Final leg confirm must not supply next_leg_account — there is no next hop")]
    UnexpectedNextLeg,
}
