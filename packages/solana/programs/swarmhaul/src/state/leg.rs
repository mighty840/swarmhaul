use anchor_lang::prelude::*;

/// Per-leg state, created by the coordinator via `assign_leg`.
///
/// Binds a specific courier pubkey to a specific leg of a specific swarm
/// with a fixed payment amount, eliminating the prior class of vault-drain
/// attacks where any signer could call confirm_leg unbounded times.
///
/// PDA seeds: [b"leg", swarm_pubkey, &[leg_index]]
#[account]
#[derive(InitSpace)]
pub struct LegAccount {
    pub swarm: Pubkey,
    pub leg_index: u8,
    pub courier: Pubkey,
    pub payment_lamports: u64,
    pub confirmed: bool,
    pub bump: u8,
}
