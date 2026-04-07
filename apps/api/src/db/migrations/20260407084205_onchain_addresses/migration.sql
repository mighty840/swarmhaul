/*
  Warnings:

  - You are about to drop the column `escrowAccount` on the `Swarm` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Leg" ADD COLUMN     "confirmSignature" TEXT,
ADD COLUMN     "legIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "onChainLeg" TEXT;

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "listSignature" TEXT,
ADD COLUMN     "onChainPackage" TEXT,
ADD COLUMN     "onChainVault" TEXT;

-- AlterTable
ALTER TABLE "Swarm" DROP COLUMN "escrowAccount",
ADD COLUMN     "formSignature" TEXT,
ADD COLUMN     "onChainSwarm" TEXT;
