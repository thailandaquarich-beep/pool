ALTER TABLE "instructor_availability"
ADD COLUMN IF NOT EXISTS "package_id" integer REFERENCES "membership_packages"("id") ON DELETE SET NULL;
