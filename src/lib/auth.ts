import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios, sucursales } from "@/db/schema";
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
const SESSION_MS = 8 * 60 * 60 * 1000;

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("hex");
}

type Sesion = { usuario: string; sucursalId: number | null };

function makeToken(user: string, sucursalId: number): string {
  const payload = JSON.stringify({ usuario: user, sucursalId, emitido: Date.now() });
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

function verificarSesion(token: string | undefined): Sesion | null {
  if (!token) return null;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, "base64url").toString();
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let usuario: string;
  let sucursalId: number | null = null;
  let emitido: number;
  try {
    const data = JSON.parse(payload);
    usuario = data.usuario;
    sucursalId = data.sucursalId;
    emitido = data.emitido;
  } catch {
    // Las sesiones anteriores siguen sirviendo para admins. Los miembros deben
    // volver a ingresar para elegir sucursal y obtener una sesión nueva.
    const separador = payload.lastIndexOf(".");
    if (separador <= 0) return null;
    usuario = payload.slice(0, separador);
    emitido = Number(payload.slice(separador + 1));
  }
  if (typeof usuario !== "string" || !usuario || (sucursalId !== null && (!Number.isSafeInteger(sucursalId) || sucursalId <= 0))) return null;
  if (!Number.isSafeInteger(emitido) || emitido > Date.now() + 60_000 || Date.now() - emitido > SESSION_MS) return null;
  return { usuario, sucursalId };
}

export function verifyToken(token: string | undefined): string | null {
  return verificarSesion(token)?.usuario ?? null;
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

// El administrador configurado por entorno es la credencial autoritativa de
// recuperación. El resto de los usuarios se valida contra la base.
export async function checkCredentials(user: string, pass: string): Promise<boolean> {
  // La base puede estar pendiente de migración; en ese caso todavía debe
  // funcionar el usuario bootstrap configurado por entorno.
  let u: typeof usuarios.$inferSelect | undefined;
  try {
    [u] = await db.select().from(usuarios).where(eq(usuarios.usuario, user));
  } catch {
    u = undefined;
  }
  if (u && !u.activo) return false;
  if (user === USER && (!u || u.rol === "admin")) return pass === PASS;
  if (u && verifyPassword(pass, u.passwordHash)) return true;
  return false;
}

export async function createSession(user: string, sucursalId: number) {
  const store = await cookies();
  store.set(COOKIE, makeToken(user, sucursalId), {
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
  const store = await cookies();
  const sesion = verificarSesion(store.get(COOKIE)?.value);
  if (!sesion) return null;
  const handle = sesion.usuario;
  let u: typeof usuarios.$inferSelect | undefined;
  try {
    [u] = await db.select().from(usuarios).where(eq(usuarios.usuario, handle));
  } catch {
    u = undefined;
  }
  if (u) {
    if (!u.activo) return null;
    if (u.rol !== "admin" && !sesion.sucursalId) return null;
    if (u.rol !== "admin") {
      const [activa] = await db.select({ id: sucursales.id }).from(sucursales)
        .where(and(eq(sucursales.id, sesion.sucursalId!), eq(sucursales.activo, true)));
      if (!activa) return null;
    }
    return {
      id: u.id,
      nombre: u.nombre,
      usuario: u.usuario,
      rol: u.rol,
      sucursalId: u.rol === "admin" ? null : sesion.sucursalId,
      permisos: parsePermisos(u.permisos),
    };
  }
  if (handle === USER) {
    return {
      id: 0,
      nombre: "Administrador",
      usuario: handle,
      rol: "admin",
      sucursalId: null,
      permisos: MODULOS.map((m) => m.key),
    };
  }
  return null;
}

// Guard para usar al inicio de las páginas del route group (app).
export async function requireAcceso(modulo: ModuloKey): Promise<UsuarioActual> {
  const u = await getUsuarioActual();
  if (!u) redirect("/admin/login");
  if (u.rol !== "admin") {
    if (!u.sucursalId) notFound();
    const [sucursal] = await db.select({ id: sucursales.id }).from(sucursales).where(and(eq(sucursales.id, u.sucursalId), eq(sucursales.activo, true)));
    if (!sucursal) notFound();
  }
  if (!tieneAcceso(u, modulo)) redirect(primerModuloPermitido(u));
  return u;
}

export async function requireAdmin(): Promise<UsuarioActual> {
  const u = await getUsuarioActual();
  if (!u) redirect("/admin/login");
  if (u.rol !== "admin") redirect(primerModuloPermitido(u));
  return u;
}

// La carga de inventario pertenece a Stock; se conserva el acceso de Compras.
export async function requireCargaStock(): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  return requireAcceso(tieneAcceso(usuario, "stock") ? "stock" : "compras");
}
