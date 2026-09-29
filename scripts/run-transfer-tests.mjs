import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";

const file = `transfer-test-${randomUUID()}.db`;
const env = { ...process.env, TURSO_DATABASE_URL: `file:${file}` };
delete env.TURSO_AUTH_TOKEN;
const test = spawnSync(process.execPath, ["--import", "tsx", "scripts/test-transfer-flow.mjs"], {
  env, encoding: "utf8", stdio: "inherit",
});
if (existsSync(file)) unlinkSync(file);
process.exitCode = test.status ?? 1;
