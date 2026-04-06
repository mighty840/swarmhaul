use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct VehicleProfileAccount {
    pub owner: Pubkey,
    pub hourly_rate_lamports: u64,
    pub boot_volume_litres: u16,
    pub is_autonomous: bool,
    pub registered_at: i64,
    pub bump: u8,
}
