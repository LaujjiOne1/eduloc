-- Alarme de cours : préférence par compte + marqueurs d'envoi par séance (un rappel par partie).
ALTER TABLE "users" ADD COLUMN "lessonAlarmEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "lessonAlarmLeadMinutes" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "users" ADD CONSTRAINT "users_lesson_alarm_lead_check" CHECK ("lessonAlarmLeadMinutes" IN (10, 15, 30, 60));
ALTER TABLE "bookings" ADD COLUMN "requesterRemindedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "tutorRemindedAt" TIMESTAMP(3);
CREATE INDEX "bookings_reminder_idx" ON "bookings"("startAt") WHERE "status" = 'CONFIRMED';
