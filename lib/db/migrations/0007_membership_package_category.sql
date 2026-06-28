ALTER TABLE "membership_packages"
ADD COLUMN IF NOT EXISTS "category" text;
