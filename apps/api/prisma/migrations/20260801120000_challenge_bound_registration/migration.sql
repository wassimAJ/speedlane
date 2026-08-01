-- Historical challenges did not bind candidates to a browser. Invalidate and
-- scrub them; never copy current user credentials into challenge history.
ALTER TABLE "email_verification_challenges"
ADD COLUMN "pending_token_hash" VARCHAR(64),
ADD COLUMN "pending_registration_id" UUID,
ADD COLUMN "candidate_display_name" VARCHAR(120),
ADD COLUMN "candidate_password_hash" VARCHAR(255),
ADD COLUMN "scheduled_at" TIMESTAMPTZ(3),
ADD COLUMN "delivery_failed_at" TIMESTAMPTZ(3),
ALTER COLUMN "code_hash" DROP NOT NULL;

UPDATE "email_verification_challenges"
SET
  "code_hash" = NULL,
  "pending_token_hash" = NULL,
  "candidate_display_name" = NULL,
  "candidate_password_hash" = NULL,
  "scheduled_at" = COALESCE("created_at", CURRENT_TIMESTAMP),
  "invalidated_at" = COALESCE("invalidated_at", CURRENT_TIMESTAMP);

ALTER TABLE "email_verification_challenges"
ALTER COLUMN "scheduled_at" SET NOT NULL;

CREATE TABLE "pending_registrations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "candidate_display_name" VARCHAR(120) NOT NULL,
    "candidate_password_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pending_registrations_user_id_key" UNIQUE ("user_id")
);

CREATE INDEX "pending_registrations_expiry_idx"
ON "pending_registrations"("expires_at");

CREATE INDEX "email_verification_pending_registration_idx"
ON "email_verification_challenges"("pending_registration_id");

ALTER TABLE "pending_registrations"
ADD CONSTRAINT "pending_registrations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_verification_challenges"
ADD CONSTRAINT "email_verification_challenges_pending_registration_id_fkey"
FOREIGN KEY ("pending_registration_id") REFERENCES "pending_registrations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
