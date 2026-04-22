-- CreateTable
CREATE TABLE "DigitalTask" (
    "id" TEXT NOT NULL,
    "shipperPubkey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "maxBudgetSol" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'listed',
    "listedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DigitalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalLeg" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "agentPubkey" TEXT,
    "bidSol" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'open',
    "result" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DigitalLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalAgentProfile" (
    "agentPubkey" TEXT NOT NULL,
    "displayName" TEXT,
    "capabilities" TEXT[],
    "lastAirdropAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalAgentProfile_pkey" PRIMARY KEY ("agentPubkey")
);

-- AddForeignKey
ALTER TABLE "DigitalLeg" ADD CONSTRAINT "DigitalLeg_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DigitalTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
