use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PackageAccount {
    pub shipper: Pubkey,
    /// Authority that can form/assign/settle the swarm on behalf of the shipper.
    /// Set at list_package time. May be the shipper themselves or a trusted protocol coordinator.
    pub coordinator: Pubkey,
    pub package_id: [u8; 16], // UUID bytes
    pub max_budget_lamports: u64,
    pub status: PackageStatus,
    pub created_at: i64,
    /// PDA bump for the escrow vault, stored to prevent recomputation drift across instructions.
    pub vault_bump: u8,
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
