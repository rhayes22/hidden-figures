import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Fail fast with a clear message when DATABASE_URL is missing — except during
// `next build`, which imports this module to collect routes but never queries,
// so the URL can legitimately be absent then (NEXT_PHASE is set by Next).
if (
  !process.env.DATABASE_URL &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env (see docs/PROJECT.md).",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
