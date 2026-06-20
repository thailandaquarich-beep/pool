// Applies a .sql migration file using DATABASE_URL. Usage: node _apply_migration.mjs <file>
import pg from "pg";
import { readFileSync } from "node:fs";
const file = process.argv[2] || "migrations/0001_instructor_availability.sql";
const sql = readFileSync(new URL(file, import.meta.url), "utf8");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(sql);
const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='instructors' AND column_name='user_id'");
const tbl = await c.query("SELECT to_regclass('public.instructor_availability') AS t");
console.log("instructors.user_id present:", cols.rowCount === 1, "| instructor_availability:", tbl.rows[0].t);
await c.end();
