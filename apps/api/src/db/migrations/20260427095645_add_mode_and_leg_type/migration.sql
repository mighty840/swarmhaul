-- AlterTable
ALTER TABLE "AgentReputation" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'both';

-- AlterTable
ALTER TABLE "DigitalLeg" ADD COLUMN     "legType" TEXT NOT NULL DEFAULT 'work';
