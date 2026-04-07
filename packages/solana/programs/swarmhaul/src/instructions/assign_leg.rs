use anchor_lang::prelude::*;
use crate::state::{LegAccount, PackageAccount, PackageStatus, SwarmAccount, SwarmStatus};
use crate::instructions::form_swarm::SwarmError;

#[derive(Accounts)]
#[instruction(leg_index: u8, courier: Pubkey, payment_lamports: u64)]
pub struct AssignLeg<'info> {
    #[account(mut)]
    pub coordinator: Signer<'info>,

    #[account(
        constraint = coordinator.key() == package_account.coordinator @ SwarmError::UnauthorizedCoordinator,
    )]
    pub package_account: Account<'info, PackageAccount>,

    #[account(
        mut,
        constraint = swarm_account.package == package_account.key() @ SwarmError::InvalidPackageStatus,
        constraint = swarm_account.status == SwarmStatus::Forming @ SwarmError::SwarmNotForming,
    )]
    pub swarm_account: Account<'info, SwarmAccount>,

    #[account(
        init,
        payer = coordinator,
        space = 8 + LegAccount::INIT_SPACE,
        seeds = [b"leg", swarm_account.key().as_ref(), &[leg_index]],
        bump,
    )]
    pub leg_account: Account<'info, LegAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<AssignLeg>,
    leg_index: u8,
    courier: Pubkey,
    payment_lamports: u64,
) -> Result<()> {
    let swarm = &mut ctx.accounts.swarm_account;

    require!(leg_index < swarm.total_legs, SwarmError::LegIndexOutOfBounds);
    require!(swarm.assigned_legs < swarm.total_legs, SwarmError::AllLegsAssigned);

    let leg = &mut ctx.accounts.leg_account;
    leg.swarm = swarm.key();
    leg.leg_index = leg_index;
    leg.courier = courier;
    leg.payment_lamports = payment_lamports;
    leg.confirmed = false;
    leg.bump = ctx.bumps.leg_account;

    swarm.assigned_legs = swarm.assigned_legs.checked_add(1).ok_or(SwarmError::Overflow)?;

    // Once all legs are assigned, swarm becomes Active
    if swarm.assigned_legs == swarm.total_legs {
        swarm.status = SwarmStatus::Active;
    }

    emit!(LegAssigned {
        swarm: swarm.key(),
        leg: leg.key(),
        leg_index,
        courier,
        payment_lamports,
    });

    Ok(())
}

#[event]
pub struct LegAssigned {
    pub swarm: Pubkey,
    pub leg: Pubkey,
    pub leg_index: u8,
    pub courier: Pubkey,
    pub payment_lamports: u64,
}
