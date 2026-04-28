-- Add bid window support to DigitalLeg and create DigitalLegBid table

ALTER TABLE "DigitalLeg" ADD COLUMN "biddingClosesAt" TIMESTAMP(3);

CREATE TABLE "DigitalLegBid" (
    "id"          TEXT NOT NULL,
    "legId"       TEXT NOT NULL,
    "agentPubkey" TEXT NOT NULL,
    "bidSol"      DOUBLE PRECISION NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DigitalLegBid_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DigitalLegBid" ADD CONSTRAINT "DigitalLegBid_legId_fkey"
    FOREIGN KEY ("legId") REFERENCES "DigitalLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
