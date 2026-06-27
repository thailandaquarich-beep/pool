CREATE TABLE IF NOT EXISTS "member_package_events" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "member_package_id" integer REFERENCES "member_packages"("id") ON DELETE set null,
  "admin_id" integer REFERENCES "users"("id") ON DELETE set null,
  "event_type" text NOT NULL,
  "note" text,
  "before_json" text,
  "after_json" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "branch_id" integer DEFAULT 1
);

CREATE INDEX IF NOT EXISTS "member_package_events_user_id_idx" ON "member_package_events" ("user_id");
CREATE INDEX IF NOT EXISTS "member_package_events_member_package_id_idx" ON "member_package_events" ("member_package_id");
CREATE INDEX IF NOT EXISTS "member_package_events_created_at_idx" ON "member_package_events" ("created_at");
