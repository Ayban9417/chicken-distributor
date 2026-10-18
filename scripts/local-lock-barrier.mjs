import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const container = "supabase_db_chicken-distribution-workflow-prototype";
const tables = new Set(["stock_trips", "inventory_lots", "receiving_receipts", "sales", "payments", "daily_cash_reports", "payroll_periods"]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function blockedSessions(holderPid = 0) {
  const { stdout } = await execFileAsync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-Atqc",
    `select count(*), count(*) filter (where ${holderPid} = any(pg_blocking_pids(pid))) from pg_stat_activity where datname = 'postgres' and wait_event_type = 'Lock'`],
  { timeout: 5000 });
  const [total, byHolder] = stdout.trim().split("|").map(Number);
  return { total, byHolder };
}

export async function withRowLockBarrier(table, id, label, operations) {
  assert.equal(process.env.LOCAL_SUPABASE_URL, "http://127.0.0.1:54321", "Lock barriers require isolated local Supabase");
  assert(tables.has(table), "Unexpected lock-barrier table");
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i, "Unexpected lock-barrier ID");
  assert.equal(operations.length, 2, "A lock barrier requires two competing operations");

  const baseline = await blockedSessions();
  const lock = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"],
    { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let errors = "";
  lock.stdout.on("data", (chunk) => { output += chunk.toString(); });
  lock.stderr.on("data", (chunk) => { errors += chunk.toString(); });
  lock.stdin.write(`begin; select pg_backend_pid() from public.${table} where id = '${id}' for update; \\echo LOCK_HELD\n`);
  try {
    for (let attempt = 0; !output.includes("LOCK_HELD"); attempt++) {
      if (attempt >= 100 || lock.exitCode !== null) throw new Error(`Could not hold ${label} lock: ${errors}`);
      await sleep(50);
    }
    const holderPid = Number(output.match(/^(\d+)\r?$/m)?.[1]);
    assert(Number.isInteger(holderPid) && holderPid > 0, `${label}: missing lock-holder PID`);
    const pending = operations.map((operation) => Promise.resolve().then(operation));
    let observed = { total: 0, byHolder: 0 };
    for (let attempt = 0; attempt < 100; attempt++) {
      observed = await blockedSessions(holderPid);
      if (observed.total >= baseline.total + 2 && observed.byHolder >= 1) break;
      await sleep(50);
    }
    lock.stdin.end("commit;\n");
    const results = await Promise.allSettled(pending);
    assert(observed.total >= baseline.total + 2 && observed.byHolder >= 1,
      `${label}: expected two lock waits including the held row (saw ${observed.total - baseline.total} waits, ${observed.byHolder} by holder)`);
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
    }
    const values = results.map((result) => result.value);
    console.log(`${label}: two sessions waited, ${observed.byHolder} blocked by ${table} holder, released; outcomes ${values.map((value) => value.status ?? (value.error ? "RPC error" : "RPC success")).join(" / ")}`);
    return values;
  } finally {
    if (!lock.stdin.destroyed) lock.stdin.end("rollback;\n");
    if (lock.exitCode === null) {
      const exited = new Promise((resolve) => lock.once("exit", resolve));
      await Promise.race([exited, sleep(2000)]);
    }
    if (lock.exitCode === null) lock.kill();
  }
}
