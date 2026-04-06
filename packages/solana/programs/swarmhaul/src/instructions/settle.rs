use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{SwarmAccount, SwarmStatus, PackageAccount, PackageStatus};
use crate::instructions::form_swarm::SwarmError;

#[derive(Accounts)]
pub struct Settle<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = swarm_account.status == SwarmStatus::Active @ SwarmError::SwarmNotActive,
        constraint = swarm_account.completed_legs >= swarm_account.total_legs @ SwarmError::LegsNotComplete,
    )]
    pub swarm_account: Account<'info, SwarmAccount>,

    #[account(mut)]
    pub package_account: Account<'info, PackageAccount>,

    /// CHECK: PDA vault — surplus returned to shipper
    #[account(
        mut,
        seeds = [b"vault", package_account.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: original shipper receives surplus
    #[account(
        mut,
        constraint = shipper.key() == package_account.shipper,
    )]
    pub shipper: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Settle>) -> Result<()> {
    let swarm = &mut ctx.accounts.swarm_account;
    swarm.status = SwarmStatus::Settled;

    let package = &mut ctx.accounts.package_account;
    package.status = PackageStatus::Delivered;

    // Return any surplus from vault to shipper using PDA signing
    let surplus = ctx.accounts.vault.lamports();
    if surplus > 0 {
        let package_key = ctx.accounts.package_account.key();
        let vault_bump = ctx.bumps.vault;
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"vault",
            package_key.as_ref(),
            &[vault_bump],
        ]];

        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.shipper.to_account_info(),
                },
                signer_seeds,
            ),
            surplus,
        )?;

        msg!("Returned {} lamports surplus to shipper", surplus);
    }

    msg!("Swarm settled. Package delivered.");
    Ok(())
}
