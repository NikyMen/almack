// Sucursal activa del panel.
//
// El panel siempre trabaja "parado" en algún lado: o en TODAS las sucursales
// (la vista consolidada, que es la de arranque) o dentro de una en particular.
// Eso vive en una cookie, no en la URL, para que la elección sobreviva a la
// navegación entre módulos y a un F5.
//
// `null` = todas. Cualquier valor que no corresponda a una sucursal activa
// también se resuelve como `null`: si borran la sucursal en la que estabas,
// volvés a la vista consolidada en lugar de ver una pantalla vacía.

import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db, sucursales } from "@/db";
import type { Sucursal } from "@/db/schema";
import { getUsuarioActual } from "@/lib/auth";

export const COOKIE_SUCURSAL = "almack_sucursal";
export const TODAS = "todas";

export type ContextoSucursal = {
  /** Sucursales activas, en el orden en que se muestran en el selector. */
  lista: Sucursal[];
  /** Id de la sucursal en la que está parado el panel, o null si es "Todas". */
  activaId: number | null;
  /** La sucursal activa completa, o null en "Todas". */
  activa: Sucursal | null;
};

export async function getSucursales(): Promise<Sucursal[]> {
  try {
    return await db
      .select()
      .from(sucursales)
      .where(eq(sucursales.activo, true))
      .orderBy(asc(sucursales.orden), asc(sucursales.id));
  } catch {
    // La base puede estar pendiente de migración: el panel tiene que seguir
    // abriendo (en modo "Todas") en vez de romper con un 500.
    return [];
  }
}

export async function getContextoSucursal(): Promise<ContextoSucursal> {
  const todas = await getSucursales();
  const usuario = await getUsuarioActual();
  if (usuario?.rol === "miembro") {
    const activa = todas.find(s => s.id === usuario.sucursalId) ?? null;
    return { lista: activa ? [activa] : [], activaId: activa?.id ?? null, activa };
  }
  const lista = todas;
  const store = await cookies();
  const crudo = store.get(COOKIE_SUCURSAL)?.value ?? TODAS;
  const activa = lista.find((s) => String(s.id) === crudo) ?? null;
  return { lista, activaId: activa?.id ?? null, activa };
}

/** Solo el id, para las páginas que no necesitan la lista completa. */
export async function getSucursalActivaId(): Promise<number | null> {
  return (await getContextoSucursal()).activaId;
}

/**
 * Sucursal a la que imputar una operación que SÍ o SÍ necesita una (una venta
 * de caja, una recepción). Si el panel está en "Todas" se usa la primera de la
 * lista, que es el local principal.
 */
export async function sucursalOperativaId(): Promise<number | null> {
  const { activaId, lista } = await getContextoSucursal();
  return activaId ?? lista[0]?.id ?? null;
}

/** Nombre corto para subtítulos: "Todas las sucursales" o el nombre del local. */
export function etiquetaSucursal(s: Sucursal | null): string {
  return s ? s.nombre : "Todas las sucursales";
}
