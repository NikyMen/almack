import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const zero = /^0+$/;
const blockedPath = /(^|\/)(?:\.env(?:\..+)?|\.wa-auth|node_modules|\.next)(?:\/|$)|^uploads\/|\.(?:db|sqlite|sqlite3|pem|key|p12|pfx)$/i;
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}\b/,
  /\b(?:APP_USR|TEST)-[A-Za-z0-9-]{25,}\b/,
];
const assignments = /\b(AUTH_SECRET|AUTH_PASSWORD|DEEPSEEK_API_KEY|GOOGLE_VISION_API_KEY|GEMINI_API_KEY|VISION_API_KEY|TURSO_AUTH_TOKEN|MP_ACCESS_TOKEN)\s*=\s*([^\s#]+)/g;

function git(...args) {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args[0]} falló`);
  return result.stdout;
}

function placeholder(value) {
  return /^(?:admin|\.\.\.|sk-\.\.\.|tu-token|tu_clave(?:_[\w-]+)?|cambia-este-secreto-largo-y-aleatorio|reemplazar-por-un-secreto-aleatorio-largo)$/i.test(value)
    || /^TEST-[x-]+$/i.test(value)
    || /^\$\{?[A-Z_]+\}?$/.test(value);
}

function check(path, contents, problems) {
  const normalized = path.replaceAll("\\", "/");
  if (blockedPath.test(normalized) && normalized !== ".env.example") {
    problems.push(`${path}: archivo sensible`);
    return;
  }
  if (contents.includes(0)) return; // Imágenes y otros binarios.
  const body = contents.toString("utf8");
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match && !placeholder(match[0])) problems.push(`${path}: posible secreto (${pattern.source.slice(0, 28)}…)`);
  }
  for (const match of body.matchAll(assignments)) {
    if (!placeholder(match[2])) problems.push(`${path}: valor de ${match[1]} incluido`);
  }
}

function scanWorkingTree(problems) {
  const paths = git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
  for (const path of paths) if (existsSync(path)) check(path, readFileSync(path), problems);
}

function scanOutgoing(input, problems) {
  const seen = new Set();
  for (const line of input.trim().split(/\r?\n/).filter(Boolean)) {
    const [, localSha, , remoteSha] = line.split(" ");
    if (!localSha || zero.test(localSha)) continue;
    const revisions = remoteSha && !zero.test(remoteSha)
      ? [localSha, `^${remoteSha}`]
      : [localSha, "--not", "--remotes"];
    const objects = git("rev-list", "--objects", ...revisions);
    for (const entry of objects.split(/\r?\n/).filter(Boolean)) {
      const space = entry.indexOf(" ");
      if (space < 0) continue;
      const sha = entry.slice(0, space);
      const path = entry.slice(space + 1);
      if (seen.has(sha)) continue;
      seen.add(sha);
      if (git("cat-file", "-t", sha).trim() !== "blob") continue;
      const blob = spawnSync("git", ["cat-file", "blob", sha], { maxBuffer: 64 * 1024 * 1024 });
      if (blob.status !== 0) throw new Error(`No se pudo leer el objeto ${sha}`);
      check(path, blob.stdout, problems);
    }
  }
}

const problems = [];
try {
  if (process.argv.includes("--working-tree")) {
    scanWorkingTree(problems);
  } else {
    const input = readFileSync(0, "utf8");
    scanOutgoing(input, problems);
  }
} catch (error) {
  console.error(`No se pudo completar el control de secretos: ${error.message}`);
  process.exit(1);
}
if (problems.length) {
  console.error("Push bloqueado por posibles secretos o archivos sensibles:\n" + [...new Set(problems)].join("\n"));
  process.exit(1);
}
console.log("Control de secretos y archivos sensibles: OK");
