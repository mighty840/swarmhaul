use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{PackageAccount, PackageStatus, SwarmAccount, SwarmStatus};
use crate::instructions::form_swarm::SwarmError;

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub coordinator: Signer<'info>,

    #[account(
        mut,
        close = shipper,
        constraint = swarm_account.status == SwarmStatus::Active @ SwarmError::SwarmNotActive,
        constraint = swarm_account.completed_legs >= swarm_account.total_legs @ SwarmError::LegsNotComplete,
        constraint = swarm_account.package == package_account.key() @ SwarmError::InvalidPackageStatus,
    )]
    pub swarm_account: Account<'info, SwarmAccount>,

    #[account(
        mut,
        constraint = coordinator.key() == package_account.coordinator @ SwarmError::UnauthorizedCoordinator,
    )]
    pub package_account: Account<'info, PackageAccount>,

    /// CHECK: PDA vault — surplus returned to shipper
    #[account(
        mut,
        seeds = [b"vault", package_account.key().as_ref()],
        bump = package_account.vault_bump,
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
    let package_key = ctx.accounts.package_account.key();
    let vault_bump = ctx.accounts.package_account.vault_bump;
    let surplus = ctx.accounts.vault.lamports();

    let swarm = &mut ctx.accounts.swarm_account;
    swarm.status = SwarmStatus::Settled;
    let swarm_key = swarm.key();

    let package = &mut ctx.accounts.package_account;
    package.status = PackageStatus::Delivered;

    // Return surplus to shipper using PDA signing
    if surplus > 0 {
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault", package_key.as_ref(), &[vault_bump]]];

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
    }

    emit!(SwarmSettled {
        swarm: swarm_key,
        package: package_key,
        surplus_returned_lamports: surplus,
    });

    Ok(())
}

#[event]
pub struct SwarmSettled {
    pub swarm: Pubkey,
    pub package: Pubkey,
    pub surplus_returned_lamports: u64,
}
