"use server";

import { db } from "@/db";
import { usuarios, waContactos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { MODULOS } from "@/lib/permisos";

export type UsuarioInput = {
  nombre: string;
  usuario: string;
  email: string;
  rol: "admin" | "miembro";
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
    permisos: input.permisos.filter((p) => MODULO_KEYS.includes(p)),
    activo: Boolean(input.activo),
  };
}

export async function crearUsuario(input: UsuarioInput) {
  await requireAdmin();
  const d = limpiar(input);
  if (!d.nombre || !d.usuario) return { ok: false as const, error: "Completá nombre y usuario." };
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

  // El handle debe seguir siendo único (salvo el propio registro)
  const [existe] = await db.select().from(usuarios).where(eq(usuarios.usuario, d.usuario));
  if (existe && existe.id !== id)
    return { ok: false as const, error: "Ya existe un usuario con ese nombre de acceso." };

  const datos: Record<string, unknown> = {
    nombre: d.nombre,
    usuario: d.usuario,
    email: d.email,
    rol: d.rol,
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
