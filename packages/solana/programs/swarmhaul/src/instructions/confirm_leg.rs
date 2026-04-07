use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{LegAccount, PackageAccount, PackageStatus, SwarmAccount, SwarmStatus};
use crate::instructions::form_swarm::SwarmError;

#[derive(Accounts)]
pub struct ConfirmLeg<'info> {
    #[account(mut)]
    pub courier: Signer<'info>,

    #[account(
        mut,
        constraint = leg_account.swarm == swarm_account.key() @ SwarmError::InvalidPackageStatus,
        constraint = leg_account.courier == courier.key() @ SwarmError::NotAssignedCourier,
        constraint = !leg_account.confirmed @ SwarmError::LegAlreadyConfirmed,
    )]
    pub leg_account: Account<'info, LegAccount>,

    #[account(
        mut,
        constraint = swarm_account.status == SwarmStatus::Active @ SwarmError::SwarmNotActive,
        constraint = swarm_account.package == package_account.key() @ SwarmError::InvalidPackageStatus,
    )]
    pub swarm_account: Account<'info, SwarmAccount>,

    #[account(mut)]
    pub package_account: Account<'info, PackageAccount>,

    /// CHECK: PDA vault holding escrow funds. Verified by seeds + stored bump.
    #[account(
        mut,
        seeds = [b"vault", package_account.key().as_ref()],
        bump = package_account.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ConfirmLeg>) -> Result<()> {
    let payment = ctx.accounts.leg_account.payment_lamports;
    let package_key = ctx.accounts.package_account.key();
    let vault_bump = ctx.accounts.package_account.vault_bump;

    require!(
        ctx.accounts.vault.lamports() >= payment,
        SwarmError::InsufficientVault
    );

    // Mark leg complete BEFORE the transfer (CEI pattern, defense in depth)
    let leg = &mut ctx.accounts.leg_account;
    leg.confirmed = true;
    let leg_courier = leg.courier;
    let leg_key = leg.key();

    let swarm = &mut ctx.accounts.swarm_account;
    swarm.completed_legs = swarm
        .completed_legs
        .checked_add(1)
        .ok_or(SwarmError::Overflow)?;
    let completed_legs = swarm.completed_legs;
    let total_legs = swarm.total_legs;
    let swarm_key = swarm.key();

    // First confirmation flips package to InTransit
    let package = &mut ctx.accounts.package_account;
    if package.status == PackageStatus::SwarmForming {
        package.status = PackageStatus::InTransit;
    }

    // PDA-signed transfer of the EXACT pre-stored amount
    let signer_seeds: &[&[&[u8]]] = &[&[b"vault", package_key.as_ref(), &[vault_bump]]];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.courier.to_account_info(),
            },
            signer_seeds,
        ),
        payment,
    )?;

    emit!(LegConfirmed {
        swarm: swarm_key,
        leg: leg_key,
        courier: leg_courier,
        payment_lamports: payment,
        completed_legs,
        total_legs,
    });

    Ok(())
}

#[event]
pub struct LegConfirmed {
    pub swarm: Pubkey,
    pub leg: Pubkey,
    pub courier: Pubkey,
    pub payment_lamports: u64,
    pub completed_legs: u8,
    pub total_legs: u8,
}
