-- AlterTable
ALTER TABLE "beneficiaries" ADD COLUMN     "areaLabel" TEXT,
ADD COLUMN     "availabilityWindows" JSONB,
ADD COLUMN     "maxBudget" DECIMAL(12,2),
ADD COLUMN     "preferredPlace" "TeachingMode",
ADD COLUMN     "searchRadiusM" INTEGER;

-- AlterTable
ALTER TABLE "tutor_profiles" ADD COLUMN     "partnerRoomRadiusM" INTEGER;
