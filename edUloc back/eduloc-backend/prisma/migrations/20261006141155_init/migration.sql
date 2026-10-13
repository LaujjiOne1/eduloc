-- Extensions requises par les colonnes géographiques (places.location).
-- Doit précéder tout type "geography" pour que la base shadow de Prisma
-- puisse rejouer les migrations depuis zéro.
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "TutorApplicationStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TutorDocumentType" AS ENUM ('IDENTITY', 'DIPLOMA', 'CERTIFICATE', 'PROFESSIONAL_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "TutorDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('SELF', 'CHILD', 'SPOUSE', 'SIBLING', 'PARENT', 'RELATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "ObjectiveType" AS ENUM ('REMEDIAL', 'ONGOING', 'EXCELLENCE');

-- CreateEnum
CREATE TYPE "DifficultyType" AS ENUM ('THEORETICAL', 'PRACTICAL', 'METHODOLOGICAL', 'CONFIDENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "TeachingFormat" AS ENUM ('ONLINE', 'IN_PERSON', 'BOTH');

-- CreateEnum
CREATE TYPE "RhythmType" AS ENUM ('ONE_TIME', 'OCCASIONAL', 'REGULAR', 'INTENSIVE');

-- CreateEnum
CREATE TYPE "PlaceType" AS ENUM ('TUTOR_HOME', 'BENEFICIARY_HOME', 'PUBLIC_PLACE', 'ONLINE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REFUSED', 'CANCELLED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BookingActor" AS ENUM ('REQUESTER', 'TUTOR', 'SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "TeachingMode" AS ENUM ('ONLINE', 'AT_HOME_BENEFICIARY', 'AT_HOME_TUTOR', 'PUBLIC_PLACE');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'READ_ONLY', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('VOICE', 'DOCUMENT', 'SYSTEM', 'CALL_EVENT');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('VOICE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('NONE', 'PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ONGOING', 'ENDED', 'MISSED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_REQUEST', 'BOOKING_CONFIRMED', 'BOOKING_REFUSED', 'BOOKING_CANCELLED', 'SESSION_STARTED', 'SESSION_COMPLETED', 'REVIEW_REQUEST', 'TUTOR_APPLICATION', 'TUTOR_APPLICATION_APPROVED', 'TUTOR_APPLICATION_REJECTED', 'TUTOR_SUSPENDED', 'VOICE_MESSAGE', 'DOCUMENT_MESSAGE', 'INCOMING_CALL', 'MISSED_CALL', 'REMINDER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ConflictType" AS ENUM ('OVERLAPPING_BOOKINGS', 'TUTOR_UNAVAILABLE', 'AVAILABILITY_REMOVED', 'OFFER_INACTIVE', 'TUTOR_SUSPENDED');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "timezone" TEXT NOT NULL DEFAULT 'Indian/Antananarivo',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationTokenHash" TEXT,
    "emailVerificationExpiresAt" TIMESTAMP(3),
    "passwordResetTokenHash" TEXT,
    "passwordResetExpiresAt" TIMESTAMP(3),
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiaries" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "birthDate" TIMESTAMP(3),
    "relationship" "RelationshipType" NOT NULL,
    "educationLevelId" TEXT,
    "objective" "ObjectiveType",
    "difficultyType" "DifficultyType",
    "preferredFormat" "TeachingFormat",
    "preferredRhythm" "RhythmType",
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education_levels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "education_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "birthDate" TIMESTAMP(3),
    "profilePhoto" TEXT,
    "experience" TEXT,
    "educationBackground" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" TIMESTAMP(3),
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_applications" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "status" "TutorApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_documents" (
    "id" TEXT NOT NULL,
    "tutorApplicationId" TEXT NOT NULL,
    "type" "TutorDocumentType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fileName" TEXT,
    "status" "TutorDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "tutor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_subjects" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "educationLevelId" TEXT NOT NULL,
    "competenceDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "educationLevelId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "format" "TeachingFormat" NOT NULL DEFAULT 'BOTH',
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MGA',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "disabledByAdminAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radius" INTEGER,
    "type" "PlaceType" NOT NULL,
    "location" geography(Point, 4326),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availabilities" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "placeId" TEXT,
    "offerId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Indian/Antananarivo',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_periods" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "availabilityId" TEXT,
    "placeId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "teachingMode" "TeachingMode" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MGA',
    "offerTitle" TEXT NOT NULL,
    "locationLabel" TEXT,
    "locationAddress" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "startOtpCipher" TEXT,
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledBy" "BookingActor",
    "cancellationReason" TEXT,
    "refusalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_events" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "actor" "BookingActor" NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "bookingId" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageType" "MessageType",
    "lastMessagePreview" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "requesterLastReadAt" TIMESTAMP(3),
    "tutorLastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT,
    "type" "MessageType" NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "systemText" TEXT,
    "replyToId" TEXT,
    "callSessionId" TEXT,
    "listenedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "bucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fileName" TEXT,
    "durationMs" INTEGER,
    "waveform" JSONB,
    "transcriptStatus" "TranscriptStatus" NOT NULL DEFAULT 'NONE',
    "transcript" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_sessions" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "bookingId" TEXT,
    "roomName" TEXT NOT NULL,
    "type" "CallType" NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "initiatedById" TEXT NOT NULL,
    "ringingUntil" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "officialReply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "linkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "recipientIds" TEXT[],
    "payload" JSONB NOT NULL,
    "pushTitle" TEXT,
    "pushBody" TEXT,
    "cacheKeys" TEXT[],
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflicts" (
    "id" TEXT NOT NULL,
    "type" "ConflictType" NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'OPEN',
    "bookingId" TEXT NOT NULL,
    "details" JSONB,
    "resolvedById" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_emailVerificationTokenHash_key" ON "users"("emailVerificationTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "users_passwordResetTokenHash_key" ON "users"("passwordResetTokenHash");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");

-- CreateIndex
CREATE INDEX "beneficiaries_requesterId_idx" ON "beneficiaries"("requesterId");

-- CreateIndex
CREATE INDEX "beneficiaries_educationLevelId_idx" ON "beneficiaries"("educationLevelId");

-- CreateIndex
CREATE INDEX "education_levels_isActive_idx" ON "education_levels"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "education_levels_name_category_key" ON "education_levels"("name", "category");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_key" ON "subjects"("name");

-- CreateIndex
CREATE INDEX "subjects_isActive_idx" ON "subjects"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_profiles_userId_key" ON "tutor_profiles"("userId");

-- CreateIndex
CREATE INDEX "tutor_profiles_isVisible_idx" ON "tutor_profiles"("isVisible");

-- CreateIndex
CREATE INDEX "tutor_applications_tutorProfileId_idx" ON "tutor_applications"("tutorProfileId");

-- CreateIndex
CREATE INDEX "tutor_applications_status_idx" ON "tutor_applications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_documents_storagePath_key" ON "tutor_documents"("storagePath");

-- CreateIndex
CREATE INDEX "tutor_documents_tutorApplicationId_idx" ON "tutor_documents"("tutorApplicationId");

-- CreateIndex
CREATE INDEX "tutor_documents_status_idx" ON "tutor_documents"("status");

-- CreateIndex
CREATE INDEX "tutor_subjects_subjectId_idx" ON "tutor_subjects"("subjectId");

-- CreateIndex
CREATE INDEX "tutor_subjects_educationLevelId_idx" ON "tutor_subjects"("educationLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_subjects_tutorProfileId_subjectId_educationLevelId_key" ON "tutor_subjects"("tutorProfileId", "subjectId", "educationLevelId");

-- CreateIndex
CREATE INDEX "offers_tutorProfileId_idx" ON "offers"("tutorProfileId");

-- CreateIndex
CREATE INDEX "offers_subjectId_educationLevelId_idx" ON "offers"("subjectId", "educationLevelId");

-- CreateIndex
CREATE INDEX "offers_isActive_idx" ON "offers"("isActive");

-- CreateIndex
CREATE INDEX "places_tutorProfileId_idx" ON "places"("tutorProfileId");

-- CreateIndex
CREATE INDEX "places_isActive_idx" ON "places"("isActive");

-- CreateIndex
CREATE INDEX "availabilities_tutorProfileId_isActive_dayOfWeek_idx" ON "availabilities"("tutorProfileId", "isActive", "dayOfWeek");

-- CreateIndex
CREATE INDEX "availabilities_placeId_idx" ON "availabilities"("placeId");

-- CreateIndex
CREATE INDEX "availabilities_offerId_idx" ON "availabilities"("offerId");

-- CreateIndex
CREATE INDEX "blocked_periods_tutorProfileId_startAt_endAt_idx" ON "blocked_periods"("tutorProfileId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "bookings_requesterId_startAt_idx" ON "bookings"("requesterId", "startAt");

-- CreateIndex
CREATE INDEX "bookings_beneficiaryId_idx" ON "bookings"("beneficiaryId");

-- CreateIndex
CREATE INDEX "bookings_tutorProfileId_status_startAt_idx" ON "bookings"("tutorProfileId", "status", "startAt");

-- CreateIndex
CREATE INDEX "bookings_tutorProfileId_startAt_endAt_idx" ON "bookings"("tutorProfileId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "bookings_offerId_idx" ON "bookings"("offerId");

-- CreateIndex
CREATE INDEX "bookings_availabilityId_idx" ON "bookings"("availabilityId");

-- CreateIndex
CREATE INDEX "bookings_status_startAt_idx" ON "bookings"("status", "startAt");

-- CreateIndex
CREATE INDEX "booking_events_bookingId_createdAt_idx" ON "booking_events"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "conversations_requesterId_lastMessageAt_idx" ON "conversations"("requesterId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "conversations_tutorProfileId_lastMessageAt_idx" ON "conversations"("tutorProfileId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_requesterId_tutorProfileId_key" ON "conversations"("requesterId", "tutorProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_callSessionId_key" ON "messages"("callSessionId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversationId_clientMessageId_key" ON "messages"("conversationId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "message_attachments_messageId_key" ON "message_attachments"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "message_attachments_storagePath_key" ON "message_attachments"("storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "call_sessions_roomName_key" ON "call_sessions"("roomName");

-- CreateIndex
CREATE INDEX "call_sessions_conversationId_createdAt_idx" ON "call_sessions"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "call_sessions_bookingId_idx" ON "call_sessions"("bookingId");

-- CreateIndex
CREATE INDEX "call_sessions_status_ringingUntil_idx" ON "call_sessions"("status", "ringingUntil");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_bookingId_key" ON "reviews"("bookingId");

-- CreateIndex
CREATE INDEX "reviews_tutorProfileId_createdAt_idx" ON "reviews"("tutorProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "reviews_requesterId_idx" ON "reviews"("requesterId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "outbox_events_processedAt_createdAt_idx" ON "outbox_events"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "conflicts_status_createdAt_idx" ON "conflicts"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "conflicts_bookingId_type_key" ON "conflicts"("bookingId", "type");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_educationLevelId_fkey" FOREIGN KEY ("educationLevelId") REFERENCES "education_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_applications" ADD CONSTRAINT "tutor_applications_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_applications" ADD CONSTRAINT "tutor_applications_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_documents" ADD CONSTRAINT "tutor_documents_tutorApplicationId_fkey" FOREIGN KEY ("tutorApplicationId") REFERENCES "tutor_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_subjects" ADD CONSTRAINT "tutor_subjects_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_subjects" ADD CONSTRAINT "tutor_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_subjects" ADD CONSTRAINT "tutor_subjects_educationLevelId_fkey" FOREIGN KEY ("educationLevelId") REFERENCES "education_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_educationLevelId_fkey" FOREIGN KEY ("educationLevelId") REFERENCES "education_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_periods" ADD CONSTRAINT "blocked_periods_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "availabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "call_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflicts" ADD CONSTRAINT "conflicts_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflicts" ADD CONSTRAINT "conflicts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
