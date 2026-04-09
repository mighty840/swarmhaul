use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{PackageAccount, PackageStatus};

/// Default TTL: 30 minutes. After this, the package can no longer be cancelled
/// (swarm formation should have happened, or the package expired).
const CANCEL_TTL_SECONDS: i64 = 30 * 60;

#[derive(Accounts)]
pub struct CancelPackage<'info> {
    #[account(
        mut,
        constraint = shipper.key() == package_account.shipper,
    )]
    pub shipper: Signer<'info>,

    #[account(
        mut,
        close = shipper,
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
    let now = Clock::get()?.unix_timestamp;
    let created = ctx.accounts.package_account.created_at;
    require!(
        now - created <= CANCEL_TTL_SECONDS,
        CancelError::CancelWindowExpired
    );

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

    // Note: package_account is closed to shipper via `close = shipper` constraint,
    // returning the rent-exempt balance automatically after the handler returns.

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
    #[msg("Cancellation window has expired (30 min from listing)")]
    CancelWindowExpired,
}
