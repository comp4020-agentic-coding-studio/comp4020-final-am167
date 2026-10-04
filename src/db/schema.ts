import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// The app's tables. `pnpm db:generate` turns changes here into a migration
// under drizzle/, which runs when the server boots.

// Every object that has ever been in the sky, kept forever (ADR 0003). The
// live sky is the rows whose fate is `live`; the catalogue is all of them.
// Debris and its lineage arrive with collisions in C9.
export const objects = sqliteTable(
  "objects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: ["satellite", "debris"] }).notNull(),
    // the person cookie that launched it (ADR 0002); never sent to clients
    owner: text("owner"),
    callsign: text("callsign"),
    beacon: text("beacon"),
    band: text("band", { enum: ["low", "mid", "high"] }).notNull(),
    launchedAt: integer("launched_at").notNull(),
    // the orbit (src/lib/orbit.ts): position is a pure function of these
    // and the server's time
    radius: real("radius").notNull(),
    phase: real("phase").notNull(),
    period: integer("period").notNull(),
    epoch: integer("epoch").notNull(),
    fate: text("fate", { enum: ["live", "decayed", "deorbited", "destroyed"] })
      .notNull()
      .default("live"),
    fateAt: integer("fate_at"),
  },
  (t) => [
    index("objects_fate").on(t.fate),
    index("objects_owner").on(t.owner),
    // one live satellite per person (ADR 0002), enforced by the database too
    uniqueIndex("objects_one_live_per_owner")
      .on(t.owner)
      .where(sql`${t.fate} = 'live' AND ${t.owner} IS NOT NULL`),
  ],
);
