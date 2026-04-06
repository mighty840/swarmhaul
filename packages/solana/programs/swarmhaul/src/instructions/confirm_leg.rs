use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{SwarmAccount, SwarmStatus};
use crate::instructions::form_swarm::SwarmError;

#[derive(Accounts)]
pub struct ConfirmLeg<'info> {
    #[account(mut)]
    pub courier: Signer<'info>,

    #[account(
        mut,
        constraint = swarm_account.status == SwarmStatus::Active @ SwarmError::SwarmNotActive,
    )]
    pub swarm_account: Account<'info, SwarmAccount>,

    /// CHECK: PDA vault holding escrow funds
    #[account(
        mut,
        seeds = [b"vault", swarm_account.package.as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ConfirmLeg>, payment_lamports: u64) -> Result<()> {
    let swarm = &mut ctx.accounts.swarm_account;
    swarm.completed_legs += 1;

    let transfer_amount = payment_lamports.min(ctx.accounts.vault.lamports());

    // Transfer from PDA vault using invoke_signed
    let package_key = swarm.package;
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
                to: ctx.accounts.courier.to_account_info(),
            },
            signer_seeds,
        ),
        transfer_amount,
    )?;

    msg!(
        "Leg confirmed. Paid {} lamports to {}. {}/{} legs done.",
        transfer_amount,
        ctx.accounts.courier.key(),
        swarm.completed_legs,
        swarm.total_legs,
    );

    Ok(())
}
