// Measures the balance (ADR 0020, 0021) over many runs of the real server
// code, each on its own scratch database, a few at a time:
//
//   node scripts/balance/index.ts <runs> <extras an hour> <scenario>
//
// Scenarios: quiet (2 launches an hour for 12 hours), crit (60 in an hour),
// busy (10 an hour for 12 hours), watched (a quiet sky with someone
// watching). `extras an hour` is EXTRAS_PER_HOUR: 0 for none, 0.6 by
// default. Prints the runs' averages. Slow: a run is a few seconds, a
// watched one longer.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";

const SCENARIOS: Record<string, string[]> = {
  quiet: ["2", "12"],
  crit: ["60", "1", "burst"],
  busy: ["10", "12"],
  watched: ["2", "8", "watched"],
};
const [runs, extras, scenario] = [Number(process.argv[2] ?? 8), process.argv[3] ?? "0.6", process.argv[4] ?? "quiet"];
if (!SCENARIOS[scenario]) throw new Error(`no scenario "${scenario}": pick one of ${Object.keys(SCENARIOS).join(", ")}`);

function run(): Promise<Record<string, unknown>> {
  const dir = mkdtempSync(join(tmpdir(), "kessler-balance-"));
  const env = { ...process.env, DATABASE_PATH: join(dir, "app.db"), EXTRAS_PER_HOUR: extras };
  return new Promise((resolve, reject) => {
    const migrate = spawn(process.execPath, ["scripts/migrate.mjs"], { env, stdio: "ignore" });
    migrate.on("exit", () => {
      let out = "";
      const child = spawn(process.execPath, ["scripts/balance/run.ts", ...SCENARIOS[scenario]], { env, stdio: ["ignore", "pipe", "ignore"] });
      child.stdout.on("data", (chunk) => (out += chunk));
      child.on("exit", (code) => {
        rmSync(dir, { recursive: true, force: true });
        const line = out.split("\n").find((l) => l.startsWith("{"));
        if (code !== 0 || !line) reject(new Error(`a run failed (exit ${code})`));
        else resolve(JSON.parse(line));
      });
    });
  });
}

const results: Record<string, unknown>[] = [];
let started = 0;
async function worker(): Promise<void> {
  while (started < runs) {
    started++;
    results.push(await run());
  }
}
await Promise.all(Array.from({ length: Math.min(runs, availableParallelism()) }, worker));

// the average of every number in the results, nested ones too
const mean = (values: unknown[]): unknown =>
  typeof values[0] === "number"
    ? Number(((values as number[]).reduce((sum, x) => sum + x, 0) / values.length).toFixed(3))
    : Object.fromEntries(Object.keys(values[0] as object).map((key) => [key, mean(values.map((v) => (v as Record<string, unknown>)[key]))]));
console.log(JSON.stringify({ scenario, extras, runs: results.length, mean: mean(results) }));
