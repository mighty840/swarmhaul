-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "shipperPubkey" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destLat" DOUBLE PRECISION NOT NULL,
    "destLng" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "volumeLitres" DOUBLE PRECISION NOT NULL,
    "maxBudgetSol" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'listed',
    "listedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Swarm" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "escrowAccount" TEXT NOT NULL,
    "totalCostSol" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'forming',
    "formedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Swarm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leg" (
    "id" TEXT NOT NULL,
    "swarmId" TEXT NOT NULL,
    "agentPubkey" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "estimatedDurationMin" INTEGER NOT NULL,
    "agreedPaymentSol" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Leg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleProfile" (
    "agentPubkey" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "carMake" TEXT NOT NULL,
    "carModel" TEXT NOT NULL,
    "bootVolumeLitres" DOUBLE PRECISION NOT NULL,
    "fuelConsumptionL100" DOUBLE PRECISION NOT NULL,
    "fuelCostEurPerLitre" DOUBLE PRECISION NOT NULL,
    "hourlyRateEur" DOUBLE PRECISION NOT NULL,
    "isAutonomous" BOOLEAN NOT NULL DEFAULT false,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleProfile_pkey" PRIMARY KEY ("agentPubkey")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "agentPubkey" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "estimatedDurationMin" INTEGER NOT NULL,
    "costSol" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentReputation" (
    "agentPubkey" TEXT NOT NULL,
    "legsCompleted" INTEGER NOT NULL DEFAULT 0,
    "legsAccepted" INTEGER NOT NULL DEFAULT 0,
    "avgDeliveryTimeSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reliabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentReputation_pkey" PRIMARY KEY ("agentPubkey")
);

-- CreateTable
CREATE TABLE "NegotiationMessage" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "fromAgent" TEXT NOT NULL,
    "toAgent" TEXT,
    "action" TEXT NOT NULL,
    "proposedCostSol" DOUBLE PRECISION,
    "reasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NegotiationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Swarm_packageId_key" ON "Swarm"("packageId");

-- AddForeignKey
ALTER TABLE "Swarm" ADD CONSTRAINT "Swarm_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leg" ADD CONSTRAINT "Leg_swarmId_fkey" FOREIGN KEY ("swarmId") REFERENCES "Swarm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
