use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;

use instructions::*;

declare_id!("GW9wYUcfa6LT5vxJ12aN7nu8VxWVrM53jaZcrZak41sg");

#[program]
pub mod swarmhaul {
    use super::*;

    pub fn list_package(
        ctx: Context<ListPackage>,
        package_id: [u8; 16],
        max_budget_lamports: u64,
    ) -> Result<()> {
        instructions::list_package::handler(ctx, package_id, max_budget_lamports)
    }

    pub fn register_vehicle(
        ctx: Context<RegisterVehicle>,
        hourly_rate_lamports: u64,
        boot_volume_litres: u16,
        is_autonomous: bool,
    ) -> Result<()> {
        instructions::register_vehicle::handler(
            ctx,
            hourly_rate_lamports,
            boot_volume_litres,
            is_autonomous,
        )
    }

    pub fn form_swarm(
        ctx: Context<FormSwarm>,
        total_legs: u8,
        total_lamports: u64,
    ) -> Result<()> {
        instructions::form_swarm::handler(ctx, total_legs, total_lamports)
    }

    pub fn join_swarm(ctx: Context<JoinSwarm>, leg_index: u8) -> Result<()> {
        instructions::join_swarm::handler(ctx, leg_index)
    }

    pub fn confirm_leg(ctx: Context<ConfirmLeg>, payment_lamports: u64) -> Result<()> {
        instructions::confirm_leg::handler(ctx, payment_lamports)
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        instructions::settle::handler(ctx)
    }

    pub fn cancel_package(ctx: Context<CancelPackage>) -> Result<()> {
        instructions::cancel_package::handler(ctx)
    }

    pub fn update_reputation(
        ctx: Context<UpdateReputation>,
        legs_completed_delta: u32,
        legs_accepted_delta: u32,
        delivery_time_sec: u64,
    ) -> Result<()> {
        instructions::update_reputation::handler(
            ctx,
            legs_completed_delta,
            legs_accepted_delta,
            delivery_time_sec,
        )
    }
}
