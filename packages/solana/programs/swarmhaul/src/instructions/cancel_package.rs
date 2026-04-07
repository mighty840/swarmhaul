use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{PackageAccount, PackageStatus};

#[derive(Accounts)]
pub struct CancelPackage<'info> {
    #[account(
        mut,
        constraint = shipper.key() == package_account.shipper,
    )]
    pub shipper: Signer<'info>,

    #[account(
        mut,
        constraint = package_account.status == PackageStatus::Listed @ CancelError::CannotCancel,
    )]
    pub package_account: Account<'info, PackageAccount>,

    /// CHECK: PDA vault — funds returned to shipper
    #[account(
        mut,
        seeds = [b"vault", package_account.key().as_ref()],
        bump = package_account.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CancelPackage>) -> Result<()> {
    let package_key = ctx.accounts.package_account.key();
    let vault_bump = ctx.accounts.package_account.vault_bump;
    let balance = ctx.accounts.vault.lamports();

    let package = &mut ctx.accounts.package_account;
    package.status = PackageStatus::Failed;

    if balance > 0 {
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
            balance,
        )?;
    }

    emit!(PackageCancelled {
        package: package_key,
        refunded_lamports: balance,
    });

    Ok(())
}

#[event]
pub struct PackageCancelled {
    pub package: Pubkey,
    pub refunded_lamports: u64,
}

#[error_code]
pub enum CancelError {
    #[msg("Can only cancel packages in Listed status")]
    CannotCancel,
}
