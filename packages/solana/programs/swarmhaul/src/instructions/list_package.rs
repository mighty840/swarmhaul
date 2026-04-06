use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{PackageAccount, PackageStatus};

#[derive(Accounts)]
#[instruction(package_id: [u8; 16], max_budget_lamports: u64)]
pub struct ListPackage<'info> {
    #[account(mut)]
    pub shipper: Signer<'info>,

    #[account(
        init,
        payer = shipper,
        space = 8 + PackageAccount::INIT_SPACE,
        seeds = [b"package", package_id.as_ref()],
        bump,
    )]
    pub package_account: Account<'info, PackageAccount>,

    /// CHECK: PDA vault that holds the escrow funds
    #[account(
        mut,
        seeds = [b"vault", package_account.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ListPackage>,
    package_id: [u8; 16],
    max_budget_lamports: u64,
) -> Result<()> {
    let package = &mut ctx.accounts.package_account;
    package.shipper = ctx.accounts.shipper.key();
    package.package_id = package_id;
    package.max_budget_lamports = max_budget_lamports;
    package.status = PackageStatus::Listed;
    package.created_at = Clock::get()?.unix_timestamp;
    package.bump = ctx.bumps.package_account;

    // Transfer budget to vault
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.shipper.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        max_budget_lamports,
    )?;

    msg!("Package listed: {:?}", package_id);
    Ok(())
}
