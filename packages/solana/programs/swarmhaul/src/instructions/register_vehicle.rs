use anchor_lang::prelude::*;
use crate::state::VehicleProfileAccount;

#[derive(Accounts)]
pub struct RegisterVehicle<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + VehicleProfileAccount::INIT_SPACE,
        seeds = [b"vehicle", owner.key().as_ref()],
        bump,
    )]
    pub vehicle_profile: Account<'info, VehicleProfileAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterVehicle>,
    hourly_rate_lamports: u64,
    boot_volume_litres: u16,
    is_autonomous: bool,
) -> Result<()> {
    let profile = &mut ctx.accounts.vehicle_profile;
    profile.owner = ctx.accounts.owner.key();
    profile.hourly_rate_lamports = hourly_rate_lamports;
    profile.boot_volume_litres = boot_volume_litres;
    profile.is_autonomous = is_autonomous;
    profile.registered_at = Clock::get()?.unix_timestamp;
    profile.bump = ctx.bumps.vehicle_profile;

    msg!("Vehicle registered for {}", ctx.accounts.owner.key());
    Ok(())
}
