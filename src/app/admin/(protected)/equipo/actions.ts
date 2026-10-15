"use server";

import { hashClaveAdministrador } from "@/lib/clave-admin";
import { cajaSeguridad } from "@/db/schema";
import { db } from "@/db";
import { usuarios, waContactos, sucursales } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { MODULOS } from "@/lib/permisos";

export type UsuarioInput = {
  nombre: string;
  usuario: string;
  email: string;
  rol: "admin" | "miembro";
  sucursalId: number | null;
  permisos: string[];
  activo: boolean;
  password?: string;
};

const MODULO_KEYS = MODULOS.map((m) => m.key) as string[];

function limpiar(input: UsuarioInput) {
  return {
    nombre: input.nombre.trim(),
    usuario: input.usuario.trim().toLowerCase(),
    email: input.email.trim(),
    rol: input.rol === "admin" ? "admin" : "miembro",
    sucursalId: input.rol === "admin" ? null : Number(input.sucursalId) || null,
    permisos: input.permisos.filter((p) => MODULO_KEYS.includes(p)),
    activo: Boolean(input.activo),
  };
}

async function sucursalValida(id: number | null) {
  if (!id) return false;
  const [s] = await db.select().from(sucursales).where(eq(sucursales.id, id));
  return Boolean(s?.activo);
}

export async function crearUsuario(input: UsuarioInput) {
  await requireAdmin();
  const d = limpiar(input);
  if (!d.nombre || !d.usuario) return { ok: false as const, error: "Completá nombre y usuario." };
  if (d.rol === "miembro" && !await sucursalValida(d.sucursalId)) return { ok: false as const, error: "Elegí una sucursal activa para el miembro." };
  if (!input.password || input.password.length < 4)
    return { ok: false as const, error: "La contraseña debe tener al menos 4 caracteres." };

  const [existe] = await db.select().from(usuarios).where(eq(usuarios.usuario, d.usuario));
  if (existe) return { ok: false as const, error: "Ya existe un usuario con ese nombre de acceso." };

  await db.insert(usuarios).values({
    nombre: d.nombre,
    usuario: d.usuario,
    email: d.email,
    passwordHash: hashPassword(input.password),
    rol: d.rol,
    sucursalId: d.sucursalId,
    permisos: JSON.stringify(d.permisos),
    activo: d.activo,
  });
  revalidatePath("/equipo");
  return { ok: true as const };
}

export async function actualizarUsuario(id: number, input: UsuarioInput) {
  await requireAdmin();
  const d = limpiar(input);
  if (!d.nombre || !d.usuario) return { ok: false as const, error: "Completá nombre y usuario." };
  if (d.rol === "miembro" && !await sucursalValida(d.sucursalId)) return { ok: false as const, error: "Elegí una sucursal activa para el miembro." };

  // El handle debe seguir siendo único (salvo el propio registro)
  const [existe] = await db.select().from(usuarios).where(eq(usuarios.usuario, d.usuario));
  if (existe && existe.id !== id)
    return { ok: false as const, error: "Ya existe un usuario con ese nombre de acceso." };

  const datos: Record<string, unknown> = {
    nombre: d.nombre,
    usuario: d.usuario,
    email: d.email,
    rol: d.rol,
    sucursalId: d.sucursalId,
    permisos: JSON.stringify(d.permisos),
    activo: d.activo,
  };
  if (input.password && input.password.length >= 4) {
    datos.passwordHash = hashPassword(input.password);
  }
  await db.update(usuarios).set(datos).where(eq(usuarios.id, id));
  revalidatePath("/equipo");
  return { ok: true as const };
}

export async function eliminarUsuario(id: number) {
  await requireAdmin();
  // Desvincula como responsable antes de borrar para no dejar referencias huérfanas
  await db.update(waContactos).set({ responsableId: null }).where(eq(waContactos.responsableId, id));
  await db.delete(usuarios).where(eq(usuarios.id, id));
  revalidatePath("/equipo");
  return { ok: true as const };
}

export async function guardarClaveAdministrador(clave: string, confirmacion: string) {
  const admin = await requireAdmin();
  try {
    if (clave !== confirmacion) return { ok: false, error: "Las claves no coinciden." };
    const claveHash = hashClaveAdministrador(clave);
    await db.insert(cajaSeguridad).values({ id: 1, claveHash, actualizadoPor: `${admin.nombre} (${admin.usuario})`, actualizadoEn: new Date() }).onConflictDoUpdate({ target: cajaSeguridad.id, set: { claveHash, actualizadoPor: `${admin.nombre} (${admin.usuario})`, actualizadoEn: new Date() } });
    revalidatePath("/admin/equipo");
    revalidatePath("/admin/caja");
    return { ok: true, error: "" };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la clave." }; }
}
