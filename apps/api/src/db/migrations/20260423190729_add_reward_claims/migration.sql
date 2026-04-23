-- CreateTable
CREATE TABLE "RewardClaim" (
    "id" TEXT NOT NULL,
    "devnetPubkey" TEXT NOT NULL,
    "mainnetPubkey" TEXT NOT NULL,
    "devnetEarningsLamports" BIGINT NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "paidTxSig" TEXT,

    CONSTRAINT "RewardClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardClaim_devnetPubkey_key" ON "RewardClaim"("devnetPubkey");
