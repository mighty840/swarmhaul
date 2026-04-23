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
        coordinator: Pubkey,
    ) -> Result<()> {
        instructions::list_package::handler(ctx, package_id, max_budget_lamports, coordinator)
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

    pub fn assign_leg(
        ctx: Context<AssignLeg>,
        leg_index: u8,
        courier: Pubkey,
        payment_lamports: u64,
    ) -> Result<()> {
        instructions::assign_leg::handler(ctx, leg_index, courier, payment_lamports)
    }

    pub fn confirm_leg(ctx: Context<ConfirmLeg>) -> Result<()> {
        instructions::confirm_leg::handler(ctx)
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        instructions::settle::handler(ctx)
    }

    pub fn update_vehicle(
        ctx: Context<UpdateVehicle>,
        hourly_rate_lamports: u64,
        boot_volume_litres: u16,
        is_autonomous: bool,
    ) -> Result<()> {
        instructions::register_vehicle::update_handler(
            ctx,
            hourly_rate_lamports,
            boot_volume_litres,
            is_autonomous,
        )
    }

    pub fn cancel_package(ctx: Context<CancelPackage>) -> Result<()> {
        instructions::cancel_package::handler(ctx)
    }

    pub fn list_digital_task(
        ctx: Context<ListDigitalTask>,
        task_id: [u8; 16],
        max_budget_lamports: u64,
        coordinator: Pubkey,
    ) -> Result<()> {
        instructions::list_digital_task::handler(ctx, task_id, max_budget_lamports, coordinator)
    }

    pub fn form_task_swarm(
        ctx: Context<FormTaskSwarm>,
        total_legs: u8,
        total_lamports: u64,
    ) -> Result<()> {
        instructions::form_task_swarm::handler(ctx, total_legs, total_lamports)
    }

    pub fn assign_task_leg(
        ctx: Context<AssignTaskLeg>,
        leg_index: u8,
        agent: Pubkey,
        payment_lamports: u64,
    ) -> Result<()> {
        instructions::assign_task_leg::handler(ctx, leg_index, agent, payment_lamports)
    }

    pub fn confirm_task_leg(ctx: Context<ConfirmTaskLeg>) -> Result<()> {
        instructions::confirm_task_leg::handler(ctx)
    }

    pub fn settle_task(ctx: Context<SettleTask>) -> Result<()> {
        instructions::settle_task::handler(ctx)
    }
}
