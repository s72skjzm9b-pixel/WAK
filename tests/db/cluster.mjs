// Starts a throw-away PostgreSQL cluster, loads the Supabase shim and all
// migrations, and returns a pg Pool connected as superuser.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

const PG_BIN = process.env.PG_BIN ?? findPgBin();
const PORT = Number(process.env.WAK_TEST_PG_PORT ?? 54329);
const ROOT = path.resolve(import.meta.dirname, "../..");

function findPgBin() {
  for (const v of ["17", "16", "15"]) {
    const p = `/usr/lib/postgresql/${v}/bin`;
    try { readdirSync(p); return p; } catch {}
  }
  return ""; // rely on PATH
}

const isRoot = process.getuid?.() === 0;
function run(cmd, args, opts = {}) {
  const bin = PG_BIN ? path.join(PG_BIN, cmd) : cmd;
  return isRoot
    ? execFileSync("runuser", ["-u", "postgres", "--", bin, ...args], opts)
    : execFileSync(bin, args, opts);
}

export async function startCluster() {
  const dir = mkdtempSync(path.join(tmpdir(), "wak-pg-"));
  chmodSync(dir, 0o777);
  const data = path.join(dir, "data");
  run("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C"], { stdio: "ignore" });
  const bin = PG_BIN ? path.join(PG_BIN, "postgres") : "postgres";
  const args = ["-D", data, "-p", String(PORT), "-k", dir, "-c", "listen_addresses=127.0.0.1", "-c", "fsync=off"];
  const proc = isRoot
    ? spawn("runuser", ["-u", "postgres", "--", bin, ...args], { stdio: "ignore" })
    : spawn(bin, args, { stdio: "ignore" });

  const pool = new pg.Pool({ host: "127.0.0.1", port: PORT, user: "postgres", database: "postgres", max: 20 });
  for (let i = 0; i < 100; i++) {
    try { await pool.query("select 1"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }

  await pool.query(readFileSync(path.join(ROOT, "tests/db/supabase-shim.sql"), "utf8"));
  const migDir = path.join(ROOT, "supabase/migrations");
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await pool.query(readFileSync(path.join(migDir, f), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${e.message}`);
    }
  }

  async function stop() {
    await pool.end();
    const exited = new Promise((r) => (proc.exitCode !== null ? r() : proc.on("exit", r)));
    try { run("pg_ctl", ["-D", data, "-m", "immediate", "stop"], { stdio: "ignore" }); } catch {}
    await exited;
    rmSync(dir, { recursive: true, force: true });
  }
  return { pool, stop, port: PORT };
}
