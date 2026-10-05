import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";

const file = `stock-import-test-${randomUUID()}.db`;
const env = { ...process.env, TURSO_DATABASE_URL: `file:${file}` };
delete env.TURSO_AUTH_TOKEN;
const test = spawnSync(process.execPath, ["--import", "tsx", "scripts/test-stock-import.mjs"], { env, stdio: "inherit" });
for (const suffix of ["", "-wal", "-shm", "-journal"]) if (existsSync(file + suffix)) unlinkSync(file + suffix);
process.exitCode = test.status ?? 1;
