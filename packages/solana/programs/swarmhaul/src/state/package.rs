use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PackageAccount {
    pub shipper: Pubkey,
    pub package_id: [u8; 16], // UUID bytes
    pub max_budget_lamports: u64,
    pub status: PackageStatus,
    pub created_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PackageStatus {
    Listed,
    SwarmForming,
    InTransit,
    Delivered,
    Failed,
}
