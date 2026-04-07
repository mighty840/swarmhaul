use anchor_lang::prelude::*;
use crate::state::{AgentReputationAccount, LegAccount, PackageAccount, SwarmAccount, SwarmStatus};
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

    /// Reputation PDA for the courier being assigned.
    /// Created on first assignment, mutated to bump legs_accepted.
    #[account(
        init_if_needed,
        payer = coordinator,
        space = 8 + AgentReputationAccount::INIT_SPACE,
        seeds = [b"reputation", courier.as_ref()],
        bump,
    )]
    pub courier_reputation: Account<'info, AgentReputationAccount>,

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
    require!(payment_lamports > 0, SwarmError::ZeroLegs);

    let leg = &mut ctx.accounts.leg_account;
    leg.swarm = swarm.key();
    leg.leg_index = leg_index;
    leg.courier = courier;
    leg.payment_lamports = payment_lamports;
    leg.confirmed = false;
    leg.bump = ctx.bumps.leg_account;

    swarm.assigned_legs = swarm
        .assigned_legs
        .checked_add(1)
        .ok_or(SwarmError::Overflow)?;

    if swarm.assigned_legs == swarm.total_legs {
        swarm.status = SwarmStatus::Active;
    }

    // Reputation: bump legs_accepted (bound to a verified coordinator assignment)
    let rep = &mut ctx.accounts.courier_reputation;
    if rep.agent == Pubkey::default() {
        rep.agent = courier;
        rep.bump = ctx.bumps.courier_reputation;
    }
    rep.legs_accepted = rep
        .legs_accepted
        .checked_add(1)
        .ok_or(SwarmError::Overflow)?;
    rep.recompute_score();

    let leg_key = leg.key();
    let swarm_key = swarm.key();
    emit!(LegAssigned {
        swarm: swarm_key,
        leg: leg_key,
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
