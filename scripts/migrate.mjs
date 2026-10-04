// Runs the database migrations in drizzle/, before the server starts: on Fly
// that's on the machine that holds the /data volume (ADR 0001).
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const path = process.env.DATABASE_PATH ?? "./data/app.db";
mkdirSync(dirname(path), { recursive: true });
const sqlite = new Database(path);
migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
sqlite.close();
