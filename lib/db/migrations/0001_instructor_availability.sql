-- Instructor availability + instructor login link. Idempotent.
DO $$ BEGIN
  CREATE TYPE availability_kind AS ENUM ('weekly','date');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS instructor_availability (
  id serial PRIMARY KEY,
  instructor_id integer NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  kind availability_kind NOT NULL,
  day_of_week integer,
  date date,
  start_time text NOT NULL,
  end_time text NOT NULL,
  note text,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE instructors ADD COLUMN IF NOT EXISTS user_id integer;
