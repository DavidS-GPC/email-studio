-- Allow encrypted values in Contact.email and add deterministic hash for lookup/uniqueness.
DROP INDEX IF EXISTS "Contact_email_key";
ALTER TABLE "Contact" ADD COLUMN "emailHash" TEXT;
CREATE UNIQUE INDEX "Contact_emailHash_key" ON "Contact"("emailHash");
