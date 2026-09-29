import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.ts";

// /data is the Fly volume: the only storage that survives restarts and deploys.
const path = process.env.DATABASE_PATH ?? "./data/app.db";
mkdirSync(dirname(path), { recursive: true });

const sqlite = new Database(path);
sqlite.pragma("journal_mode = WAL");
sqlite.exec(`CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);

export const db = drizzle(sqlite, { schema });
export { schema };
