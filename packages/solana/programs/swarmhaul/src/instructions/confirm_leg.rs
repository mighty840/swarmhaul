use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{
    AgentReputationAccount, LegAccount, PackageAccount, PackageStatus, SwarmAccount, SwarmStatus,
};
use crate::instructions::form_swarm::SwarmError;

// NOTE: recipient-signs model.
// For single-leg swarms the recipient is the shipper (package.shipper must
// equal signer). Multi-leg intermediate handoffs (recipient = next-hop
// courier) are a protocol v2 concern — enforce single-leg here for now.
//
// The courier account is no longer a signer; it's a passive payout
// destination that must match the leg's assigned courier. The program
// signs the vault → courier transfer via the vault PDA, as before.
#[derive(Accounts)]
pub struct ConfirmLeg<'info> {
    /// Shipper/consignee acknowledging receipt. Pays the tx fee.
    #[account(mut)]
    pub recipient: Signer<'info>,

    /// CHECK: payout destination. Must match leg_account.courier.
    /// Not a signer — the courier is paid, not confirming.
    #[account(
        mut,
        constraint = courier.key() == leg_account.courier @ SwarmError::NotAssignedCourier,
    )]
    pub courier: SystemAccount<'info>,

    #[account(
        mut,
        constraint = leg_account.swarm == swarm_account.key() @ SwarmError::InvalidPackageStatus,
        constraint = !leg_account.confirmed @ SwarmError::LegAlreadyConfirmed,
    )]
    pub leg_account: Account<'info, LegAccount>,

    #[account(
        mut,
        constraint = swarm_account.status == SwarmStatus::Active @ SwarmError::SwarmNotActive,
        constraint = swarm_account.package == package_account.key() @ SwarmError::InvalidPackageStatus,
        // v1: single-leg swarms only — multi-leg handoff auth is TODO.
        constraint = swarm_account.total_legs == 1 @ SwarmError::MultiLegNotSupported,
    )]
    pub swarm_account: Account<'info, SwarmAccount>,

    #[account(
        mut,
        constraint = package_account.shipper == recipient.key() @ SwarmError::UnauthorizedRecipient,
    )]
    pub package_account: Account<'info, PackageAccount>,

    /// CHECK: PDA vault holding escrow funds. Verified by seeds + stored bump.
    #[account(
        mut,
        seeds = [b"vault", package_account.key().as_ref()],
        bump = package_account.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// Reputation PDA for the courier.
    /// Mutated to bump legs_completed and recompute reliability_score.
    #[account(
        mut,
        seeds = [b"reputation", courier.key().as_ref()],
        bump = courier_reputation.bump,
        constraint = courier_reputation.agent == courier.key() @ SwarmError::NotAssignedCourier,
    )]
    pub courier_reputation: Account<'info, AgentReputationAccount>,

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

    // Reputation: bump legs_completed + recompute reliability_score
    let rep = &mut ctx.accounts.courier_reputation;
    rep.legs_completed = rep.legs_completed.checked_add(1).ok_or(SwarmError::Overflow)?;
    rep.recompute_score();

    // PDA-signed transfer of the EXACT pre-stored amount to the courier
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
