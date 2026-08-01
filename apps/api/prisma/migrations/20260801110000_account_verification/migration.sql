-- Existing accounts predate verification and remain usable after this migration.
ALTER TABLE "users"
ADD COLUMN "email_verified_at" TIMESTAMPTZ(3);

UPDATE "users"
SET "email_verified_at" = "created_at"
WHERE "email_verified_at" IS NULL;

CREATE TABLE "email_verification_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "dispatched_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_verification_attempt_count_check"
      CHECK ("attempt_count" >= 0)
);

CREATE INDEX "email_verification_user_created_id_idx"
ON "email_verification_challenges"("user_id", "created_at", "id");

CREATE INDEX "email_verification_expiry_idx"
ON "email_verification_challenges"("expires_at");

ALTER TABLE "email_verification_challenges"
ADD CONSTRAINT "email_verification_challenges_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
