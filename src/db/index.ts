import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.ts";

// /data is the Fly volume: the only storage that survives restarts and deploys.
const path = process.env.DATABASE_PATH ?? "./data/app.db";
mkdirSync(dirname(path), { recursive: true });

const sqlite = new Database(path);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

// Migrations run at boot, not as a Fly release_command, which runs on a
// temporary machine without the volume (ADR 0001).
migrate(db, { migrationsFolder: process.env.MIGRATIONS_PATH ?? "./drizzle" });

export { schema };
