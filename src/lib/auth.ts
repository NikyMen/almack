import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import {
  MODULOS,
  parsePermisos,
  primerModuloPermitido,
  tieneAcceso,
  type ModuloKey,
  type UsuarioActual,
} from "@/lib/permisos";

export const COOKIE = "gestoria_session";
const SECRET = process.env.AUTH_SECRET || "gestoria-dev-secret-cambia-esto";

// Credenciales del admin por entorno (respaldo/bootstrap del login DB)
const USER = process.env.AUTH_USER || "admin";
const PASS = process.env.AUTH_PASSWORD || "admin";

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("hex");
}

function makeToken(user: string): string {
  const payload = `${user}.${Date.now()}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, "base64url").toString();
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return payload.split(".")[0] || null;
}

// --- Hash de contraseñas (scrypt nativo, sin dependencias) ------------------
export function hashPassword(pass: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pass, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pass: string, stored: string): boolean {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(pass, salt, 64);
  const orig = Buffer.from(hash, "hex");
  if (test.length !== orig.length) return false;
  return timingSafeEqual(test, orig);
}

// En producción no se aceptan las credenciales por defecto: hay que definir
// AUTH_USER, AUTH_PASSWORD y AUTH_SECRET en el entorno del servidor.
export function credencialesConfiguradas(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(process.env.AUTH_PASSWORD && process.env.AUTH_SECRET);
}

// Verifica primero contra la tabla usuarios; cae al admin por env como respaldo.
export async function checkCredentials(user: string, pass: string): Promise<boolean> {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.usuario, user));
  if (u && u.activo && verifyPassword(pass, u.passwordHash)) return true;
  // Respaldo: admin por entorno (sólo si no hay un usuario DB con ese handle)
  if (!u && user === USER && pass === PASS) return true;
  return false;
}

export async function createSession(user: string) {
  const store = await cookies();
  store.set(COOKIE, makeToken(user), {
    httpOnly: true,
    sameSite: "lax",
    // secure sólo cuando servís por HTTPS. Si entrás por http://IP:puerto sin
    // TLS, dejá COOKIE_SECURE sin definir (o "false") o el navegador descarta la
    // cookie y te pide login en cada navegación. Con nginx+HTTPS poné "true".
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 horas
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getUser(): Promise<string | null> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE)?.value);
}

// Carga el usuario en sesión con su rol y permisos. Si el handle es el admin por
// env y no existe en DB, devuelve un admin sintético con todos los permisos.
export async function getUsuarioActual(): Promise<UsuarioActual | null> {
  const handle = await getUser();
  if (!handle) return null;
  const [u] = await db.select().from(usuarios).where(eq(usuarios.usuario, handle));
  if (u) {
    if (!u.activo) return null;
    return {
      id: u.id,
      nombre: u.nombre,
      usuario: u.usuario,
      rol: u.rol,
      permisos: parsePermisos(u.permisos),
    };
  }
  if (handle === USER) {
    return {
      id: 0,
      nombre: "Administrador",
      usuario: handle,
      rol: "admin",
      permisos: MODULOS.map((m) => m.key),
    };
  }
  return null;
}

// Guard para usar al inicio de las páginas del route group (app).
export async function requireAcceso(modulo: ModuloKey): Promise<UsuarioActual> {
  const u = await getUsuarioActual();
  if (!u) redirect("/login");
  if (!tieneAcceso(u, modulo)) redirect(primerModuloPermitido(u));
  return u;
}

export async function requireAdmin(): Promise<UsuarioActual> {
  const u = await getUsuarioActual();
  if (!u) redirect("/login");
  if (u.rol !== "admin") redirect(primerModuloPermitido(u));
  return u;
}
