-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('medical', 'fire', 'crime', 'accident');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('new', 'triaged', 'assigned', 'active', 'resolved', 'false_alarm', 'cancelled');

-- CreateEnum
CREATE TYPE "IncidentSource" AS ENUM ('ussd', 'app', 'web', 'sms');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "ResponderStatus" AS ENUM ('available', 'busy', 'off_duty');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('caller', 'responder', 'coordinator', 'admin');

-- CreateEnum
CREATE TYPE "IncidentResponderStatus" AS ENUM ('assigned', 'accepted', 'declined', 'en_route', 'on_scene', 'resolved');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'caller',
    "savedLocations" JSONB,
    "verifiedPhone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "IncidentType" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'new',
    "callerPhone" TEXT,
    "callerUserId" TEXT,
    "source" "IncidentSource" NOT NULL,
    "locationText" TEXT,
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "locationConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "aiTriageScore" INTEGER,
    "aiSeverity" "Severity",
    "aiPriorityReason" TEXT,
    "aiExtractedLocation" TEXT,
    "transcriptFull" TEXT,
    "transcriptSummary" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Responder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skills" TEXT[],
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "availabilityRadiusKm" INTEGER NOT NULL DEFAULT 5,
    "status" "ResponderStatus" NOT NULL DEFAULT 'off_duty',
    "currentLat" DOUBLE PRECISION,
    "currentLng" DOUBLE PRECISION,
    "lastLocationUpdate" TIMESTAMP(3),
    "totalResponses" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" DOUBLE PRECISION,

    CONSTRAINT "Responder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentResponder" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "status" "IncidentResponderStatus" NOT NULL DEFAULT 'assigned',
    "etaMinutes" INTEGER,

    CONSTRAINT "IncidentResponder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "initiatedBy" TEXT,
    "callerNumber" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "recordingUrl" TEXT,
    "transcriptRaw" TEXT,
    "transcriptProcessed" TEXT,
    "aiLocationExtracted" TEXT,
    "aiDetailsExtracted" JSONB,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UssdSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "incidentId" TEXT,
    "borrowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UssdSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Incident_status_createdAt_idx" ON "Incident"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Incident_type_idx" ON "Incident"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Responder_userId_key" ON "Responder"("userId");

-- CreateIndex
CREATE INDEX "Responder_status_idx" ON "Responder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentResponder_incidentId_responderId_key" ON "IncidentResponder"("incidentId", "responderId");

-- CreateIndex
CREATE UNIQUE INDEX "UssdSession_sessionId_key" ON "UssdSession"("sessionId");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_callerUserId_fkey" FOREIGN KEY ("callerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Responder" ADD CONSTRAINT "Responder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentResponder" ADD CONSTRAINT "IncidentResponder_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentResponder" ADD CONSTRAINT "IncidentResponder_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "Responder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
