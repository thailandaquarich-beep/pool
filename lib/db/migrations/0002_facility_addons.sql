-- Facility add-on packages (แพ็คเกจเสริม): members can buy a service directly
-- from the Other Services page, paid from their wallet. Idempotent.

ALTER TABLE facilities ADD COLUMN IF NOT EXISTS is_purchasable boolean NOT NULL DEFAULT false;
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS price numeric(10,2);

CREATE TABLE IF NOT EXISTS member_addons (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  facility_id integer NOT NULL REFERENCES facilities(id),
  name text NOT NULL,
  price_paid numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
