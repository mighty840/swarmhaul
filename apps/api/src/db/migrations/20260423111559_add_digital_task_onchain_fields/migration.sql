-- AlterTable
ALTER TABLE "DigitalLeg" ADD COLUMN     "onChainLeg" TEXT,
ADD COLUMN     "paymentLamports" BIGINT;

-- AlterTable
ALTER TABLE "DigitalTask" ADD COLUMN     "onChainSwarm" TEXT,
ADD COLUMN     "onChainTask" TEXT,
ADD COLUMN     "onChainVault" TEXT;
