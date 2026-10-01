-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('automatic', 'manual');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('gasoline', 'diesel', 'hybrid', 'electric');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "description" TEXT,
ADD COLUMN     "locationLabel" TEXT,
ADD COLUMN     "locationLat" DOUBLE PRECISION,
ADD COLUMN     "locationLng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PaymentMethod" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "last4" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fuelType" "FuelType",
ADD COLUMN     "mileageLimitPerDay" INTEGER,
ADD COLUMN     "seats" INTEGER,
ADD COLUMN     "transmission" "TransmissionType";

-- CreateTable
CREATE TABLE "VehiclePhoto" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehiclePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehiclePhoto_vehicleId_position_idx" ON "VehiclePhoto"("vehicleId", "position");

-- CreateIndex
CREATE INDEX "Listing_locationLat_locationLng_idx" ON "Listing"("locationLat", "locationLng");

-- AddForeignKey
ALTER TABLE "VehiclePhoto" ADD CONSTRAINT "VehiclePhoto_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
