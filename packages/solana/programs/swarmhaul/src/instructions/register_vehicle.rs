use anchor_lang::prelude::*;
use crate::state::VehicleProfileAccount;

/// Register a new vehicle profile. Fails if already registered.
/// Use `update_vehicle` to modify an existing profile.
#[derive(Accounts)]
pub struct RegisterVehicle<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
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

    emit!(VehicleRegistered {
        owner: profile.owner,
        hourly_rate_lamports,
        boot_volume_litres,
        is_autonomous,
    });

    Ok(())
}

/// Update an existing vehicle profile. Only the original owner can update.
#[derive(Accounts)]
pub struct UpdateVehicle<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vehicle", owner.key().as_ref()],
        bump = vehicle_profile.bump,
        constraint = vehicle_profile.owner == owner.key() @ VehicleError::NotOwner,
    )]
    pub vehicle_profile: Account<'info, VehicleProfileAccount>,
}

pub fn update_handler(
    ctx: Context<UpdateVehicle>,
    hourly_rate_lamports: u64,
    boot_volume_litres: u16,
    is_autonomous: bool,
) -> Result<()> {
    let profile = &mut ctx.accounts.vehicle_profile;
    profile.hourly_rate_lamports = hourly_rate_lamports;
    profile.boot_volume_litres = boot_volume_litres;
    profile.is_autonomous = is_autonomous;

    emit!(VehicleUpdated {
        owner: profile.owner,
        hourly_rate_lamports,
        boot_volume_litres,
        is_autonomous,
    });

    Ok(())
}

#[event]
pub struct VehicleRegistered {
    pub owner: Pubkey,
    pub hourly_rate_lamports: u64,
    pub boot_volume_litres: u16,
    pub is_autonomous: bool,
}

#[event]
pub struct VehicleUpdated {
    pub owner: Pubkey,
    pub hourly_rate_lamports: u64,
    pub boot_volume_litres: u16,
    pub is_autonomous: bool,
}

#[error_code]
pub enum VehicleError {
    #[msg("Only the vehicle owner can update this profile")]
    NotOwner,
}
