use anchor_lang::prelude::*;
use crate::state::{SwarmAccount, SwarmStatus, PackageAccount, PackageStatus};
use crate::instructions::form_swarm::SwarmError;

#[derive(Accounts)]
pub struct JoinSwarm<'info> {
    pub courier: Signer<'info>,

    #[account(
        mut,
        constraint = swarm_account.status == SwarmStatus::Forming @ SwarmError::SwarmNotForming,
    )]
    pub swarm_account: Account<'info, SwarmAccount>,

    #[account(mut)]
    pub package_account: Account<'info, PackageAccount>,
}

pub fn handler(ctx: Context<JoinSwarm>, leg_index: u8) -> Result<()> {
    let swarm = &mut ctx.accounts.swarm_account;

    // If all legs have been joined, transition to Active
    // In a full implementation, we'd track per-leg state in a separate account
    // For MVP, we just check if this is the last courier joining
    if leg_index + 1 >= swarm.total_legs {
        swarm.status = SwarmStatus::Active;
        let package = &mut ctx.accounts.package_account;
        package.status = PackageStatus::InTransit;
    }

    msg!(
        "Courier {} joined swarm for leg {}",
        ctx.accounts.courier.key(),
        leg_index
    );
    Ok(())
}
