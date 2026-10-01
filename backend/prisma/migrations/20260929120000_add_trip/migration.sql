-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('requested', 'confirmed', 'cancelled');

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "renterId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "rentalCents" INTEGER NOT NULL,
    "coverCents" INTEGER NOT NULL,
    "deliveryCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "depositCents" INTEGER NOT NULL,
    "coverageTierId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "authorizationId" TEXT,
    "depositHoldId" TEXT,
    "policyId" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'requested',
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trip_renterId_startDate_idx" ON "Trip"("renterId", "startDate");
CREATE INDEX "Trip_ownerId_startDate_idx" ON "Trip"("ownerId", "startDate");
CREATE INDEX "Trip_listingId_status_idx" ON "Trip"("listingId", "status");
