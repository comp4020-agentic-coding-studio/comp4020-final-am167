import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.ts";

// /data is the Fly volume: the only storage that survives restarts and deploys.
// The tables are made by scripts/migrate.mjs, which runs before the server.
const sqlite = new Database(process.env.DATABASE_PATH ?? "./data/app.db", { fileMustExist: true });
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
export { schema };
