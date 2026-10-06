import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// The app's tables. `pnpm db:generate` turns changes here into a migration
// under drizzle/, which runs when the server boots.

// Every object that has ever been in the sky, kept forever (ADR 0003). The
// live sky is the rows whose fate is `live`; the catalogue is all of them.
// A satellite is launched by a person; a derelict is a dead satellite the
// server keeps in the sky so it's never empty; debris comes from a
// collision (ADR 0008).
export const objects = sqliteTable(
  "objects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: ["satellite", "derelict", "debris"] }).notNull(),
    // the person cookie that launched it (ADR 0009); never sent to clients.
    // A person can have any number up, a gap apart (src/lib/sky.ts)
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
    // 1 prograde, -1 retrograde (ADR 0008); everything before was prograde
    direction: integer("direction").notNull().default(1),
    // for debris, the collision it came from: its lineage (ADR 0003)
    sourceCollision: integer("source_collision"),
    // the operator it belongs to, once its person has claimed or signed in
    // to one (ADR 0009); until then it's the owner cookie's
    operator: integer("operator"),
    fate: text("fate", { enum: ["live", "decayed", "deorbited", "destroyed"] })
      .notNull()
      .default("live"),
    fateAt: integer("fate_at"),
  },
  (t) => [
    index("objects_fate").on(t.fate),
    index("objects_owner").on(t.owner),
    index("objects_source_collision").on(t.sourceCollision),
    index("objects_operator").on(t.operator),
  ],
);

// Operators (ADR 0009): a handle anyone can claim, with a passphrase, so a
// person's satellites (and the blame for them) follow them across devices.
// No email, no real names: the passphrase is kept only as an scrypt hash.
export const operators = sqliteTable(
  "operators",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    handle: text("handle").notNull(),
    // lowercased, so a handle is taken whatever its case
    handleKey: text("handle_key").notNull(),
    salt: text("salt").notNull(),
    hash: text("hash").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("operators_handle_key").on(t.handleKey)],
);

// Which operator each person (cookie) is signed in as, if any.
export const people = sqliteTable("people", {
  person: text("person").primaryKey(),
  operator: integer("operator").notNull(),
});

// Every collision, kept forever (ADR 0003, 0008): when, which two objects,
// and where (angle and height, in planet radii). Its fragments point back
// here through objects.source_collision.
export const collisions = sqliteTable(
  "collisions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: integer("at").notNull(),
    a: integer("a").notNull(),
    b: integer("b").notNull(),
    angle: real("angle").notNull(),
    radius: real("radius").notNull(),
  },
  (t) => [index("collisions_at").on(t.at), uniqueIndex("collisions_pair").on(t.a, t.b)],
);
