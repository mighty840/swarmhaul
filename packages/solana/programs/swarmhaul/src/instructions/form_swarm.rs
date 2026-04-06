use anchor_lang::prelude::*;
use crate::state::{PackageAccount, PackageStatus, SwarmAccount, SwarmStatus};

#[derive(Accounts)]
pub struct FormSwarm<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = package_account.status == PackageStatus::Listed @ SwarmError::InvalidPackageStatus,
    )]
    pub package_account: Account<'info, PackageAccount>,

    #[account(
        init,
        payer = authority,
        space = 8 + SwarmAccount::INIT_SPACE,
        seeds = [b"swarm", package_account.key().as_ref()],
        bump,
    )]
    pub swarm_account: Account<'info, SwarmAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<FormSwarm>,
    total_legs: u8,
    total_lamports: u64,
) -> Result<()> {
    let package = &mut ctx.accounts.package_account;
    package.status = PackageStatus::SwarmForming;

    let swarm = &mut ctx.accounts.swarm_account;
    swarm.package = ctx.accounts.package_account.key();
    swarm.total_legs = total_legs;
    swarm.completed_legs = 0;
    swarm.total_lamports = total_lamports;
    swarm.status = SwarmStatus::Forming;
    swarm.formed_at = Clock::get()?.unix_timestamp;
    swarm.bump = ctx.bumps.swarm_account;

    msg!("Swarm formed with {} legs", total_legs);
    Ok(())
}

#[error_code]
pub enum SwarmError {
    #[msg("Package must be in Listed status to form a swarm")]
    InvalidPackageStatus,
    #[msg("Swarm must be in Forming status")]
    SwarmNotForming,
    #[msg("Swarm must be in Active status")]
    SwarmNotActive,
    #[msg("All legs must be completed before settlement")]
    LegsNotComplete,
    #[msg("Insufficient vault balance")]
    InsufficientVault,
}
