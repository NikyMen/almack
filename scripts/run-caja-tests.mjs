import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
const file = `caja-test-${randomUUID()}.db`;
const env = { ...process.env, TURSO_DATABASE_URL: `file:${file}` };
delete env.TURSO_AUTH_TOKEN;
const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test-caja-flow.mjs'], {env, stdio:'inherit'});
for (const path of [file, `${file}-wal`, `${file}-shm`]) if (existsSync(path)) unlinkSync(path);
process.exitCode = run.status ?? 1;
