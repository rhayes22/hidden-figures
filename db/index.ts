import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// No DATABASE_URL check at import time: page modules import this during
// `next build` (where no database exists) and pg only needs the URL when a
// query actually runs.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
